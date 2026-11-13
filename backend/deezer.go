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
	return &Deezer{client: &http.Client{Timeout: 12 * time.Second}}
}

func (d *Deezer) Search(ctx context.Context, query string) ([]Track, error) {
	endpoint := "https://api.deezer.com/search?limit=30&q=" + url.QueryEscape(query)
	return d.list(ctx, endpoint)
}

func (d *Deezer) Chart(ctx context.Context) ([]Track, error) {
	return d.list(ctx, "https://api.deezer.com/chart/0/tracks?limit=25")
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
	endpoint := "https://api.deezer.com/track/" + url.PathEscape(trackID)
	if err := d.get(ctx, endpoint, &raw); err != nil {
		return Track{}, err
	}
	return convertTrack(raw), nil
}

func (d *Deezer) artistTop(ctx context.Context, artistID string, limit int) ([]Track, error) {
	endpoint := fmt.Sprintf("https://api.deezer.com/artist/%s/top?limit=%d", url.PathEscape(artistID), limit)
	return d.list(ctx, endpoint)
}

func (d *Deezer) relatedArtists(ctx context.Context, artistID string, limit int) ([]string, error) {
	var body deezerArtists
	endpoint := fmt.Sprintf("https://api.deezer.com/artist/%s/related?limit=%d", url.PathEscape(artistID), limit)
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
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}

	response, err := d.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("deezer: %s", response.Status)
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
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
