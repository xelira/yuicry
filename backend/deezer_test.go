package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

const deezerPayload = `{"data":[{"id":1,"title":"track","duration":200,"artist":{"id":2,"name":"artist"},"album":{"cover_big":"https://cdn/cover.jpg"}}]}`

func TestDeezerCachesResponses(t *testing.T) {
	var hits int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(deezerPayload))
	}))
	defer server.Close()

	deezer := NewDeezer()
	deezer.base = server.URL

	first, err := deezer.Search(context.Background(), "query", 0)
	if err != nil {
		t.Fatal(err)
	}
	second, err := deezer.Search(context.Background(), "query", 0)
	if err != nil {
		t.Fatal(err)
	}

	if atomic.LoadInt32(&hits) != 1 {
		t.Fatalf("запросов к Deezer %d, ожидался 1", hits)
	}
	if len(first) != 1 || len(second) != 1 {
		t.Fatalf("получено %d и %d треков", len(first), len(second))
	}
	if first[0].Title != "track" || first[0].Artist != "artist" {
		t.Fatalf("трек разобран неверно: %+v", first[0])
	}
}

func TestDeezerRetriesServerErrors(t *testing.T) {
	var hits int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&hits, 1) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		_, _ = w.Write([]byte(deezerPayload))
	}))
	defer server.Close()

	deezer := NewDeezer()
	deezer.base = server.URL

	tracks, err := deezer.Search(context.Background(), "query", 0)
	if err != nil {
		t.Fatalf("повтор не сработал: %v", err)
	}
	if atomic.LoadInt32(&hits) != 2 {
		t.Fatalf("запросов %d, ожидалось 2", hits)
	}
	if len(tracks) != 1 {
		t.Fatalf("получено %d треков", len(tracks))
	}
}

func TestDeezerCacheExpires(t *testing.T) {
	var hits int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		_, _ = w.Write([]byte(deezerPayload))
	}))
	defer server.Close()

	deezer := NewDeezer()
	deezer.base = server.URL
	deezer.ttl = 10 * time.Millisecond

	if _, err := deezer.Search(context.Background(), "query", 0); err != nil {
		t.Fatal(err)
	}

	time.Sleep(20 * time.Millisecond)

	if _, err := deezer.Search(context.Background(), "query", 0); err != nil {
		t.Fatal(err)
	}

	if atomic.LoadInt32(&hits) != 2 {
		t.Fatalf("запросов %d, ожидалось 2 после истечения кеша", hits)
	}
}

func TestDeezerDoesNotRetryClientErrors(t *testing.T) {
	var hits int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	deezer := NewDeezer()
	deezer.base = server.URL

	if _, err := deezer.Search(context.Background(), "query", 0); err == nil {
		t.Fatal("ожидалась ошибка")
	}
	if atomic.LoadInt32(&hits) != 1 {
		t.Fatalf("запросов %d, ожидался 1", hits)
	}
}

func TestDeezerGenreChartEndpoint(t *testing.T) {
	var request string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		request = r.URL.Path + "?" + r.URL.RawQuery
		_, _ = w.Write([]byte(deezerPayload))
	}))
	defer server.Close()

	deezer := NewDeezer()
	deezer.base = server.URL

	tracks, err := deezer.GenreChart(context.Background(), "116")
	if err != nil {
		t.Fatal(err)
	}

	if request != "/chart/116/tracks?limit=50" {
		t.Fatalf("запрос ушёл на %s", request)
	}
	if len(tracks) != 1 {
		t.Fatalf("получено %d треков, ожидался 1", len(tracks))
	}
}
