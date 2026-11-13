package main

import (
	"context"
	"math/rand"
	"net/http"
	"sync"
)

func (a *API) handleWave(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	ctx := r.Context()

	likes, err := a.Store.LikedIDs(current.UserID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "не удалось прочитать лайки"})
		return
	}

	seeds := sample(likes, 5)
	if len(seeds) == 0 {
		chart, err := a.Deezer.Chart(ctx)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "deezer недоступен"})
			return
		}
		seeds = idsOf(chart, 5)
	}

	similar := a.radios(ctx, seeds)
	skipped, _ := a.Store.Skipped(current.UserID)

	tracks := mix(similar, likes, skipped, 20)
	writeJSON(w, http.StatusOK, map[string]any{"tracks": tracks})
}

func (a *API) radios(ctx context.Context, seeds []string) []Track {
	var mutex sync.Mutex
	var collected []Track
	var group sync.WaitGroup

	for _, seed := range seeds {
		group.Add(1)
		go func(seed string) {
			defer group.Done()
			tracks, err := a.Deezer.Radio(ctx, seed)
			if err != nil {
				return
			}
			mutex.Lock()
			collected = append(collected, tracks...)
			mutex.Unlock()
		}(seed)
	}

	group.Wait()
	return collected
}

func mix(similar []Track, likes []string, skipped map[string]bool, total int) []Track {
	liked := make(map[string]bool, len(likes))
	for _, id := range likes {
		liked[id] = true
	}

	seen := make(map[string]bool)
	var fresh []Track
	var owned []Track

	for _, track := range similar {
		if seen[track.ID] || skipped[track.ID] {
			continue
		}
		seen[track.ID] = true

		if liked[track.ID] {
			owned = append(owned, track)
		} else {
			fresh = append(fresh, track)
		}
	}

	shuffle(fresh)
	shuffle(owned)

	wantedFresh := total * 7 / 10
	result := take(fresh, wantedFresh)
	result = append(result, take(owned, total-len(result))...)

	if len(result) < total && len(fresh) > wantedFresh {
		result = append(result, take(fresh[wantedFresh:], total-len(result))...)
	}

	shuffle(result)
	return result
}

func sample(values []string, limit int) []string {
	if len(values) <= limit {
		return append([]string(nil), values...)
	}

	shuffled := append([]string(nil), values...)
	shuffleStrings(shuffled)
	return shuffled[:limit]
}

func idsOf(tracks []Track, limit int) []string {
	if len(tracks) > limit {
		tracks = tracks[:limit]
	}

	ids := make([]string, 0, len(tracks))
	for _, track := range tracks {
		ids = append(ids, track.ID)
	}
	return ids
}

func take(tracks []Track, limit int) []Track {
	if limit <= 0 || len(tracks) == 0 {
		return nil
	}
	if len(tracks) < limit {
		limit = len(tracks)
	}
	return tracks[:limit]
}

func shuffle(tracks []Track) {
	rand.Shuffle(len(tracks), func(i, j int) {
		tracks[i], tracks[j] = tracks[j], tracks[i]
	})
}

func shuffleStrings(values []string) {
	rand.Shuffle(len(values), func(i, j int) {
		values[i], values[j] = values[j], values[i]
	})
}
