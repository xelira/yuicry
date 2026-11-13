package main

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var coverClient = &http.Client{Timeout: 15 * time.Second}

func (a *API) handleCover(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.Auth.Current(r); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	raw := r.URL.Query().Get("url")
	target, err := url.Parse(raw)
	if err != nil || target.Scheme != "https" {
		http.Error(w, "плохой адрес", http.StatusBadRequest)
		return
	}
	if !strings.HasSuffix(target.Host, "dzcdn.net") {
		http.Error(w, "чужой хост", http.StatusBadRequest)
		return
	}

	response, err := coverClient.Get(target.String())
	if err != nil {
		http.Error(w, "обложка недоступна", http.StatusBadGateway)
		return
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		http.Error(w, "обложка недоступна", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", response.Header.Get("Content-Type"))
	w.Header().Set("Cache-Control", "public, max-age=86400")
	io.Copy(w, io.LimitReader(response.Body, 4<<20))
}
