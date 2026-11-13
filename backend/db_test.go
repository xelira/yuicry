package main

import (
	"path/filepath"
	"testing"
)

func TestMigrationsApplyOnce(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")

	store, err := OpenStore(path)
	if err != nil {
		t.Fatalf("открытие: %v", err)
	}

	var count int
	if err := store.db.QueryRow(`select count(*) from schema_migrations`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != len(migrations) {
		t.Fatalf("применено миграций %d, ожидалось %d", count, len(migrations))
	}

	if !hasColumn(t, store, "albums", "cover") {
		t.Fatal("у albums нет колонки cover")
	}

	if err := store.db.Close(); err != nil {
		t.Fatal(err)
	}

	again, err := OpenStore(path)
	if err != nil {
		t.Fatalf("повторное открытие: %v", err)
	}
	defer again.db.Close()

	if err := again.db.QueryRow(`select count(*) from schema_migrations`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != len(migrations) {
		t.Fatalf("после перезапуска миграций %d", count)
	}
}

func TestUpdateAlbum(t *testing.T) {
	store := testStore(t)

	album, err := store.CreateAlbum("user", "Старое")
	if err != nil {
		t.Fatal(err)
	}

	title := "Новое"
	cover := "https://cdn-images.dzcdn.net/images/cover/abc/1000x1000-000000-80-0-0.jpg"

	if err := store.UpdateAlbum("user", album.ID, &title, &cover); err != nil {
		t.Fatal(err)
	}

	albums, err := store.Albums("user")
	if err != nil {
		t.Fatal(err)
	}
	if len(albums) != 1 {
		t.Fatalf("плейлистов %d", len(albums))
	}
	if albums[0].Title != "Новое" {
		t.Fatalf("название %q", albums[0].Title)
	}
	if albums[0].Cover != cover {
		t.Fatalf("обложка %q", albums[0].Cover)
	}
}

func TestUpdateAlbumRejectsForeignUser(t *testing.T) {
	store := testStore(t)

	album, err := store.CreateAlbum("user", "Плейлист")
	if err != nil {
		t.Fatal(err)
	}

	title := "Чужое"
	if err := store.UpdateAlbum("other", album.ID, &title, nil); err == nil {
		t.Fatal("чужой пользователь смог изменить плейлист")
	}
}

func hasColumn(t *testing.T, store *Store, table, column string) bool {
	t.Helper()

	rows, err := store.db.Query(`pragma table_info(` + table + `)`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()

	for rows.Next() {
		var position int
		var name, kind string
		var notNull, primary int
		var fallback any

		if err := rows.Scan(&position, &name, &kind, &notNull, &fallback, &primary); err != nil {
			t.Fatal(err)
		}
		if name == column {
			return true
		}
	}

	return false
}

func TestDislikedArtists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")

	store, err := OpenStore(path)
	if err != nil {
		t.Fatalf("открытие: %v", err)
	}
	defer store.db.Close()

	track := Track{ID: "1", Title: "track", Artist: "artist", ArtistID: "77", Album: "album", AlbumID: "88"}
	if err := store.AddSkip("user", track); err != nil {
		t.Fatal(err)
	}

	artists, err := store.DislikedArtists("user")
	if err != nil {
		t.Fatal(err)
	}

	if !artists["77"] || len(artists) != 1 {
		t.Fatalf("получено %+v", artists)
	}
}
