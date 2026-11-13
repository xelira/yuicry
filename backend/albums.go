package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/xelira/yuicry/backend/internal/storage"
)

func (a *API) handleAlbums(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	albums, err := a.Store.Albums(current.UserID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "не удалось прочитать"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"albums": albums})
}

func (a *API) handleCreateAlbum(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	var body struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохое тело"})
		return
	}
	if body.Title == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "нужно название"})
		return
	}

	album, err := a.Store.CreateAlbum(current.UserID, body.Title)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "не удалось создать"})
		return
	}

	writeJSON(w, http.StatusOK, album)
}

func (a *API) handleAlbum(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	tracks, err := a.Store.AlbumTracks(current.UserID, r.PathValue("id"))
	if err != nil {
		albumError(w, err)
		return
	}

	albumID := r.PathValue("id")
	a.fillTrackMeta(r.Context(), tracks, func(track Track) {
		_ = a.Store.UpdateAlbumTrackMeta(albumID, track)
	})

	writeJSON(w, http.StatusOK, map[string]any{"tracks": tracks})
}

func (a *API) handleUpdateAlbum(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	var body struct {
		Title *string `json:"title"`
		Cover *string `json:"cover"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохое тело"})
		return
	}
	if body.Title == nil && body.Cover == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "нечего менять"})
		return
	}

	if body.Title != nil {
		title := strings.TrimSpace(*body.Title)
		if title == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "нужно название"})
			return
		}
		body.Title = &title
	}

	if body.Cover != nil && *body.Cover != "" {
		target, err := url.Parse(*body.Cover)
		if err != nil || target.Scheme != "https" || !validCoverHost(target.Host) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохая обложка"})
			return
		}
	}

	if err := a.Store.UpdateAlbum(current.UserID, r.PathValue("id"), body.Title, body.Cover); err != nil {
		albumError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) handleDeleteAlbum(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	if err := a.Store.DeleteAlbum(current.UserID, r.PathValue("id")); err != nil {
		albumError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) handleAddTrack(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	var body struct {
		TrackID  string `json:"track_id"`
		Title    string `json:"title"`
		Artist   string `json:"artist"`
		Cover    string `json:"cover_big"`
		Duration int    `json:"duration"`
		ArtistID string `json:"artist_id"`
		Album    string `json:"album"`
		AlbumID  string `json:"album_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохое тело"})
		return
	}
	if err := storage.ValidID(body.TrackID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохой трек"})
		return
	}

	track := Track{
		ID:       body.TrackID,
		Title:    body.Title,
		Artist:   body.Artist,
		Cover:    body.Cover,
		Duration: body.Duration,
		ArtistID: body.ArtistID,
		Album:    body.Album,
		AlbumID:  body.AlbumID,
	}
	if track.Title == "" {
		if fetched, err := a.Deezer.Track(r.Context(), body.TrackID); err == nil {
			track = fetched
		}
	}

	if err := a.Store.AddAlbumTrack(current.UserID, r.PathValue("id"), track); err != nil {
		albumError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) handleRemoveTrack(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	if err := a.Store.RemoveAlbumTrack(current.UserID, r.PathValue("id"), r.PathValue("track")); err != nil {
		albumError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func albumError(w http.ResponseWriter, err error) {
	if errors.Is(err, errAlbumNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "альбом не найден"})
		return
	}
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ошибка альбома"})
}
