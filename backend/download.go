package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/xelira/yuicry/backend/internal/storage"
)

func (a *API) handleDownloadStart(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.Auth.Current(r); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	id := r.PathValue("id")
	if err := storage.ValidID(id); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохой id"})
		return
	}

	writeJSON(w, http.StatusAccepted, a.Streamer.Start(id))
}

func (a *API) handleDownloadStatus(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.Auth.Current(r); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	id := r.PathValue("id")
	if err := storage.ValidID(id); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохой id"})
		return
	}

	writeJSON(w, http.StatusOK, a.Streamer.Start(id))
}

func (a *API) handleDownloadEvents(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.Auth.Current(r); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	id := r.PathValue("id")
	if err := storage.ValidID(id); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохой id"})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "поток недоступен", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	a.Streamer.Start(id)

	last := ""
	ticks := 0
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		status := a.Streamer.Status(id)
		body, err := json.Marshal(status)

		if err == nil && string(body) != last {
			fmt.Fprintf(w, "data: %s\n\n", body)
			flusher.Flush()
			last = string(body)
		}

		if status.State == "done" || status.State == "error" {
			return
		}

		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			ticks += 1
			if ticks%30 == 0 {
				fmt.Fprint(w, ": ping\n\n")
				flusher.Flush()
			}
		}
	}
}
