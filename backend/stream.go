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
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/xelira/yuicry/backend/internal/storage"
)

type Streamer struct {
	Storage storage.Storage
	Deezer  *Deezer
	TempDir string
	YTDLP   string
	Cookies string
	Client  *http.Client
	group   singleflight.Group
}

func NewStreamer(target storage.Storage, deezer *Deezer, tempDir, ytdlp, cookies string) *Streamer {
	return &Streamer{
		Storage: target,
		Deezer:  deezer,
		TempDir: tempDir,
		YTDLP:   ytdlp,
		Cookies: cookies,
		Client:  &http.Client{Timeout: 90 * time.Second},
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

	data, err := s.fetch(id)
	if err != nil {
		http.Error(w, "трек недоступен: "+err.Error(), http.StatusBadGateway)
		return
	}

	s.upload(id, data)

	w.Header().Set("Content-Type", audioType(data))
	http.ServeContent(w, r, id+".m4a", time.Time{}, bytes.NewReader(data))
}

func (s *Streamer) serveStored(w http.ResponseWriter, r *http.Request, id string, size int64) {
	head, err := s.Storage.ReadAt(r.Context(), id, 0, 4)
	if err == nil {
		w.Header().Set("Content-Type", audioType(head))
	}

	reader := &storageReader{
		ctx:     r.Context(),
		storage: s.Storage,
		id:      id,
		size:    size,
	}
	http.ServeContent(w, r, id+".m4a", time.Time{}, reader)
}

func (s *Streamer) fetch(id string) ([]byte, error) {
	value, err, _ := s.group.Do(id, func() (any, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		return s.download(ctx, id)
	})
	if err != nil {
		return nil, err
	}
	return value.([]byte), nil
}

func (s *Streamer) download(ctx context.Context, id string) ([]byte, error) {
	track, err := s.Deezer.Track(ctx, id)
	if err != nil {
		return nil, err
	}

	queries := []string{
		"ytsearch1:" + track.Artist + " " + track.Title,
		"ytsearch1:" + track.Title,
	}

	for _, query := range queries {
		if data, err := s.fromYouTube(ctx, id, query); err == nil {
			return data, nil
		} else {
			log.Printf("yt-dlp %s %q: %v", id, query, err)
		}
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

func (s *Streamer) fromYouTube(ctx context.Context, id, query string) ([]byte, error) {
	workDir, err := os.MkdirTemp(s.TempDir, "yuicry-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(workDir)

	pattern := filepath.Join(workDir, id+".%(ext)s")

	args := []string{
		"-f", "bestaudio[ext=m4a]/bestaudio/best",
		"--no-playlist",
		"--quiet",
		"--no-warnings",
	}

	if s.Cookies != "" {
		if data, err := os.ReadFile(s.Cookies); err == nil {
			local := filepath.Join(workDir, "cookies.txt")
			if err := os.WriteFile(local, data, 0o600); err == nil {
				args = append(args, "--cookies", local)
			}
		}
	}

	args = append(args, "--output", pattern, query)

	command := exec.CommandContext(ctx, s.YTDLP, args...)
	if output, err := command.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("yt-dlp: %v %s", err, output)
	}

	matches, err := filepath.Glob(filepath.Join(workDir, id+".*"))
	if err != nil || len(matches) == 0 {
		return nil, errors.New("yt-dlp не оставил файл")
	}

	return os.ReadFile(matches[0])
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

func (s *Streamer) upload(id string, data []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	if err := s.Storage.Put(ctx, id, data); err != nil {
		log.Printf("не удалось сохранить трек %s: %v", id, err)
	}
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
