package main

import (
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

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
