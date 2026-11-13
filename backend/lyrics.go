package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Lyrics struct {
	Synced string `json:"synced"`
	Plain  string `json:"plain"`
}

type LyricsClient struct {
	Base   string
	Client *http.Client
	TTL    time.Duration

	mu    sync.Mutex
	cache map[string]lyricsEntry
}

type lyricsEntry struct {
	value Lyrics
	at    time.Time
}

type lrclibTrack struct {
	SyncedLyrics string `json:"syncedLyrics"`
	PlainLyrics  string `json:"plainLyrics"`
}

func NewLyricsClient() *LyricsClient {
	return &LyricsClient{
		Base:   "https://lrclib.net",
		Client: &http.Client{Timeout: 8 * time.Second},
		TTL:    time.Hour,
		cache:  make(map[string]lyricsEntry),
	}
}

func (a *API) handleLyrics(w http.ResponseWriter, r *http.Request) {
	title := strings.TrimSpace(r.URL.Query().Get("title"))
	artist := strings.TrimSpace(r.URL.Query().Get("artist"))
	duration, _ := strconv.Atoi(r.URL.Query().Get("duration"))

	if title == "" || artist == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "нужны название и исполнитель"})
		return
	}

	value, err := a.Lyrics.Get(r.Context(), title, artist, duration)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "текст не найден"})
		return
	}

	writeJSON(w, http.StatusOK, value)
}

func (l *LyricsClient) Get(ctx context.Context, title, artist string, duration int) (Lyrics, error) {
	key := fmt.Sprintf("%s|%s|%d", title, artist, duration)

	if cached, ok := l.cached(key); ok {
		return cached, nil
	}

	value, err := l.fetch(ctx, title, artist, duration)
	if err != nil {
		return Lyrics{}, err
	}

	l.store(key, value)
	return value, nil
}

func (l *LyricsClient) fetch(ctx context.Context, title, artist string, duration int) (Lyrics, error) {
	query := url.Values{}
	query.Set("artist_name", artist)
	query.Set("track_name", title)
	if duration > 0 {
		query.Set("duration", strconv.Itoa(duration))
	}

	if value, ok := l.exact(ctx, "/api/get?"+query.Encode()); ok {
		return value, nil
	}

	search := url.Values{}
	search.Set("q", artist+" "+title)

	for _, value := range l.search(ctx, "/api/search?"+search.Encode()) {
		if value.Synced != "" || value.Plain != "" {
			return value, nil
		}
	}

	return Lyrics{}, errors.New("текст не найден")
}

func (l *LyricsClient) exact(ctx context.Context, path string) (Lyrics, bool) {
	body, status, err := l.request(ctx, path)
	if err != nil || status != http.StatusOK {
		return Lyrics{}, false
	}

	var track lrclibTrack
	if err := json.Unmarshal(body, &track); err != nil {
		return Lyrics{}, false
	}

	if track.SyncedLyrics == "" && track.PlainLyrics == "" {
		return Lyrics{}, false
	}

	return Lyrics{Synced: track.SyncedLyrics, Plain: track.PlainLyrics}, true
}

func (l *LyricsClient) search(ctx context.Context, path string) []Lyrics {
	body, status, err := l.request(ctx, path)
	if err != nil || status != http.StatusOK {
		return nil
	}

	var tracks []lrclibTrack
	if err := json.Unmarshal(body, &tracks); err != nil {
		return nil
	}

	result := make([]Lyrics, 0, len(tracks))
	for _, track := range tracks {
		if track.SyncedLyrics == "" && track.PlainLyrics == "" {
			continue
		}
		result = append(result, Lyrics{Synced: track.SyncedLyrics, Plain: track.PlainLyrics})
	}

	return result
}

func (l *LyricsClient) request(ctx context.Context, path string) ([]byte, int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, l.Base+path, nil)
	if err != nil {
		return nil, 0, err
	}

	response, err := l.Client.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return nil, response.StatusCode, err
	}

	return body, response.StatusCode, nil
}

func (l *LyricsClient) cached(key string) (Lyrics, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry, ok := l.cache[key]
	if !ok {
		return Lyrics{}, false
	}

	if time.Since(entry.at) > l.TTL {
		delete(l.cache, key)
		return Lyrics{}, false
	}

	return entry.value, true
}

func (l *LyricsClient) store(key string, value Lyrics) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.cache) >= 128 {
		for item := range l.cache {
			delete(l.cache, item)
			break
		}
	}

	l.cache[key] = lyricsEntry{value: value, at: time.Now()}
}
