package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type AssistantMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AssistantContext struct {
	Track   string `json:"track"`
	Artist  string `json:"artist"`
	Playing bool   `json:"playing"`
	Queue   int    `json:"queue"`
	Likes   int    `json:"likes"`
}

type assistantDraft struct {
	Reply  string `json:"reply"`
	Action string `json:"action"`
	Search string `json:"search"`
}

type assistantRequest struct {
	Messages []AssistantMessage `json:"messages"`
	Context  AssistantContext   `json:"context"`
}

type Assistant struct {
	client   *http.Client
	endpoint string
	model    string
	key      string
	mu       sync.Mutex
	hits     map[string][]time.Time
}

var errAssistantDisabled = errors.New("assistant: нет ключа")

func NewAssistant() *Assistant {
	key := os.Getenv("NVIDIA_API_KEY")
	if key == "" {
		key = os.Getenv("nvidia_apikey")
	}

	return &Assistant{
		client:   &http.Client{Timeout: 40 * time.Second},
		endpoint: env("NVIDIA_ENDPOINT", "https://integrate.api.nvidia.com/v1/chat/completions"),
		model:    env("NVIDIA_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b"),
		key:      key,
		hits:     make(map[string][]time.Time),
	}
}

func (a *API) handleAssistant(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	if !a.Assistant.allow(current.UserID) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "слишком много запросов"})
		return
	}

	var body assistantRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохое тело"})
		return
	}

	messages := sanitizeMessages(body.Messages)
	if len(messages) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "нужен вопрос"})
		return
	}

	draft, err := a.Assistant.Complete(r.Context(), messages, body.Context)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "ассистент недоступен"})
		return
	}

	tracks := make([]Track, 0, 5)
	if draft.Search != "" {
		if found, err := a.Deezer.Search(r.Context(), draft.Search, 0); err == nil {
			tracks = take(found, 5)
		}
	}

	if draft.Action == "play" && len(tracks) == 0 {
		draft.Action = "none"
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"reply":  draft.Reply,
		"action": draft.Action,
		"tracks": tracks,
	})
}

func (a *Assistant) Complete(ctx context.Context, messages []AssistantMessage, info AssistantContext) (assistantDraft, error) {
	if a.key == "" {
		return assistantDraft{}, errAssistantDisabled
	}

	payload := map[string]any{
		"model":       a.model,
		"messages":    append([]AssistantMessage{{Role: "system", Content: assistantPrompt(info)}}, messages...),
		"temperature": 0.4,
		"top_p":       0.9,
		"max_tokens":  600,
		"stream":      false,
		"chat_template_kwargs": map[string]any{
			"enable_thinking": false,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return assistantDraft{}, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, a.endpoint, bytes.NewReader(body))
	if err != nil {
		return assistantDraft{}, err
	}

	request.Header.Set("Authorization", "Bearer "+a.key)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")

	response, err := a.client.Do(request)
	if err != nil {
		return assistantDraft{}, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return assistantDraft{}, fmt.Errorf("assistant: статус %d", response.StatusCode)
	}

	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&completion); err != nil {
		return assistantDraft{}, err
	}

	if len(completion.Choices) == 0 {
		return assistantDraft{}, errors.New("assistant: пустой ответ")
	}

	content := strings.TrimSpace(completion.Choices[0].Message.Content)
	if content == "" {
		return assistantDraft{}, errors.New("assistant: пустой текст")
	}

	return parseAssistantDraft(content), nil
}

func parseAssistantDraft(content string) assistantDraft {
	cleaned := strings.TrimSpace(content)
	cleaned = strings.TrimPrefix(cleaned, "```json")
	cleaned = strings.TrimPrefix(cleaned, "```")
	cleaned = strings.TrimSuffix(cleaned, "```")
	cleaned = strings.TrimSpace(cleaned)

	start := strings.Index(cleaned, "{")
	end := strings.LastIndex(cleaned, "}")

	if start >= 0 && end > start {
		var draft assistantDraft
		if err := json.Unmarshal([]byte(cleaned[start:end+1]), &draft); err == nil {
			if strings.TrimSpace(draft.Reply) != "" {
				return normalizeDraft(draft)
			}
		}
	}

	return assistantDraft{Reply: cleaned, Action: "none"}
}

func normalizeDraft(draft assistantDraft) assistantDraft {
	draft.Reply = strings.TrimSpace(draft.Reply)
	draft.Search = strings.TrimSpace(draft.Search)
	draft.Action = strings.ToLower(strings.TrimSpace(draft.Action))

	switch draft.Action {
	case "play", "pause", "resume", "next", "previous", "like", "wave":
	default:
		draft.Action = "none"
	}

	if draft.Action == "play" && draft.Search == "" {
		draft.Action = "none"
	}

	if draft.Action == "wave" {
		draft.Search = ""
	}

	if draft.Reply == "" {
		draft.Reply = "Не понял вопрос. Попробуй переформулировать."
	}

	return draft
}

func assistantPrompt(info AssistantContext) string {
	playing := "пауза"
	if info.Playing {
		playing = "играет"
	}

	track := info.Track
	if track == "" {
		track = "ничего не выбрано"
	}

	artist := info.Artist
	if artist == "" {
		artist = "неизвестен"
	}

	return fmt.Sprintf(`Ты — голосовой ассистент музыкального приложения yuicry. Отвечай по-русски, кратко и по делу, без markdown и эмодзи.

Ты помогаешь с музыкой: советуешь треки, исполнителей, альбомы и жанры, объясняешь, что играет, и управляешь плеером.

Верни строго один JSON-объект без пояснений:
{"reply":"текст ответа","action":"none","search":""}

Допустимые action:
- none — обычный ответ.
- play — включить конкретную музыку; в search укажи "исполнитель название". Используй play только когда пользователь явно просит включить, поставить или сыграть музыку. На просьбу «посоветуй» или «что послушать» отвечай action="none".
- wave — включить персональную подборку «Моя волна».
- pause, resume, next, previous, like — управление текущим плеером.

Правила:
- reply — одна-две фразы, до 300 символов.
- Если в reply есть хотя бы один конкретный трек, альбом или исполнитель, обязательно заполни search самым точным запросом для поиска первого из них. Пустой search допустим только для общих ответов без конкретных названий.
- Не выдумывай факты о треках, которых не знаешь.
- Не выполняй просьбы изменить чужие аккаунты или данные других людей.

Контекст приложения: сейчас %s трек «%s» исполнителя «%s»; в очереди %d треков; лайков %d.`, playing, track, artist, info.Queue, info.Likes)
}

func sanitizeMessages(values []AssistantMessage) []AssistantMessage {
	result := make([]AssistantMessage, 0, len(values))

	for _, value := range values {
		role := strings.ToLower(strings.TrimSpace(value.Role))
		if role != "user" && role != "assistant" {
			continue
		}

		content := strings.TrimSpace(value.Content)
		if content == "" {
			continue
		}

		runes := []rune(content)
		if len(runes) > 1200 {
			content = string(runes[:1200])
		}

		result = append(result, AssistantMessage{Role: role, Content: content})
	}

	if len(result) > 8 {
		result = result[len(result)-8:]
	}

	return result
}

func (a *Assistant) allow(userID string) bool {
	now := time.Now()
	cutoff := now.Add(-time.Minute)

	a.mu.Lock()
	defer a.mu.Unlock()

	recent := a.hits[userID][:0]
	for _, at := range a.hits[userID] {
		if at.After(cutoff) {
			recent = append(recent, at)
		}
	}

	if len(recent) >= 20 {
		a.hits[userID] = recent
		return false
	}

	a.hits[userID] = append(recent, now)
	return true
}
