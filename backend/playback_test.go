package main

import (
	"path/filepath"
	"testing"
)

func testStore(t *testing.T) *Store {
	t.Helper()

	store, err := OpenStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("открытие хранилища: %v", err)
	}

	t.Cleanup(func() {
		_ = store.db.Close()
	})

	return store
}

func TestPlaybackRoundTrip(t *testing.T) {
	store := testStore(t)

	state := PlaybackState{
		Device:   "phone",
		Track:    Track{ID: "3135553", Title: "One More Time", Artist: "Daft Punk", Duration: 320},
		Position: 42.5,
		Playing:  true,
	}

	if err := store.SavePlayback("user-1", state); err != nil {
		t.Fatalf("сохранение: %v", err)
	}

	got, err := store.Playback("user-1")
	if err != nil {
		t.Fatalf("чтение: %v", err)
	}

	if got.Device != "phone" {
		t.Fatalf("устройство %q, ожидалось phone", got.Device)
	}
	if got.Track.ID != "3135553" || got.Track.Title != "One More Time" {
		t.Fatalf("трек потерялся: %+v", got.Track)
	}
	if got.Position != 42.5 {
		t.Fatalf("позиция %v, ожидалось 42.5", got.Position)
	}
	if !got.Playing {
		t.Fatal("флаг воспроизведения потерялся")
	}
	if got.UpdatedAt == 0 {
		t.Fatal("время обновления не заполнено")
	}
}

func TestPlaybackOverwritesDevice(t *testing.T) {
	store := testStore(t)

	first := PlaybackState{Device: "phone", Track: Track{ID: "1"}, Position: 10, Playing: true}
	second := PlaybackState{Device: "laptop", Track: Track{ID: "2"}, Position: 3, Playing: false}

	if err := store.SavePlayback("user-1", first); err != nil {
		t.Fatal(err)
	}
	if err := store.SavePlayback("user-1", second); err != nil {
		t.Fatal(err)
	}

	got, err := store.Playback("user-1")
	if err != nil {
		t.Fatal(err)
	}

	if got.Device != "laptop" || got.Track.ID != "2" {
		t.Fatalf("состояние не перезаписано: %+v", got)
	}
	if got.Playing {
		t.Fatal("пауза не сохранилась")
	}

	var count int
	if err := store.db.QueryRow(`select count(*) from playback where user_id = ?`, "user-1").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("строк %d, ожидалась 1", count)
	}
}

func TestPlaybackIsolatedByUser(t *testing.T) {
	store := testStore(t)

	if err := store.SavePlayback("user-1", PlaybackState{Device: "phone", Track: Track{ID: "1"}}); err != nil {
		t.Fatal(err)
	}

	if _, err := store.Playback("user-2"); err == nil {
		t.Fatal("состояние чужого пользователя доступно")
	}
}
