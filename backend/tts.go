package main

import (
	"io"
	"net/http"
	"net/url"
	"strings"
)

func (a *API) handleTTS(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.Auth.Current(r); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	text := strings.TrimSpace(r.URL.Query().Get("text"))
	if text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "нужен текст"})
		return
	}

	runes := []rune(text)
	if len(runes) > 600 {
		text = string(runes[:600])
	}

	endpoint := env("TTS_URL", "http://127.0.0.1:8790") + "/tts?text=" + url.QueryEscape(text)
	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, endpoint, nil)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "озвучка недоступна"})
		return
	}

	response, err := a.TTS.Do(request)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "озвучка недоступна"})
		return
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "озвучка недоступна"})
		return
	}

	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = io.Copy(w, response.Body)
}
