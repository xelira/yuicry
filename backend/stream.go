package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/xelira/yuicry/backend/internal/storage"
)

type DownloadStatus struct {
	ID      string `json:"id"`
	State   string `json:"state"`
	Percent int    `json:"percent"`
	Bytes   int64  `json:"bytes"`
	Total   int64  `json:"total"`
	Error   string `json:"error,omitempty"`
}

type downloadJob struct {
	status   DownloadStatus
	done     chan struct{}
	failedAt time.Time
}

type directStream struct {
	URL         string
	Headers     http.Header
	ContentType string
	Duration    float64
	At          time.Time
	Expires     time.Time
}

type Streamer struct {
	Storage      storage.Storage
	Deezer       *Deezer
	TempDir      string
	YTDLP        string
	Cookies      string
	Client       *http.Client
	StreamClient *http.Client
	slots        chan struct{}

	mu           sync.Mutex
	jobs         map[string]*downloadJob
	blockedUntil time.Time

	directMu     sync.Mutex
	direct       map[string]directStream
	pending      map[string]chan struct{}
	resolveSlots chan struct{}
	prefetch     chan string

	preemptMu     sync.Mutex
	preemptID     string
	preemptCancel context.CancelFunc
}

func NewStreamer(target storage.Storage, deezer *Deezer, tempDir, ytdlp, cookies string, slots int) *Streamer {
	if slots < 1 {
		slots = 1
	}

	streamer := &Streamer{
		Storage:      target,
		Deezer:       deezer,
		TempDir:      tempDir,
		YTDLP:        ytdlp,
		Cookies:      cookies,
		Client:       &http.Client{Timeout: 90 * time.Second},
		StreamClient: &http.Client{},
		slots:        make(chan struct{}, slots),
		jobs:         make(map[string]*downloadJob),
		direct:       make(map[string]directStream),
		pending:      make(map[string]chan struct{}),
		resolveSlots: make(chan struct{}, 1),
		prefetch:     make(chan string, 1),
	}

	go streamer.prefetchLoop()

	return streamer
}

func (s *Streamer) Handle(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := storage.ValidID(id); err != nil {
		http.Error(w, "плохой id", http.StatusBadRequest)
		return
	}

	size, err := s.Storage.Size(r.Context(), id)
	if err == nil {
		s.serveStored(w, r, id, size)
		return
	}

	if s.serveDirect(w, r, id) {
		return
	}

	job := s.Ensure(id)

	select {
	case <-job.done:
	case <-r.Context().Done():
		return
	}

	status := s.snapshot(job)
	if status.State != "done" {
		http.Error(w, "трек недоступен: "+status.Error, http.StatusBadGateway)
		return
	}

	size, err = s.Storage.Size(r.Context(), id)
	if err != nil {
		http.Error(w, "трек недоступен", http.StatusBadGateway)
		return
	}

	s.serveStored(w, r, id, size)
}

const (
	directTTL     = 90 * time.Minute
	maxCacheBytes = 32 << 20
)

func (s *Streamer) serveDirect(w http.ResponseWriter, r *http.Request, id string) bool {
	if r.Method != http.MethodGet {
		return false
	}

	entry, err := s.resolveDirect(r.Context(), id)
	if err != nil {
		return false
	}

	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, entry.URL, nil)
	if err != nil {
		return false
	}

	for name, values := range entry.Headers {
		for _, value := range values {
			request.Header.Add(name, value)
		}
	}

	if request.Header.Get("User-Agent") == "" {
		request.Header.Set("User-Agent", "Mozilla/5.0")
	}

	rangeHeader := r.Header.Get("Range")
	if rangeHeader != "" {
		request.Header.Set("Range", rangeHeader)
	}

	response, err := s.StreamClient.Do(request)
	if err != nil {
		log.Printf("direct %s: %v", id, err)
		s.forgetDirect(id)
		return false
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusPartialContent {
		log.Printf("direct %s: %s", id, response.Status)
		s.forgetDirect(id)
		return false
	}

	start, _ := rangeStart(rangeHeader)
	if rangeHeader != "" && response.StatusCode == http.StatusOK && start > 0 {
		return false
	}

	contentType := response.Header.Get("Content-Type")
	if contentType == "" || strings.Contains(contentType, "octet-stream") {
		contentType = entry.ContentType
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Yuicry-Stream", "direct")

	for _, name := range []string{"Content-Range", "Content-Length", "ETag", "Last-Modified"} {
		if value := response.Header.Get(name); value != "" {
			w.Header().Set(name, value)
		}
	}

	w.WriteHeader(response.StatusCode)

	sink := s.openSink(response, start)

	body := io.Reader(response.Body)
	if sink != nil {
		body = io.TeeReader(response.Body, sink)
	}

	written, copyErr := io.Copy(w, body)
	if copyErr != nil {
		log.Printf("direct %s: %v", id, copyErr)
	}

	if sink != nil {
		s.finishSink(id, sink, written, response)
	}

	return true
}

func (s *Streamer) openSink(response *http.Response, start int64) *os.File {
	if start > 0 || !coversWholeFile(response) {
		return nil
	}

	if response.ContentLength <= 0 || response.ContentLength > maxCacheBytes {
		return nil
	}

	file, err := os.CreateTemp(s.TempDir, "yuicry-cache-")
	if err != nil {
		return nil
	}

	return file
}

func (s *Streamer) finishSink(id string, file *os.File, written int64, response *http.Response) {
	path := file.Name()

	if err := file.Close(); err != nil {
		os.Remove(path)
		return
	}

	if !coversWholeFile(response) || response.ContentLength <= 0 || written != response.ContentLength {
		os.Remove(path)
		return
	}

	go s.storeFile(id, path)
}

func (s *Streamer) storeFile(id, path string) {
	defer os.Remove(path)

	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	if err := s.Storage.Put(ctx, id, data); err != nil {
		log.Printf("cache %s: %v", id, err)
	}
}

func coversWholeFile(response *http.Response) bool {
	if response.StatusCode == http.StatusOK {
		return true
	}

	if response.StatusCode != http.StatusPartialContent {
		return false
	}

	value := strings.TrimSpace(response.Header.Get("Content-Range"))
	if !strings.HasPrefix(value, "bytes ") {
		return false
	}

	value = strings.TrimPrefix(value, "bytes ")
	parts := strings.SplitN(value, "/", 2)
	if len(parts) != 2 {
		return false
	}

	total, err := strconv.ParseInt(strings.TrimSpace(parts[1]), 10, 64)
	if err != nil {
		return false
	}

	bounds := strings.SplitN(parts[0], "-", 2)
	if len(bounds) != 2 {
		return false
	}

	from, err := strconv.ParseInt(strings.TrimSpace(bounds[0]), 10, 64)
	if err != nil {
		return false
	}

	to, err := strconv.ParseInt(strings.TrimSpace(bounds[1]), 10, 64)
	if err != nil {
		return false
	}

	return from == 0 && to+1 >= total
}

func (s *Streamer) HandlePrepare(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := storage.ValidID(id); err != nil {
		http.Error(w, "плохой id", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusNoContent)

	if _, err := s.Storage.Size(r.Context(), id); err == nil {
		return
	}

	select {
	case s.prefetch <- id:
		return
	default:
	}

	select {
	case <-s.prefetch:
	default:
	}

	select {
	case s.prefetch <- id:
	default:
	}
}

func (s *Streamer) prefetchLoop() {
	for id := range s.prefetch {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)

		s.preemptMu.Lock()
		s.preemptID = id
		s.preemptCancel = cancel
		s.preemptMu.Unlock()

		entry, err := s.resolvePrefetch(ctx, id)

		s.preemptMu.Lock()
		s.preemptID = ""
		s.preemptCancel = nil
		s.preemptMu.Unlock()
		cancel()

		if err != nil {
			if !errors.Is(err, context.Canceled) {
				log.Printf("prepare %s: %v", id, err)
			}
			continue
		}

		log.Printf("prepare %s: %s", id, entry.ContentType)
	}
}

func (s *Streamer) stopPrefetch(id string) {
	s.preemptMu.Lock()
	cancel := s.preemptCancel
	other := s.preemptID != "" && s.preemptID != id
	s.preemptMu.Unlock()

	if cancel != nil && other {
		cancel()
	}
}

func (s *Streamer) resolveDirect(ctx context.Context, id string) (directStream, error) {
	s.stopPrefetch(id)
	return s.resolveEntry(ctx, id)
}

func (s *Streamer) resolvePrefetch(ctx context.Context, id string) (directStream, error) {
	return s.resolveEntry(ctx, id)
}

func (s *Streamer) resolveEntry(ctx context.Context, id string) (directStream, error) {
	for {
		s.directMu.Lock()
		if entry, ok := s.direct[id]; ok && freshDirect(entry) {
			s.directMu.Unlock()
			return entry, nil
		}

		if wait, ok := s.pending[id]; ok {
			s.directMu.Unlock()

			select {
			case <-wait:
				continue
			case <-ctx.Done():
				return directStream{}, ctx.Err()
			}
		}

		wait := make(chan struct{})
		s.pending[id] = wait
		s.directMu.Unlock()

		entry, err := s.resolveDirectOnce(ctx, id)

		s.directMu.Lock()
		if err == nil {
			s.direct[id] = entry
		}
		delete(s.pending, id)
		close(wait)
		s.directMu.Unlock()

		return entry, err
	}
}

func (s *Streamer) resolveDirectOnce(ctx context.Context, id string) (directStream, error) {
	ctx, cancel := context.WithTimeout(ctx, 35*time.Second)
	defer cancel()

	select {
	case s.resolveSlots <- struct{}{}:
		defer func() { <-s.resolveSlots }()
	case <-ctx.Done():
		return directStream{}, ctx.Err()
	}

	track, err := s.Deezer.Track(ctx, id)
	if err != nil {
		return directStream{}, err
	}

	title := strings.TrimSpace(track.Artist + " " + track.Title)

	if s.youtubeReady() {
		for _, query := range []string{"ytsearch1:" + title, "ytsearch1:" + track.Title} {
			info, err := s.ytdlpInfoWithTimeout(ctx, query, "")
			if err != nil {
				log.Printf("direct yt %s %q: %v", id, query, err)
				if isBotCheck(err) {
					s.blockYouTube()
					break
				}
				continue
			}

			if entry, ok := directEntry(track, info); ok {
				s.storeDirect(id, entry)
				return entry, nil
			}
		}
	}

	filter := ""
	if track.Duration > 10 {
		filter = fmt.Sprintf("duration>%d & duration<%d", track.Duration-15, track.Duration+15)
	}

	for _, query := range []string{"scsearch5:" + title, "scsearch5:" + track.Title} {
		info, err := s.ytdlpInfoWithTimeout(ctx, query, filter)
		if err != nil {
			log.Printf("direct sc %s %q: %v", id, query, err)
			continue
		}

		if entry, ok := directEntry(track, info); ok {
			s.storeDirect(id, entry)
			return entry, nil
		}
	}

	return directStream{}, errors.New("прямой источник не найден")
}

func (s *Streamer) forgetDirect(id string) {
	s.directMu.Lock()
	delete(s.direct, id)
	s.directMu.Unlock()
}

func (s *Streamer) storeDirect(id string, entry directStream) {
	s.directMu.Lock()
	s.direct[id] = entry
	s.directMu.Unlock()
}

type ytdlpInfo struct {
	URL         string            `json:"url"`
	Ext         string            `json:"ext"`
	Duration    float64           `json:"duration"`
	HTTPHeaders map[string]string `json:"http_headers"`
	Entries     []json.RawMessage `json:"entries"`
}

func (s *Streamer) ytdlpInfoWithTimeout(ctx context.Context, query, filter string) (ytdlpInfo, error) {
	callCtx, cancel := context.WithTimeout(ctx, 18*time.Second)
	defer cancel()

	return s.ytdlpInfo(callCtx, query, filter)
}

func (s *Streamer) ytdlpInfo(ctx context.Context, query, filter string) (ytdlpInfo, error) {
	args := []string{
		"-f", "bestaudio[ext=m4a]/bestaudio",
		"--no-playlist",
		"--no-warnings",
		"--socket-timeout", "10",
		"--print", "%(url)s",
		"--print", "%(ext)s",
		"--print", "%(duration)s",
		"--print", "%(http_headers)j",
	}

	if filter != "" {
		args = append(args, "--match-filter", filter)
	}

	if s.Cookies != "" {
		if _, err := os.Stat(s.Cookies); err == nil {
			if dir, err := os.MkdirTemp(s.TempDir, "yuicry-info-"); err == nil {
				defer os.RemoveAll(dir)

				local := filepath.Join(dir, "cookies.txt")
				if data, err := os.ReadFile(s.Cookies); err == nil {
					if err := os.WriteFile(local, data, 0o600); err == nil {
						args = append(args, "--cookies", local)
					}
				}
			}
		}
	}

	args = append(args, query)

	var stdout, stderr bytes.Buffer

	command := exec.CommandContext(ctx, s.YTDLP, args...)
	command.Stdout = &stdout
	command.Stderr = &stderr

	if err := command.Run(); err != nil {
		return ytdlpInfo{}, fmt.Errorf("yt-dlp: %v %s", err, truncateText(stderr.String(), 4000))
	}

	lines := strings.Split(strings.ReplaceAll(stdout.String(), "\r\n", "\n"), "\n")

	var fields []string
	for _, line := range lines {
		if line = strings.TrimSpace(line); line != "" {
			fields = append(fields, line)
		}
	}

	if len(fields) < 3 {
		return ytdlpInfo{}, errors.New("yt-dlp не вернул ссылку")
	}

	info := ytdlpInfo{
		URL: fields[0],
		Ext: fields[1],
	}

	if info.URL == "" || info.URL == "NA" {
		return ytdlpInfo{}, errors.New("нет прямой ссылки")
	}

	if duration, err := strconv.ParseFloat(fields[2], 64); err == nil {
		info.Duration = duration
	}

	if len(fields) >= 4 && strings.HasPrefix(fields[3], "{") {
		_ = json.Unmarshal([]byte(fields[3]), &info.HTTPHeaders)
	}

	return info, nil
}

func truncateText(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) <= limit {
		return value
	}
	return value[:limit] + "…"
}

func directEntry(track Track, info ytdlpInfo) (directStream, bool) {
	ext := strings.ToLower(strings.TrimSpace(info.Ext))
	url := strings.TrimSpace(info.URL)

	if url == "" || strings.Contains(url, ".m3u8") || strings.Contains(url, ".mpd") {
		return directStream{}, false
	}

	switch ext {
	case "m4a", "mp3", "webm", "opus", "ogg":
	default:
		return directStream{}, false
	}

	if info.Duration > 0 && track.Duration > 0 && math.Abs(info.Duration-float64(track.Duration)) > 20 {
		return directStream{}, false
	}

	headers := make(http.Header)
	for name, value := range info.HTTPHeaders {
		if strings.TrimSpace(value) != "" {
			headers.Set(name, value)
		}
	}

	return directStream{
		URL:         url,
		Headers:     headers,
		ContentType: directContentType(ext),
		Duration:    info.Duration,
		At:          time.Now(),
		Expires:     directExpiry(url),
	}, true
}

func freshDirect(entry directStream) bool {
	if time.Since(entry.At) >= directTTL {
		return false
	}

	if !entry.Expires.IsZero() && time.Now().After(entry.Expires.Add(-5*time.Minute)) {
		return false
	}

	return true
}

func directExpiry(raw string) time.Time {
	parsed, err := url.Parse(raw)
	if err != nil {
		return time.Time{}
	}

	value := parsed.Query().Get("expire")
	if value == "" {
		return time.Time{}
	}

	seconds, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return time.Time{}
	}

	return time.Unix(seconds, 0)
}

func directContentType(ext string) string {
	switch ext {
	case "m4a":
		return "audio/mp4"
	case "mp3":
		return "audio/mpeg"
	case "webm":
		return "audio/webm"
	case "opus", "ogg":
		return "audio/ogg"
	default:
		return "audio/mpeg"
	}
}

func rangeStart(value string) (int64, bool) {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, "bytes=") {
		return 0, false
	}

	value = strings.TrimPrefix(value, "bytes=")
	value = strings.SplitN(value, "-", 2)[0]

	start, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, false
	}

	return start, true
}

func (s *Streamer) Start(id string) DownloadStatus {
	if _, err := s.Storage.Size(context.Background(), id); err == nil {
		return DownloadStatus{ID: id, State: "done", Percent: 100}
	}

	job := s.Ensure(id)
	return s.snapshot(job)
}

func (s *Streamer) Ensure(id string) *downloadJob {
	s.mu.Lock()
	if job, ok := s.jobs[id]; ok {
		if job.status.State != "error" || time.Since(job.failedAt) < 20*time.Second {
			s.mu.Unlock()
			return job
		}

		delete(s.jobs, id)
	}

	job := &downloadJob{
		status: DownloadStatus{ID: id, State: "queued"},
		done:   make(chan struct{}),
	}
	s.jobs[id] = job
	s.mu.Unlock()

	go s.run(job)
	return job
}

func (s *Streamer) snapshot(job *downloadJob) DownloadStatus {
	s.mu.Lock()
	defer s.mu.Unlock()

	return job.status
}

func (s *Streamer) Status(id string) DownloadStatus {
	s.mu.Lock()
	defer s.mu.Unlock()

	if job, ok := s.jobs[id]; ok {
		return job.status
	}

	return DownloadStatus{ID: id, State: "missing"}
}

func (s *Streamer) run(job *downloadJob) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	case <-ctx.Done():
		s.fail(job, ctx.Err())
		return
	}

	s.update(job, DownloadStatus{ID: job.status.ID, State: "downloading"})

	data, err := s.download(ctx, job.status.ID, func(downloaded, total int64) {
		percent := 0
		if total > 0 {
			percent = int(float64(downloaded) / float64(total) * 100)
			if percent > 99 {
				percent = 99
			}
		}

		s.update(job, DownloadStatus{
			ID:      job.status.ID,
			State:   "downloading",
			Percent: percent,
			Bytes:   downloaded,
			Total:   total,
		})
	})
	if err != nil {
		s.fail(job, err)
		return
	}

	if err := s.upload(job.status.ID, data); err != nil {
		s.fail(job, err)
		return
	}

	s.mu.Lock()
	job.status = DownloadStatus{
		ID:      job.status.ID,
		State:   "done",
		Percent: 100,
		Bytes:   int64(len(data)),
		Total:   int64(len(data)),
	}
	close(job.done)
	s.mu.Unlock()
}

func (s *Streamer) update(job *downloadJob, status DownloadStatus) {
	s.mu.Lock()
	job.status = status
	s.mu.Unlock()
}

func (s *Streamer) fail(job *downloadJob, err error) {
	s.mu.Lock()
	job.status.State = "error"
	job.status.Error = err.Error()
	job.failedAt = time.Now()
	close(job.done)
	s.mu.Unlock()
}

func (s *Streamer) ServeStored(w http.ResponseWriter, r *http.Request, id string, size int64) {
	s.serveStored(w, r, id, size)
}

func (s *Streamer) serveStored(w http.ResponseWriter, r *http.Request, id string, size int64) {
	head, err := s.Storage.ReadAt(r.Context(), id, 0, 4)
	if err == nil {
		w.Header().Set("Content-Type", audioType(head))
	}

	w.Header().Set("Cache-Control", "private, max-age=86400")

	reader := &storageReader{
		ctx:     r.Context(),
		storage: s.Storage,
		id:      id,
		size:    size,
	}
	http.ServeContent(w, r, id+".m4a", time.Time{}, reader)
}

func (s *Streamer) download(ctx context.Context, id string, report func(int64, int64)) ([]byte, error) {
	track, err := s.Deezer.Track(ctx, id)
	if err != nil {
		return nil, err
	}

	title := strings.TrimSpace(track.Artist + " " + track.Title)

	if s.youtubeReady() {
		for _, query := range []string{"ytsearch1:" + title, "ytsearch1:" + track.Title} {
			data, err := s.fromYouTube(ctx, id, query, report)
			if err == nil {
				return data, nil
			}

			log.Printf("yt-dlp %s %q: %v", id, query, err)

			if isBotCheck(err) {
				s.blockYouTube()
				break
			}
		}
	}

	if data, err := s.fromSoundCloud(ctx, id, track, report); err == nil {
		return data, nil
	} else {
		log.Printf("soundcloud %s: %v", id, err)
	}

	return nil, errors.New("источник недоступен")
}

func (s *Streamer) youtubeReady() bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	return time.Now().After(s.blockedUntil)
}

func (s *Streamer) blockYouTube() {
	s.mu.Lock()
	s.blockedUntil = time.Now().Add(15 * time.Minute)
	s.mu.Unlock()
}

func isBotCheck(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "not a bot") || strings.Contains(message, "sign in to confirm")
}

func (s *Streamer) fromYouTube(ctx context.Context, id, query string, report func(int64, int64)) ([]byte, error) {
	return s.fetchAudio(ctx, id, []string{query}, report)
}

func (s *Streamer) fromSoundCloud(ctx context.Context, id string, track Track, report func(int64, int64)) ([]byte, error) {
	queries := []string{
		"scsearch5:" + strings.TrimSpace(track.Artist+" "+track.Title),
		"scsearch5:" + track.Title,
	}

	filter := ""
	if track.Duration > 10 {
		filter = fmt.Sprintf("duration>%d & duration<%d", track.Duration-15, track.Duration+15)
	}

	for _, query := range queries {
		args := []string{"--max-downloads", "1"}

		if filter != "" {
			args = append(args, "--match-filter", filter)
		}

		args = append(args, query)

		if data, err := s.fetchAudio(ctx, id, args, report); err == nil {
			return data, nil
		} else {
			log.Printf("sc-dlp %s %q: %v", id, query, err)
		}
	}

	return nil, errors.New("soundcloud не нашёл трек")
}

func (s *Streamer) fetchAudio(ctx context.Context, id string, extra []string, report func(int64, int64)) ([]byte, error) {
	workDir, err := os.MkdirTemp(s.TempDir, "yuicry-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(workDir)

	pattern := filepath.Join(workDir, id+".%(ext)s")

	args := []string{
		"-f", "bestaudio[ext=m4a]/bestaudio/best",
		"--no-playlist",
		"--newline",
		"--no-warnings",
		"--progress-template", "download:yuicry %(progress.downloaded_bytes)s %(progress.total_bytes)s",
	}

	if s.Cookies != "" {
		if data, err := os.ReadFile(s.Cookies); err == nil {
			local := filepath.Join(workDir, "cookies.txt")
			if err := os.WriteFile(local, data, 0o600); err == nil {
				args = append(args, "--cookies", local)
			}
		}
	}

	args = append(args, extra...)
	args = append(args, "--output", pattern)

	writer := &progressWriter{onLine: func(line string) {
		parseProgress(line, report)
	}}

	command := exec.CommandContext(ctx, s.YTDLP, args...)
	command.Stdout = writer
	command.Stderr = writer

	runErr := command.Run()

	matches, err := filepath.Glob(filepath.Join(workDir, id+".*"))
	if err != nil {
		return nil, err
	}

	for _, match := range matches {
		if strings.HasSuffix(match, ".part") || strings.HasSuffix(match, ".ytdl") {
			continue
		}

		data, err := os.ReadFile(match)
		if err != nil || len(data) == 0 {
			continue
		}

		return data, nil
	}

	if runErr != nil {
		return nil, fmt.Errorf("yt-dlp: %v %s", runErr, writer.tail())
	}

	return nil, errors.New("yt-dlp не оставил файл")
}

func (s *Streamer) upload(id string, data []byte) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	if err := s.Storage.Put(ctx, id, data); err != nil {
		log.Printf("не удалось сохранить трек %s: %v", id, err)
		return err
	}

	return nil
}

func parseProgress(line string, report func(int64, int64)) {
	if report == nil || !strings.HasPrefix(line, "yuicry ") {
		return
	}

	parts := strings.Fields(strings.TrimPrefix(line, "yuicry "))
	if len(parts) != 2 {
		return
	}

	downloaded, first := strconv.ParseInt(parts[0], 10, 64)
	total, second := strconv.ParseInt(parts[1], 10, 64)

	if first == nil && second == nil && total > 0 {
		report(downloaded, total)
	}
}

type progressWriter struct {
	mu     sync.Mutex
	buf    []byte
	trail  []byte
	onLine func(string)
}

func (w *progressWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.buf = append(w.buf, p...)
	w.trail = append(w.trail, p...)
	if len(w.trail) > 4096 {
		w.trail = w.trail[len(w.trail)-4096:]
	}

	for {
		index := bytes.IndexByte(w.buf, '\n')
		if index < 0 {
			break
		}

		line := strings.TrimSpace(string(w.buf[:index]))
		w.buf = w.buf[index+1:]

		if line != "" && w.onLine != nil {
			w.onLine(line)
		}
	}

	return len(p), nil
}

func (w *progressWriter) tail() string {
	w.mu.Lock()
	defer w.mu.Unlock()

	return string(w.trail)
}

func audioType(data []byte) string {
	if len(data) >= 3 && string(data[:3]) == "ID3" {
		return "audio/mpeg"
	}
	if len(data) >= 2 && data[0] == 0xFF && data[1]&0xE0 == 0xE0 {
		return "audio/mpeg"
	}
	if len(data) >= 4 && data[0] == 0x1A && data[1] == 0x45 && data[2] == 0xDF && data[3] == 0xA3 {
		return "audio/webm"
	}
	return "audio/mp4"
}

const readAhead = 512 * 1024

type storageReader struct {
	ctx     context.Context
	storage storage.Storage
	id      string
	size    int64
	offset  int64
	chunk   []byte
	chunkAt int64
}

func (s *storageReader) Read(buffer []byte) (int, error) {
	if s.offset >= s.size {
		return 0, io.EOF
	}

	if s.chunk == nil || s.offset < s.chunkAt || s.offset >= s.chunkAt+int64(len(s.chunk)) {
		length := readAhead
		if remaining := s.size - s.offset; int64(length) > remaining {
			length = int(remaining)
		}

		data, err := s.storage.ReadAt(s.ctx, s.id, s.offset, length)
		if err != nil {
			return 0, err
		}
		if len(data) == 0 {
			return 0, io.EOF
		}

		s.chunk = data
		s.chunkAt = s.offset
	}

	count := copy(buffer, s.chunk[s.offset-s.chunkAt:])
	s.offset += int64(count)
	return count, nil
}

func (s *storageReader) Seek(offset int64, whence int) (int64, error) {
	switch whence {
	case io.SeekStart:
		s.offset = offset
	case io.SeekCurrent:
		s.offset += offset
	case io.SeekEnd:
		s.offset = s.size + offset
	default:
		return 0, errors.New("плохой whence")
	}

	if s.offset < 0 {
		s.offset = 0
	}
	return s.offset, nil
}
