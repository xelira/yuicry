package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os/exec"
	"time"
)

func (a *API) handleTranscribe(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.Auth.Current(r); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 12<<20))
	if err != nil || len(body) < 1024 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "пустая запись"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	ffmpeg := env("FFMPEG", "ffmpeg")
	command := exec.CommandContext(
		ctx,
		ffmpeg,
		"-hide_banner",
		"-loglevel", "error",
		"-i", "pipe:0",
		"-f", "s16le",
		"-ac", "1",
		"-ar", "16000",
		"pipe:1",
	)
	command.Stdin = bytes.NewReader(body)

	var pcm bytes.Buffer
	command.Stdout = &pcm

	if err := command.Run(); err != nil || pcm.Len() < 3200 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "не удалось прочитать запись"})
		return
	}

	endpoint := env("STT_URL", "http://127.0.0.1:8791") + "/transcribe"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(pcm.Bytes()))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "распознавание недоступно"})
		return
	}

	request.Header.Set("Content-Type", "application/octet-stream")

	response, err := a.TTS.Do(request)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "распознавание недоступно"})
		return
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "распознавание недоступно"})
		return
	}

	var result struct {
		Text string `json:"text"`
	}

	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&result); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "распознавание недоступно"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"text": result.Text})
}
