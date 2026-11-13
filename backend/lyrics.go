package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
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
	TrackName    string  `json:"trackName"`
	ArtistName   string  `json:"artistName"`
	AlbumName    string  `json:"albumName"`
	Duration     float64 `json:"duration"`
	Instrumental bool    `json:"instrumental"`
	SyncedLyrics string  `json:"syncedLyrics"`
	PlainLyrics  string  `json:"plainLyrics"`
}

var (
	brackets = regexp.MustCompile(`\[[^\]]*\]|\([^)]*\)`)
	words    = regexp.MustCompile(`[\p{L}\p{N}]+`)
)

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
	album := strings.TrimSpace(r.URL.Query().Get("album"))
	duration, _ := strconv.Atoi(r.URL.Query().Get("duration"))

	if title == "" || artist == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "нужны название и исполнитель"})
		return
	}

	value, err := a.Lyrics.Get(r.Context(), title, artist, album, duration)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "текст не найден"})
		return
	}

	writeJSON(w, http.StatusOK, value)
}

func (l *LyricsClient) Get(ctx context.Context, title, artist, album string, duration int) (Lyrics, error) {
	key := fmt.Sprintf("%s|%s|%s|%d", title, artist, album, duration)

	if cached, ok := l.cached(key); ok {
		return cached, nil
	}

	value, err := l.fetch(ctx, title, artist, album, duration)
	if err != nil {
		return Lyrics{}, err
	}

	l.store(key, value)
	return value, nil
}

func (l *LyricsClient) fetch(ctx context.Context, title, artist, album string, duration int) (Lyrics, error) {
	query := url.Values{}
	query.Set("artist_name", artist)
	query.Set("track_name", title)
	if album != "" {
		query.Set("album_name", album)
	}
	if duration > 0 {
		query.Set("duration", strconv.Itoa(duration))
	}

	exactValue, exactOK := l.exact(ctx, "/api/get?"+query.Encode())
	if exactOK && exactValue.Synced != "" {
		return exactValue, nil
	}

	search := url.Values{}
	search.Set("q", strings.TrimSpace(artist+" "+title))

	if value, ok := l.search(ctx, "/api/search?"+search.Encode(), title, artist, album, duration); ok {
		return value, nil
	}

	if exactOK {
		return exactValue, nil
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

func (l *LyricsClient) search(ctx context.Context, path, title, artist, album string, duration int) (Lyrics, bool) {
	body, status, err := l.request(ctx, path)
	if err != nil || status != http.StatusOK {
		return Lyrics{}, false
	}

	var tracks []lrclibTrack
	if err := json.Unmarshal(body, &tracks); err != nil {
		return Lyrics{}, false
	}

	best := math.MaxFloat64
	var value Lyrics
	found := false

	for _, track := range tracks {
		score, ok := lyricsScore(track, title, artist, album, duration)
		if !ok || score >= best {
			continue
		}

		best = score
		value = Lyrics{Synced: track.SyncedLyrics, Plain: track.PlainLyrics}
		found = true
	}

	return value, found
}

func lyricsScore(track lrclibTrack, title, artist, album string, duration int) (float64, bool) {
	if track.Instrumental || (track.SyncedLyrics == "" && track.PlainLyrics == "") {
		return 0, false
	}

	titleMatch := similarity(title, track.TrackName)
	artistMatch := similarity(artist, track.ArtistName)

	if (track.TrackName != "" || track.ArtistName != "") && titleMatch == 0 && artistMatch == 0 {
		return 0, false
	}

	score := (1-titleMatch)*24 + (1-artistMatch)*12

	if album != "" && track.AlbumName != "" {
		score += (1 - similarity(album, track.AlbumName)) * 6
	}

	if duration > 0 && track.Duration > 0 {
		difference := math.Abs(track.Duration - float64(duration))
		if difference > 45 && titleMatch < 0.5 {
			return 0, false
		}
		score += math.Min(difference, 30) * 0.5
	}

	if track.SyncedLyrics == "" {
		score += 10
	}

	return score, true
}

func similarity(first, second string) float64 {
	left := wordSet(first)
	right := wordSet(second)

	if len(left) == 0 || len(right) == 0 {
		return 0
	}

	common := 0

	for word := range left {
		if right[word] {
			common += 1
		}
	}

	union := len(left) + len(right) - common
	if union == 0 {
		return 0
	}

	return float64(common) / float64(union)
}

func wordSet(value string) map[string]bool {
	clean := brackets.ReplaceAllString(strings.ToLower(value), " ")
	result := make(map[string]bool)

	for _, word := range words.FindAllString(clean, -1) {
		result[word] = true
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
