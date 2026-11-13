package main

import (
	"context"
	"net/http"
	"sync"
)

func (a *API) handleArtist(w http.ResponseWriter, r *http.Request) {
	artistID := r.PathValue("id")

	var (
		artist  Artist
		tracks  []Track
		albums  []CatalogAlbum
		related []Artist
		info    error
		group   sync.WaitGroup
	)

	group.Add(3)

	go func() {
		defer group.Done()
		artist, tracks, info = a.Deezer.Artist(r.Context(), artistID)
	}()

	go func() {
		defer group.Done()
		albums, _ = a.Deezer.ArtistAlbums(r.Context(), artistID, 50)
	}()

	go func() {
		defer group.Done()
		related, _ = a.Deezer.Related(r.Context(), artistID, 12)
	}()

	group.Wait()

	if info != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "артист недоступен"})
		return
	}

	tracks = a.fillArtistTracks(r.Context(), tracks, albums)

	writeJSON(w, http.StatusOK, map[string]any{
		"artist":  artist,
		"tracks":  tracks,
		"albums":  albums,
		"related": related,
	})
}

func (a *API) fillArtistTracks(ctx context.Context, tracks []Track, albums []CatalogAlbum) []Track {
	if len(tracks) >= 10 || len(albums) == 0 {
		return tracks
	}

	count := len(albums)
	if count > 6 {
		count = 6
	}

	collected := make([][]Track, count)
	var group sync.WaitGroup

	for position := 0; position < count; position++ {
		group.Add(1)

		go func(index int) {
			defer group.Done()

			album, err := a.Deezer.Album(ctx, albums[index].ID)
			if err != nil {
				return
			}

			collected[index] = album.Tracks
		}(position)
	}

	group.Wait()

	seen := make(map[string]bool, len(tracks))
	for _, track := range tracks {
		seen[track.ID] = true
	}

	for _, list := range collected {
		for _, track := range list {
			if track.ID == "" || seen[track.ID] {
				continue
			}

			seen[track.ID] = true
			tracks = append(tracks, track)

			if len(tracks) >= 50 {
				return tracks
			}
		}
	}

	return tracks
}

func (a *API) handleCatalogAlbum(w http.ResponseWriter, r *http.Request) {
	album, err := a.Deezer.Album(r.Context(), r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "альбом недоступен"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"album": album})
}

func (a *API) handleTrack(w http.ResponseWriter, r *http.Request) {
	track, err := a.Deezer.Track(r.Context(), r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "трек недоступен"})
		return
	}

	writeJSON(w, http.StatusOK, track)
}
