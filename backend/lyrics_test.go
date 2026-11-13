package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestLyricsExact(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/get" {
			http.NotFound(w, r)
			return
		}

		_, _ = w.Write([]byte(`{"syncedLyrics":"[00:01.00]hello","plainLyrics":"hello"}`))
	}))
	defer server.Close()

	client := NewLyricsClient()
	client.Base = server.URL

	value, err := client.Get(context.Background(), "title", "artist", "", 200)
	if err != nil {
		t.Fatal(err)
	}
	if value.Synced != "[00:01.00]hello" || value.Plain != "hello" {
		t.Fatalf("получено %+v", value)
	}
}

func TestLyricsFallbackSearch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/get" {
			http.NotFound(w, r)
			return
		}

		_, _ = w.Write([]byte(`[{"syncedLyrics":"[00:02.00]found","plainLyrics":"found"}]`))
	}))
	defer server.Close()

	client := NewLyricsClient()
	client.Base = server.URL

	value, err := client.Get(context.Background(), "title", "artist", "", 200)
	if err != nil {
		t.Fatal(err)
	}
	if value.Synced != "[00:02.00]found" {
		t.Fatalf("получено %+v", value)
	}
}

func TestLyricsSearchPicksClosestDuration(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/get" {
			http.NotFound(w, r)
			return
		}

		_, _ = w.Write([]byte(`[
			{"duration":120,"syncedLyrics":"[00:01.00]wrong version","plainLyrics":"wrong version"},
			{"duration":198,"syncedLyrics":"[00:01.00]right version","plainLyrics":"right version"},
			{"duration":400,"syncedLyrics":"[00:01.00]far away","plainLyrics":"far away"}
		]`))
	}))
	defer server.Close()

	client := NewLyricsClient()
	client.Base = server.URL

	value, err := client.Get(context.Background(), "title", "artist", "", 200)
	if err != nil {
		t.Fatal(err)
	}
	if value.Synced != "[00:01.00]right version" {
		t.Fatalf("получено %+v", value)
	}
}

func TestLyricsSearchPrefersMatchingNames(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/get" {
			http.NotFound(w, r)
			return
		}

		_, _ = w.Write([]byte(`[
			{"trackName":"Wrong Song","artistName":"Other Artist","duration":200,"syncedLyrics":"[00:01.00]wrong"},
			{"trackName":"Right Song","artistName":"Right Artist","duration":212,"syncedLyrics":"[00:01.00]right"}
		]`))
	}))
	defer server.Close()

	client := NewLyricsClient()
	client.Base = server.URL

	value, err := client.Get(context.Background(), "Right Song", "Right Artist", "", 200)
	if err != nil {
		t.Fatal(err)
	}
	if value.Synced != "[00:01.00]right" {
		t.Fatalf("получено %+v", value)
	}
}

func TestLyricsSearchUsesAlbum(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/get" {
			http.NotFound(w, r)
			return
		}

		_, _ = w.Write([]byte(`[
			{"trackName":"Song","artistName":"Artist","albumName":"Other Album","duration":200,"syncedLyrics":"[00:01.00]other"},
			{"trackName":"Song","artistName":"Artist","albumName":"Right Album","duration":200,"syncedLyrics":"[00:01.00]right"}
		]`))
	}))
	defer server.Close()

	client := NewLyricsClient()
	client.Base = server.URL

	value, err := client.Get(context.Background(), "Song", "Artist", "Right Album", 200)
	if err != nil {
		t.Fatal(err)
	}
	if value.Synced != "[00:01.00]right" {
		t.Fatalf("получено %+v", value)
	}
}

func TestLyricsPrefersSyncedOverExactPlain(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/get" {
			_, _ = w.Write([]byte(`{"trackName":"Song","artistName":"Artist","plainLyrics":"plain only"}`))
			return
		}

		_, _ = w.Write([]byte(`[
			{"trackName":"Song","artistName":"Artist","duration":200,"syncedLyrics":"[00:01.00]synced"}
		]`))
	}))
	defer server.Close()

	client := NewLyricsClient()
	client.Base = server.URL

	value, err := client.Get(context.Background(), "Song", "Artist", "", 200)
	if err != nil {
		t.Fatal(err)
	}
	if value.Synced != "[00:01.00]synced" {
		t.Fatalf("получено %+v", value)
	}
}

func TestLyricsSearchSkipsInstrumental(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/get" {
			http.NotFound(w, r)
			return
		}

		_, _ = w.Write([]byte(`[
			{"duration":200,"instrumental":true,"plainLyrics":""},
			{"duration":201,"syncedLyrics":"[00:01.00]voice","plainLyrics":"voice"}
		]`))
	}))
	defer server.Close()

	client := NewLyricsClient()
	client.Base = server.URL

	value, err := client.Get(context.Background(), "title", "artist", "", 200)
	if err != nil {
		t.Fatal(err)
	}
	if value.Synced != "[00:01.00]voice" {
		t.Fatalf("получено %+v", value)
	}
}

func TestLyricsCache(t *testing.T) {
	var hits int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		_, _ = w.Write([]byte(`{"syncedLyrics":"line","plainLyrics":"line"}`))
	}))
	defer server.Close()

	client := NewLyricsClient()
	client.Base = server.URL

	for i := 0; i < 2; i++ {
		if _, err := client.Get(context.Background(), "title", "artist", "", 200); err != nil {
			t.Fatal(err)
		}
	}

	if atomic.LoadInt32(&hits) != 1 {
		t.Fatalf("запросов %d, ожидался 1", hits)
	}
}

func TestLyricsNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer server.Close()

	client := NewLyricsClient()
	client.Base = server.URL

	if _, err := client.Get(context.Background(), "title", "artist", "", 200); err == nil {
		t.Fatal("ожидалась ошибка")
	}
}
