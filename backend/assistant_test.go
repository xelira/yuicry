package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestAssistantChatParsesToolCalls(t *testing.T) {
	var payload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("неверный ключ: %s", r.Header.Get("Authorization"))
		}

		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}

		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"","tool_calls":[{"id":"call-1","type":"function","function":{"name":"search_tracks","arguments":"{\"query\":\"Aphex Twin\"}"}}]}}]}`))
	}))
	defer server.Close()

	assistant := NewAssistant()
	assistant.endpoint = server.URL
	assistant.key = "test-key"

	turn, err := assistant.Chat(context.Background(), []AssistantMessage{{Role: "user", Content: "найди Aphex Twin"}}, assistantTools())
	if err != nil {
		t.Fatal(err)
	}

	if len(turn.ToolCalls) != 1 || turn.ToolCalls[0].Function.Name != "search_tracks" {
		t.Fatalf("получено %+v", turn)
	}

	if payload["model"] != "nvidia/nemotron-3.5-lightning-30b-a3b" {
		t.Fatalf("модель %v", payload["model"])
	}

	if _, ok := payload["tools"]; !ok {
		t.Fatal("инструменты не переданы")
	}
}

func TestAssistantChatReturnsText(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"Привет"}}]}`))
	}))
	defer server.Close()

	assistant := NewAssistant()
	assistant.endpoint = server.URL
	assistant.key = "test-key"

	turn, err := assistant.Chat(context.Background(), []AssistantMessage{{Role: "user", Content: "привет"}}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if turn.Content != "Привет" {
		t.Fatalf("получено %+v", turn)
	}
}

func TestAssistantWithoutKey(t *testing.T) {
	assistant := NewAssistant()
	assistant.key = ""

	if _, err := assistant.Chat(context.Background(), []AssistantMessage{{Role: "user", Content: "привет"}}, nil); err == nil {
		t.Fatal("ожидалась ошибка без ключа")
	}
}

func TestSearchTracksUsesFallbackQueries(t *testing.T) {
	var queries []string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		queries = append(queries, r.URL.Query().Get("q"))
		_, _ = w.Write([]byte(`{"data":[{"id":1,"title":"Xtal","duration":294,"artist":{"id":2,"name":"Aphex Twin"},"album":{"cover_big":"https://cdn/cover.jpg"}}]}`))
	}))
	defer server.Close()

	deezer := NewDeezer()
	deezer.base = server.URL
	api := &API{Deezer: deezer}

	tracks := api.searchTracks(context.Background(), "включи песню Aphex Twin", 6)
	if len(tracks) != 1 {
		t.Fatalf("получено %d треков", len(tracks))
	}

	if len(queries) == 0 || queries[0] != "включи песню Aphex Twin" {
		t.Fatalf("запросы: %v", queries)
	}
}

func TestCleanQuery(t *testing.T) {
	if value := cleanQuery("включи песню Aphex Twin"); value != "Aphex Twin" {
		t.Fatalf("получено %q", value)
	}

	if value := cleanQuery("посоветуй что-нибудь похожее на Boards of Canada"); value != "Boards of Canada" {
		t.Fatalf("получено %q", value)
	}
}

func TestParseIndex(t *testing.T) {
	if value := parseIndex("включи трек номер 2"); value != 2 {
		t.Fatalf("получено %d", value)
	}

	if value := parseIndex("включи 3-й трек"); value != 3 {
		t.Fatalf("получено %d", value)
	}

	if value := parseIndex("включи Aphex Twin"); value != 0 {
		t.Fatalf("получено %d", value)
	}
}

func TestLikesIntent(t *testing.T) {
	if !likesIntent("скажи мои избранные") {
		t.Fatal("избранное не распознано")
	}

	if likesIntent("поставь лайк") {
		t.Fatal("команда лайка принята за избранное")
	}
}

func TestAssistantPromptIncludesAttachment(t *testing.T) {
	prompt := assistantPrompt(AssistantContext{
		Track:      "Xtal",
		Artist:     "Aphex Twin",
		LastTracks: []string{"Xtal — Aphex Twin", "Avril 14th — Aphex Twin"},
		Attachment: &AssistantAttachment{
			Kind:   "playlist",
			Title:  "Вечер",
			Count:  2,
			Tracks: []string{"Xtal — Aphex Twin", "Avril 14th — Aphex Twin"},
		},
	})

	for _, value := range []string{"Xtal", "Последний показанный список", "Вечер", "1. Xtal"} {
		if !strings.Contains(prompt, value) {
			t.Fatalf("в промпте нет %q", value)
		}
	}
}

func TestSanitizeContextDropsBadAttachment(t *testing.T) {
	value := sanitizeContext(AssistantContext{
		Attachment: &AssistantAttachment{Kind: "unknown", Title: "x"},
	})

	if value.Attachment != nil {
		t.Fatal("неизвестное вложение не отброшено")
	}
}

func TestAssistantRateLimit(t *testing.T) {
	assistant := NewAssistant()

	for index := 0; index < 20; index += 1 {
		if !assistant.allow("user") {
			t.Fatalf("запрос %d отклонён слишком рано", index)
		}
	}

	if assistant.allow("user") {
		t.Fatal("21-й запрос должен быть отклонён")
	}

	assistant.mu.Lock()
	assistant.hits["old"] = []time.Time{time.Now().Add(-2 * time.Minute)}
	assistant.mu.Unlock()

	if !assistant.allow("old") {
		t.Fatal("старые запросы должны сбрасываться")
	}
}

func TestAssistantRateLimitCounts(t *testing.T) {
	var hits int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer server.Close()

	assistant := NewAssistant()
	assistant.endpoint = server.URL
	assistant.key = "test-key"

	for index := 0; index < 2; index += 1 {
		if _, err := assistant.Chat(context.Background(), []AssistantMessage{{Role: "user", Content: "привет"}}, nil); err != nil {
			t.Fatal(err)
		}
	}

	if atomic.LoadInt32(&hits) != 2 {
		t.Fatalf("запросов %d", hits)
	}
}
