package main

import (
	"net/http"

	"github.com/xelira/yuicry/backend/internal/storage"
)

func (a *API) handleSimilar(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	id := r.PathValue("id")
	if err := storage.ValidID(id); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохой трек"})
		return
	}

	tracks, err := a.Deezer.Radio(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "deezer недоступен"})
		return
	}

	if len(tracks) == 0 {
		if seed, err := a.Deezer.Track(r.Context(), id); err == nil {
			if found, err := a.Deezer.Search(r.Context(), seed.Artist+" "+seed.Title, 0); err == nil {
				tracks = found
			}
		}
	}

	disliked, _ := a.Store.DislikedArtists(current.UserID)

	result := make([]Track, 0, len(tracks))
	seen := make(map[string]bool)

	for _, track := range tracks {
		if track.ID == id || seen[track.ID] {
			continue
		}

		if track.ArtistID != "" && disliked[track.ArtistID] {
			continue
		}

		seen[track.ID] = true
		result = append(result, track)
	}

	if len(result) > 30 {
		result = result[:30]
	}

	writeJSON(w, http.StatusOK, map[string]any{"tracks": result})
}
