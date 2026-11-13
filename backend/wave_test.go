package main

import (
	"fmt"
	"testing"
)

func tracks(count int) []Track {
	result := make([]Track, 0, count)
	for i := 0; i < count; i++ {
		result = append(result, Track{ID: fmt.Sprintf("%d", i), Title: fmt.Sprintf("track-%d", i)})
	}
	return result
}

func TestMixReturnsRequestedCount(t *testing.T) {
	got := mix(tracks(60), nil, map[string]bool{}, nil, 20)
	if len(got) != 20 {
		t.Fatalf("получено %d треков, ожидалось 20", len(got))
	}
}

func TestMixDropsSkipped(t *testing.T) {
	skipped := map[string]bool{"1": true, "2": true, "3": true}
	got := mix(tracks(40), nil, skipped, nil, 20)

	for _, track := range got {
		if skipped[track.ID] {
			t.Fatalf("в подборку попал скипнутый трек %s", track.ID)
		}
	}
}

func TestMixDropsDislikedArtists(t *testing.T) {
	similar := []Track{
		{ID: "1", ArtistID: "a"},
		{ID: "2", ArtistID: "b"},
		{ID: "3", ArtistID: "a"},
	}

	got := mix(similar, nil, map[string]bool{}, map[string]bool{"a": true}, 10)

	if len(got) != 1 || got[0].ID != "2" {
		t.Fatalf("ожидался только трек 2, получено %+v", got)
	}
}

func TestMixHasNoDuplicates(t *testing.T) {
	similar := append(tracks(20), tracks(20)...)
	got := mix(similar, nil, map[string]bool{}, nil, 20)

	seen := make(map[string]bool)
	for _, track := range got {
		if seen[track.ID] {
			t.Fatalf("трек %s встречается дважды", track.ID)
		}
		seen[track.ID] = true
	}
}

func TestMixShortInputDoesNotPanic(t *testing.T) {
	got := mix(tracks(2), []string{"0"}, map[string]bool{}, nil, 20)
	if len(got) > 2 {
		t.Fatalf("получено больше треков, чем было на входе: %d", len(got))
	}
}

func TestMixKeepsLikedShare(t *testing.T) {
	likes := []string{"0", "1", "2", "3", "4"}
	got := mix(tracks(40), likes, map[string]bool{}, nil, 20)

	liked := 0
	for _, track := range got {
		for _, id := range likes {
			if track.ID == id {
				liked += 1
			}
		}
	}

	if liked == 0 {
		t.Fatal("в подборке нет ни одного лайкнутого трека при наличии лайков")
	}
	if liked > 10 {
		t.Fatalf("лайкнутых слишком много: %d", liked)
	}
}

func TestSampleReturnsCopy(t *testing.T) {
	values := []string{"a", "b", "c", "d"}
	got := sample(values, 2)

	if len(got) != 2 {
		t.Fatalf("получено %d, ожидалось 2", len(got))
	}

	got[0] = "z"
	if values[0] == "z" && values[1] == "z" {
		t.Fatal("sample изменил исходный срез")
	}
}

func TestSampleKeepsShortInput(t *testing.T) {
	values := []string{"a", "b"}
	got := sample(values, 5)

	if len(got) != 2 {
		t.Fatalf("получено %d, ожидалось 2", len(got))
	}
}

func TestWaveGenresAreComplete(t *testing.T) {
	seen := make(map[string]bool)

	for _, genre := range waveGenres {
		if genre.ID == "" || genre.Name == "" {
			t.Fatalf("у жанра пустое поле: %+v", genre)
		}
		if seen[genre.ID] {
			t.Fatalf("жанр %s указан дважды", genre.ID)
		}
		seen[genre.ID] = true
	}
}

func TestWaveGenreAllowed(t *testing.T) {
	if !waveGenreAllowed("116") {
		t.Fatal("жанр 116 должен быть разрешён")
	}
	if waveGenreAllowed("999") {
		t.Fatal("неизвестный жанр не должен проходить проверку")
	}
	if waveGenreAllowed("") {
		t.Fatal("пустой жанр не должен проходить проверку")
	}
}
