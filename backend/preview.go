package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/xelira/yuicry/backend/internal/storage"
)

type previewEntry struct {
	data []byte
	at   time.Time
}

var previewCache = struct {
	sync.Mutex
	items map[string]previewEntry
}{
	items: make(map[string]previewEntry),
}

func (a *API) handlePreview(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.Auth.Current(r); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	id := r.PathValue("id")
	if err := storage.ValidID(id); err != nil {
		http.Error(w, "плохой id", http.StatusBadRequest)
		return
	}

	if size, err := a.Streamer.Storage.Size(r.Context(), id); err == nil {
		a.Streamer.ServeStored(w, r, id, size)
		return
	}

	if data, ok := cachedPreview(id); ok {
		servePreview(w, r, id, data)
		return
	}

	track, err := a.Deezer.Track(r.Context(), id)
	if err != nil || track.Preview == "" {
		http.Error(w, "превью недоступно", http.StatusNotFound)
		return
	}

	data, err := fetchPreview(r.Context(), a.Streamer.Client, track.Preview)
	if err != nil {
		http.Error(w, "превью недоступно", http.StatusBadGateway)
		return
	}

	storePreview(id, data)
	servePreview(w, r, id, data)
}

func fetchPreview(ctx context.Context, client *http.Client, source string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, err
	}

	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, errors.New("preview: " + response.Status)
	}

	return io.ReadAll(io.LimitReader(response.Body, 12<<20))
}

func servePreview(w http.ResponseWriter, r *http.Request, id string, data []byte) {
	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Cache-Control", "private, max-age=300")
	http.ServeContent(w, r, id+".mp3", time.Time{}, bytes.NewReader(data))
}

func cachedPreview(id string) ([]byte, bool) {
	previewCache.Lock()
	defer previewCache.Unlock()

	entry, ok := previewCache.items[id]
	if !ok || time.Since(entry.at) > 10*time.Minute {
		if ok {
			delete(previewCache.items, id)
		}
		return nil, false
	}

	return entry.data, true
}

func storePreview(id string, data []byte) {
	previewCache.Lock()
	defer previewCache.Unlock()

	if len(previewCache.items) >= 64 {
		for key := range previewCache.items {
			delete(previewCache.items, key)
			break
		}
	}

	previewCache.items[id] = previewEntry{data: data, at: time.Now()}
}
