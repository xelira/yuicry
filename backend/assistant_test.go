package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestParseAssistantDraftJSON(t *testing.T) {
	draft := parseAssistantDraft("```json\n{\"reply\":\"Включаю\",\"action\":\"play\",\"search\":\"Daft Punk Aerodynamic\"}\n```")

	if draft.Reply != "Включаю" || draft.Action != "play" || draft.Search != "Daft Punk Aerodynamic" {
		t.Fatalf("получено %+v", draft)
	}
}

func TestParseAssistantDraftPlainText(t *testing.T) {
	draft := parseAssistantDraft("Просто ответ без JSON")

	if draft.Reply != "Просто ответ без JSON" || draft.Action != "none" || draft.Search != "" {
		t.Fatalf("получено %+v", draft)
	}
}

func TestParseAssistantDraftNormalizesAction(t *testing.T) {
	if got := parseAssistantDraft(`{"reply":"x","action":"delete"}`); got.Action != "none" {
		t.Fatalf("неизвестное действие стало %s", got.Action)
	}

	if got := parseAssistantDraft(`{"reply":"x","action":"play"}`); got.Action != "none" {
		t.Fatalf("play без запроса стало %s", got.Action)
	}

	if got := parseAssistantDraft(`{"reply":"x","action":"wave","search":"jazz"}`); got.Search != "" {
		t.Fatalf("wave сохранил поиск: %s", got.Search)
	}
}

func TestAssistantComplete(t *testing.T) {
	var payload map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("неверный ключ: %s", r.Header.Get("Authorization"))
		}

		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}

		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"reply\":\"Слушаю\",\"action\":\"pause\",\"search\":\"\"}"}}]}`))
	}))
	defer server.Close()

	assistant := NewAssistant()
	assistant.endpoint = server.URL
	assistant.key = "test-key"

	draft, err := assistant.Complete(context.Background(), []AssistantMessage{{Role: "user", Content: "поставь на паузу"}}, AssistantContext{Track: "Xtal", Artist: "Aphex Twin", Playing: true, Queue: 4, Likes: 7})
	if err != nil {
		t.Fatal(err)
	}

	if draft.Reply != "Слушаю" || draft.Action != "pause" {
		t.Fatalf("получено %+v", draft)
	}

	if payload["model"] != "nvidia/nemotron-3.5-lightning-30b-a3b" {
		t.Fatalf("модель %v", payload["model"])
	}

	template, _ := payload["chat_template_kwargs"].(map[string]any)
	if template["enable_thinking"] != false {
		t.Fatalf("thinking не отключён: %v", template)
	}

	messages, _ := payload["messages"].([]any)
	if len(messages) != 2 {
		t.Fatalf("сообщений %d", len(messages))
	}

	system, _ := messages[0].(map[string]any)
	text, _ := system["content"].(string)
	if !strings.Contains(text, "Xtal") || !strings.Contains(text, "Aphex Twin") {
		t.Fatalf("контекст не попал в промпт: %s", text)
	}
}

func TestAssistantWithoutKey(t *testing.T) {
	assistant := NewAssistant()
	assistant.key = ""

	if _, err := assistant.Complete(context.Background(), []AssistantMessage{{Role: "user", Content: "привет"}}, AssistantContext{}); err == nil {
		t.Fatal("ожидалась ошибка без ключа")
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
