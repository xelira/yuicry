package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"time"
)

type recognizeResult struct {
	Title  string `json:"title"`
	Artist string `json:"artist"`
	Album  string `json:"album"`
	Cover  string `json:"cover"`
	Shazam string `json:"shazam"`
}

func (a *API) handleRecognize(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	if !a.Assistant.allow(current.UserID) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "слишком много запросов"})
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 12<<20))
	if err != nil || len(body) < 1024 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "пустая запись"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 40*time.Second)
	defer cancel()

	file, err := os.CreateTemp("", "yuicry-recognize-*.wav")
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "не удалось подготовить запись"})
		return
	}

	name := file.Name()
	file.Close()
	defer os.Remove(name)

	command := exec.CommandContext(
		ctx,
		env("FFMPEG", "ffmpeg"),
		"-hide_banner",
		"-loglevel", "error",
		"-y",
		"-i", "pipe:0",
		"-f", "wav",
		"-ar", "44100",
		"-ac", "1",
		name,
	)
	command.Stdin = bytes.NewReader(body)

	if err := command.Run(); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "не удалось прочитать запись"})
		return
	}

	wav, err := os.ReadFile(name)
	if err != nil || len(wav) < 32000 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "не удалось прочитать запись"})
		return
	}

	endpoint := env("RECOGNIZE_URL", "http://127.0.0.1:8792") + "/recognize"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(wav))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "распознавание недоступно"})
		return
	}

	request.Header.Set("Content-Type", "audio/wav")

	response, err := a.TTS.Do(request)
	if err != nil {
		log.Printf("recognize: запрос: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "распознавание недоступно"})
		return
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusNotFound {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "не удалось распознать"})
		return
	}

	if response.StatusCode != http.StatusOK {
		log.Printf("recognize: статус %d", response.StatusCode)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "распознавание недоступно"})
		return
	}

	var result recognizeResult
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&result); err != nil || result.Title == "" {
		log.Printf("recognize: разбор: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "распознавание недоступно"})
		return
	}

	tracks := a.searchTracks(ctx, result.Title+" "+result.Artist, 5)
	if len(tracks) == 0 {
		tracks = a.searchTracks(ctx, result.Title, 5)
	}

	cover := result.Cover
	if len(tracks) > 0 && tracks[0].Cover != "" {
		cover = tracks[0].Cover
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"title":  result.Title,
		"artist": result.Artist,
		"album":  result.Album,
		"cover":  cover,
		"shazam": result.Shazam,
		"tracks": tracks,
	})
}
