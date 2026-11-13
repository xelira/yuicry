package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
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

type Streamer struct {
	Storage storage.Storage
	Deezer  *Deezer
	TempDir string
	YTDLP   string
	Cookies string
	Client  *http.Client
	slots   chan struct{}

	mu           sync.Mutex
	jobs         map[string]*downloadJob
	blockedUntil time.Time
}

func NewStreamer(target storage.Storage, deezer *Deezer, tempDir, ytdlp, cookies string, slots int) *Streamer {
	if slots < 1 {
		slots = 1
	}

	return &Streamer{
		Storage: target,
		Deezer:  deezer,
		TempDir: tempDir,
		YTDLP:   ytdlp,
		Cookies: cookies,
		Client:  &http.Client{Timeout: 90 * time.Second},
		slots:   make(chan struct{}, slots),
		jobs:    make(map[string]*downloadJob),
	}
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

	if track.Preview != "" {
		if data, err := s.fromPreview(ctx, track.Preview); err == nil {
			return data, nil
		} else {
			log.Printf("preview %s: %v", id, err)
		}
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

func (s *Streamer) fromPreview(ctx context.Context, preview string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, preview, nil)
	if err != nil {
		return nil, err
	}

	response, err := s.Client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("preview: %s", response.Status)
	}

	return io.ReadAll(io.LimitReader(response.Body, 12<<20))
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
