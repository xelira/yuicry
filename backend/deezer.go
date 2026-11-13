package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

type Track struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Artist   string `json:"artist"`
	Duration int    `json:"duration"`
	Cover    string `json:"cover_big"`
	ArtistID string `json:"-"`
	Preview  string `json:"-"`
}

type Deezer struct {
	client *http.Client
	base   string
	ttl    time.Duration
	mu     sync.Mutex
	cache  map[string]cacheEntry
}

type cacheEntry struct {
	body []byte
	at   time.Time
}

type deezerTrack struct {
	ID       json.Number `json:"id"`
	Title    string      `json:"title"`
	Duration int         `json:"duration"`
	Artist   struct {
		ID   json.Number `json:"id"`
		Name string      `json:"name"`
	} `json:"artist"`
	Album struct {
		CoverBig string `json:"cover_big"`
		CoverXL  string `json:"cover_xl"`
	} `json:"album"`
	Preview string `json:"preview"`
}

type deezerList struct {
	Data []deezerTrack `json:"data"`
}

type deezerArtists struct {
	Data []struct {
		ID json.Number `json:"id"`
	} `json:"data"`
}

func NewDeezer() *Deezer {
	return &Deezer{
		client: &http.Client{Timeout: 12 * time.Second},
		base:   "https://api.deezer.com",
		ttl:    5 * time.Minute,
		cache:  make(map[string]cacheEntry),
	}
}

func (d *Deezer) Search(ctx context.Context, query string, index int) ([]Track, error) {
	if index < 0 {
		index = 0
	}

	endpoint := fmt.Sprintf("%s/search?limit=30&index=%d&q=%s", d.base, index, url.QueryEscape(query))
	return d.list(ctx, endpoint)
}

func (d *Deezer) Chart(ctx context.Context) ([]Track, error) {
	return d.list(ctx, d.base+"/chart/0/tracks?limit=25")
}

func (d *Deezer) Radio(ctx context.Context, trackID string) ([]Track, error) {
	track, err := d.Track(ctx, trackID)
	if err != nil {
		return nil, err
	}
	if track.ArtistID == "" {
		return nil, fmt.Errorf("у трека нет исполнителя")
	}

	var collected []Track
	var mutex sync.Mutex
	var group sync.WaitGroup

	add := func(tracks []Track) {
		mutex.Lock()
		collected = append(collected, tracks...)
		mutex.Unlock()
	}

	if top, err := d.artistTop(ctx, track.ArtistID, 10); err == nil {
		add(top)
	}

	related, err := d.relatedArtists(ctx, track.ArtistID, 6)
	if err != nil {
		return collected, nil
	}

	for _, artistID := range related {
		group.Add(1)
		go func(id string) {
			defer group.Done()
			tracks, err := d.artistTop(ctx, id, 5)
			if err != nil {
				return
			}
			add(tracks)
		}(artistID)
	}

	group.Wait()
	return collected, nil
}

func (d *Deezer) Track(ctx context.Context, trackID string) (Track, error) {
	var raw deezerTrack
	endpoint := d.base + "/track/" + url.PathEscape(trackID)
	if err := d.get(ctx, endpoint, &raw); err != nil {
		return Track{}, err
	}
	return convertTrack(raw), nil
}

func (d *Deezer) artistTop(ctx context.Context, artistID string, limit int) ([]Track, error) {
	endpoint := fmt.Sprintf("%s/artist/%s/top?limit=%d", d.base, url.PathEscape(artistID), limit)
	return d.list(ctx, endpoint)
}

func (d *Deezer) relatedArtists(ctx context.Context, artistID string, limit int) ([]string, error) {
	var body deezerArtists
	endpoint := fmt.Sprintf("%s/artist/%s/related?limit=%d", d.base, url.PathEscape(artistID), limit)
	if err := d.get(ctx, endpoint, &body); err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(body.Data))
	for _, artist := range body.Data {
		ids = append(ids, artist.ID.String())
	}
	return ids, nil
}

func (d *Deezer) list(ctx context.Context, endpoint string) ([]Track, error) {
	var body deezerList
	if err := d.get(ctx, endpoint, &body); err != nil {
		return nil, err
	}

	tracks := make([]Track, 0, len(body.Data))
	for _, raw := range body.Data {
		track := convertTrack(raw)
		if track.ID == "" || track.Title == "" {
			continue
		}
		tracks = append(tracks, track)
	}
	return tracks, nil
}

func (d *Deezer) get(ctx context.Context, endpoint string, target any) error {
	body, err := d.body(ctx, endpoint)
	if err != nil {
		return err
	}

	var failure struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &failure) == nil && failure.Error.Message != "" {
		return fmt.Errorf("deezer: %s", failure.Error.Message)
	}

	return json.Unmarshal(body, target)
}

func (d *Deezer) body(ctx context.Context, endpoint string) ([]byte, error) {
	if cached, ok := d.cached(endpoint); ok {
		return cached, nil
	}

	var lastErr error

	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt) * 300 * time.Millisecond):
			}
		}

		body, retry, err := d.fetch(ctx, endpoint)
		if err == nil {
			d.store(endpoint, body)
			return body, nil
		}

		lastErr = err
		if !retry {
			break
		}
	}

	return nil, lastErr
}

func (d *Deezer) fetch(ctx context.Context, endpoint string) ([]byte, bool, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, false, err
	}

	response, err := d.client.Do(request)
	if err != nil {
		return nil, true, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		retry := response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500
		return nil, retry, fmt.Errorf("deezer: %s", response.Status)
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return nil, true, err
	}

	return body, false, nil
}

func (d *Deezer) cached(endpoint string) ([]byte, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()

	entry, ok := d.cache[endpoint]
	if !ok {
		return nil, false
	}

	if time.Since(entry.at) > d.ttl {
		delete(d.cache, endpoint)
		return nil, false
	}

	return entry.body, true
}

func (d *Deezer) store(endpoint string, body []byte) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if len(d.cache) >= 256 {
		for key := range d.cache {
			delete(d.cache, key)
			break
		}
	}

	d.cache[endpoint] = cacheEntry{body: body, at: time.Now()}
}

func convertTrack(raw deezerTrack) Track {
	cover := raw.Album.CoverXL
	if cover == "" {
		cover = raw.Album.CoverBig
	}

	return Track{
		ID:       raw.ID.String(),
		Title:    raw.Title,
		Artist:   raw.Artist.Name,
		ArtistID: raw.Artist.ID.String(),
		Duration: raw.Duration,
		Cover:    cover,
	}
}
