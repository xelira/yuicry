package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

func (a *API) handlePlayback(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	state, err := a.Store.Playback(current.UserID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{})
		return
	}

	writeJSON(w, http.StatusOK, state)
}

func (a *API) handleSavePlayback(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	var body struct {
		Device   string  `json:"device"`
		Track    Track   `json:"track"`
		Position float64 `json:"position"`
		Playing  bool    `json:"playing"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохое тело"})
		return
	}
	if body.Device == "" || body.Track.ID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "нет устройства или трека"})
		return
	}

	state := PlaybackState{
		Device:    body.Device,
		Track:     body.Track,
		Position:  body.Position,
		Playing:   body.Playing,
		UpdatedAt: time.Now().Unix(),
	}

	if err := a.Store.SavePlayback(current.UserID, state); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "не удалось сохранить"})
		return
	}

	a.Playback.Publish(current.UserID, state)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) handlePlaybackStream(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
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

	sub := a.Playback.Subscribe(current.UserID)
	defer a.Playback.Unsubscribe(current.UserID, sub)

	if state, err := a.Store.Playback(current.UserID); err == nil {
		writeEvent(w, state)
		flusher.Flush()
	}

	ping := time.NewTicker(20 * time.Second)
	defer ping.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case state := <-sub.state:
			writeEvent(w, state)
			flusher.Flush()
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

func writeEvent(w io.Writer, state PlaybackState) {
	body, err := json.Marshal(state)
	if err != nil {
		return
	}

	fmt.Fprintf(w, "data: %s\n\n", body)
}
