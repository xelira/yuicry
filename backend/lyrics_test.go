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

	value, err := client.Get(context.Background(), "title", "artist", 200)
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

	value, err := client.Get(context.Background(), "title", "artist", 200)
	if err != nil {
		t.Fatal(err)
	}
	if value.Synced != "[00:02.00]found" {
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
		if _, err := client.Get(context.Background(), "title", "artist", 200); err != nil {
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

	if _, err := client.Get(context.Background(), "title", "artist", 200); err == nil {
		t.Fatal("ожидалась ошибка")
	}
}
