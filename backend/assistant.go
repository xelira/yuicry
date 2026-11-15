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
	"regexp"
	"strings"
	"sync"
	"time"
)

type AssistantMessage struct {
	Role       string              `json:"role"`
	Content    string              `json:"content"`
	ToolCalls  []assistantToolCall `json:"tool_calls,omitempty"`
	ToolCallID string              `json:"tool_call_id,omitempty"`
}

type AssistantAttachment struct {
	Kind   string   `json:"kind"`
	ID     string   `json:"id"`
	Title  string   `json:"title"`
	Artist string   `json:"artist"`
	Count  int      `json:"count"`
	Tracks []string `json:"tracks"`
}

type AssistantContext struct {
	Track      string               `json:"track"`
	Artist     string               `json:"artist"`
	Playing    bool                 `json:"playing"`
	Queue      int                  `json:"queue"`
	Likes      int                  `json:"likes"`
	LastTracks []string             `json:"last_tracks"`
	Attachment *AssistantAttachment `json:"attachment"`
}

type assistantRequest struct {
	Messages []AssistantMessage `json:"messages"`
	Context  AssistantContext   `json:"context"`
}

type assistantResult struct {
	Reply   string
	Action  string
	Index   int
	Tracks  []Track
	Sources []webResult
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

var (
	playIntent       = regexp.MustCompile(`(?i)(включи|включай|поставь|сыграй|запусти|врубай)`)
	musicIntent      = regexp.MustCompile(`(?i)(посоветуй|что послушать|похожее|трек|песн|альбом|исполнител|музык|подборк|жанр)`)
	recommendIntent  = regexp.MustCompile(`(?i)(посоветуй|посоветуйте|что послушать|похожее|похожие|подборк|рекоменд|найди|поищи|покажи треки|какую музыку)`)
	numberIntent     = regexp.MustCompile(`(?i)(?:номер|№|под номером|песн[юя]|трек)\s*(\d{1,2})|(\d{1,2})\s*(?:-?й|трек|песн)`)
	attachmentMarker = regexp.MustCompile(`(?m)^\[Вложение:[^\]]*\]\s*`)
)

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
	if err := json.NewDecoder(io.LimitReader(r.Body, 128<<10)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохое тело"})
		return
	}

	messages := sanitizeMessages(body.Messages)
	if len(messages) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "нужен вопрос"})
		return
	}

	info := sanitizeContext(body.Context)
	if info.Attachment != nil && info.Attachment.Kind == "playlist" && info.Attachment.ID != "" {
		if tracks, err := a.Store.AlbumTracks(current.UserID, info.Attachment.ID); err == nil {
			info.Attachment.Tracks = trackTitles(tracks, 10)
			info.Attachment.Count = len(tracks)
		}
	}

	result, err := a.askAssistant(r.Context(), current.UserID, messages, info)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "ассистент недоступен"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"reply":   result.Reply,
		"action":  result.Action,
		"index":   result.Index,
		"tracks":  result.Tracks,
		"sources": result.Sources,
	})
}

func (a *API) askAssistant(ctx context.Context, userID string, history []AssistantMessage, info AssistantContext) (assistantResult, error) {
	lastUser := ""
	for index := len(history) - 1; index >= 0; index -= 1 {
		if history[index].Role == "user" {
			lastUser = userQuestion(history[index].Content)
			break
		}
	}

	messages := append([]AssistantMessage{{Role: "system", Content: assistantPrompt(info)}}, history...)
	result := assistantResult{Action: "none"}
	usedWeb := false
	var web []webResult

	for round := 0; round < 3; round += 1 {
		turn, err := a.Assistant.Chat(ctx, messages, assistantTools())
		if err != nil {
			return result, err
		}

		if len(turn.ToolCalls) == 0 {
			result.Reply = cleanReply(turn.Content)
			break
		}

		for index := range turn.ToolCalls {
			if turn.ToolCalls[index].ID == "" {
				turn.ToolCalls[index].ID = fmt.Sprintf("call-%d", index+1)
			}

			if turn.ToolCalls[index].Type == "" {
				turn.ToolCalls[index].Type = "function"
			}
		}

		messages = append(messages, turn)

		for index := range turn.ToolCalls {
			call := turn.ToolCalls[index]
			tool := a.runAssistantTool(ctx, userID, call)
			messages = append(messages, AssistantMessage{
				Role:       "tool",
				ToolCallID: call.ID,
				Content:    tool.Content,
			})

			result.Tracks = mergeTracks(result.Tracks, tool.Tracks)

			if tool.Action != "" && tool.Action != "none" {
				result.Action = tool.Action
			}

			if tool.Index > 0 {
				result.Index = tool.Index
			}

			if tool.Web {
				usedWeb = true
			}

			if len(tool.WebResults) > 0 {
				web = tool.WebResults
				result.Sources = mergeWebResults(result.Sources, tool.WebResults)
			}
		}
	}

	if result.Action == "none" {
		if strongIntent(lastUser) {
			a.intentFallback(ctx, userID, lastUser, &result)
		} else if len(result.Tracks) == 0 && recommendIntent.MatchString(lastUser) {
			query := cleanQuery(lastUser)

			if info.Attachment != nil {
				query = attachmentQuery(info)
			}

			if query != "" {
				result.Tracks = a.searchTracks(ctx, query, 6)
			}
		}
	}

	if (result.Action == "play_likes" || result.Action == "show_likes") && likesIntent(lastUser) {
		if playIntent.MatchString(lastUser) {
			result.Action = "play_likes"
			result.Reply = "Включаю избранное."
		} else {
			result.Action = "show_likes"
			result.Reply = likesReply(result.Tracks)
		}
	}

	if result.Action == "play" && len(result.Tracks) == 0 {
		result.Tracks = a.searchTracks(ctx, cleanQuery(lastUser), 6)

		if len(result.Tracks) == 0 {
			result.Action = "none"
			result.Reply = notFoundReply(lastUser)
		}
	}

	if (result.Action == "play_likes" || result.Action == "show_likes") && len(result.Tracks) == 0 {
		result.Tracks = a.likedTracks(userID, 10)

		if len(result.Tracks) == 0 {
			result.Action = "none"
			result.Reply = "В избранном пока пусто. Добавь треки лайком — и я смогу их включить."
		}
	}

	if result.Action == "play_index" && result.Index <= 0 {
		result.Index = parseIndex(lastUser)

		if result.Index <= 0 {
			result.Action = "none"
			result.Reply = "Не понял номер трека. Скажи, например: «включи трек номер 2»."
		}
	}

	if !usedWeb && result.Action == "none" && len(result.Tracks) == 0 && needsWeb(lastUser) {
		results, err := a.webSearch(ctx, lastUser)
		if err == nil && len(results) > 0 {
			web = results
			result.Sources = results
			extra := append(append([]AssistantMessage{}, history...), AssistantMessage{
				Role: "user",
				Content: "Дополнительная информация из поиска:\n" + formatWebResults(results) +
					"\nОтветь на исходный вопрос кратко, по-русски, без markdown.",
			})

			if turn, err := a.Assistant.Chat(ctx, extra, nil); err == nil {
				if value := cleanReply(turn.Content); value != "" {
					result.Reply = value
				}
			}
		}
	}

	if result.Reply == "" {
		if info.Attachment != nil {
			result.Reply = attachmentReply(info)
		} else {
			result.Reply = fallbackReply(result, len(web))
		}
	}

	if result.Action == "play" && len(result.Tracks) > 0 && result.Reply == "" {
		result.Reply = "Включаю «" + result.Tracks[0].Title + "» — " + result.Tracks[0].Artist + "."
	}

	return result, nil
}

func (a *Assistant) Chat(ctx context.Context, messages []AssistantMessage, tools []map[string]any) (AssistantMessage, error) {
	if a.key == "" {
		return AssistantMessage{}, errAssistantDisabled
	}

	payload := map[string]any{
		"model":       a.model,
		"messages":    messages,
		"temperature": 0.35,
		"top_p":       0.9,
		"max_tokens":  700,
		"stream":      false,
		"chat_template_kwargs": map[string]any{
			"enable_thinking": false,
		},
	}

	if len(tools) > 0 {
		payload["tools"] = tools
		payload["tool_choice"] = "auto"
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return AssistantMessage{}, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, a.endpoint, bytes.NewReader(body))
	if err != nil {
		return AssistantMessage{}, err
	}

	request.Header.Set("Authorization", "Bearer "+a.key)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")

	response, err := a.client.Do(request)
	if err != nil {
		return AssistantMessage{}, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return AssistantMessage{}, fmt.Errorf("assistant: статус %d", response.StatusCode)
	}

	var completion struct {
		Choices []struct {
			Message AssistantMessage `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&completion); err != nil {
		return AssistantMessage{}, err
	}

	if len(completion.Choices) == 0 {
		return AssistantMessage{}, errors.New("assistant: пустой ответ")
	}

	turn := completion.Choices[0].Message
	if strings.TrimSpace(turn.Content) == "" && len(turn.ToolCalls) == 0 {
		return AssistantMessage{}, errors.New("assistant: пустой текст")
	}

	return turn, nil
}

func (a *API) intentFallback(ctx context.Context, userID, message string, result *assistantResult) {
	value := strings.ToLower(strings.TrimSpace(message))
	if value == "" {
		return
	}

	if likesIntent(value) {
		action := "show_likes"
		if playIntent.MatchString(value) {
			action = "play_likes"
		}

		tracks := a.likedTracks(userID, 10)
		result.Action = action
		result.Tracks = tracks

		if len(tracks) == 0 {
			result.Action = "none"
			result.Reply = "В избранном пока пусто. Добавь треки лайком — и я смогу их включить."
			return
		}

		if action == "play_likes" {
			result.Reply = "Включаю избранное."
		} else {
			result.Reply = fmt.Sprintf("Вот твои избранные: %d треков.", len(tracks))
		}

		return
	}

	if index := parseIndex(value); index > 0 && (playIntent.MatchString(value) || strings.Contains(value, "включи")) {
		result.Action = "play_index"
		result.Index = index
		result.Reply = fmt.Sprintf("Включаю трек номер %d.", index)
		return
	}

	if strings.Contains(value, "волн") && playIntent.MatchString(value) {
		result.Action = "wave"
		result.Reply = "Включаю твою волну."
		return
	}

	if strings.Contains(value, "пауза") || strings.Contains(value, "паузу") || strings.Contains(value, "останови") || strings.Contains(value, "стоп") {
		result.Action = "pause"
		result.Reply = "Пауза."
		return
	}

	if strings.Contains(value, "продолжи") || strings.Contains(value, "возобнови") || strings.Contains(value, "играй") {
		result.Action = "resume"
		result.Reply = "Продолжаю."
		return
	}

	if strings.Contains(value, "следующ") || strings.Contains(value, "дальше") {
		result.Action = "next"
		result.Reply = "Включаю следующий."
		return
	}

	if strings.Contains(value, "предыдущ") || strings.Contains(value, "назад") {
		result.Action = "previous"
		result.Reply = "Возвращаю предыдущий."
		return
	}

	if strings.Contains(value, "лайк") || strings.Contains(value, "нравится") {
		result.Action = "like"
		result.Reply = "Ставлю лайк."
		return
	}

	if !playIntent.MatchString(value) && !musicIntent.MatchString(value) {
		return
	}

	query := cleanQuery(message)
	if query == "" {
		result.Reply = "Что включить? Назови трек, исполнителя или скажи «мои избранные»."
		return
	}

	tracks := a.searchTracks(ctx, query, 6)
	if len(tracks) == 0 {
		tracks = a.searchTracks(ctx, message, 6)
	}

	if len(tracks) == 0 {
		result.Action = "none"
		result.Reply = notFoundReply(message)
		return
	}

	result.Tracks = tracks

	if playIntent.MatchString(value) {
		result.Action = "play"
		result.Reply = "Включаю «" + tracks[0].Title + "» — " + tracks[0].Artist + "."
		return
	}

	result.Action = "none"
	result.Reply = "Вот что нашёл в каталоге."
}

func likesIntent(value string) bool {
	return strings.Contains(value, "избранн") ||
		strings.Contains(value, "любим") ||
		strings.Contains(value, "мои лайк") ||
		strings.Contains(value, "моих лайк") ||
		strings.Contains(value, "лайки")
}

func strongIntent(value string) bool {
	lower := strings.ToLower(value)

	return playIntent.MatchString(lower) ||
		likesIntent(lower) ||
		parseIndex(lower) > 0 ||
		strings.Contains(lower, "волн") ||
		strings.Contains(lower, "пауза") ||
		strings.Contains(lower, "паузу") ||
		strings.Contains(lower, "останови") ||
		strings.Contains(lower, "продолжи") ||
		strings.Contains(lower, "следующ") ||
		strings.Contains(lower, "предыдущ") ||
		strings.Contains(lower, "лайк") ||
		strings.Contains(lower, "нравится")
}

func userQuestion(value string) string {
	return strings.TrimSpace(attachmentMarker.ReplaceAllString(value, ""))
}

func parseIndex(value string) int {
	match := numberIntent.FindStringSubmatch(value)
	if len(match) == 0 {
		return 0
	}

	for index := 1; index < len(match); index += 1 {
		if match[index] == "" {
			continue
		}

		var parsed int
		_, err := fmt.Sscanf(match[index], "%d", &parsed)
		if err == nil && parsed > 0 {
			return parsed
		}
	}

	return 0
}

func notFoundReply(value string) string {
	query := cleanQuery(value)
	if query == "" {
		return "Не нашёл. Попробуй назвать исполнителя или трек иначе."
	}

	return "Не нашёл «" + query + "». Попробуй назвать иначе или скажи исполнителя."
}

func pluralTracks(count int) string {
	value := count % 100
	last := value % 10

	if value > 10 && value < 20 {
		return "треков"
	}

	if last == 1 {
		return "трек"
	}

	if last >= 2 && last <= 4 {
		return "трека"
	}

	return "треков"
}

func attachmentQuery(info AssistantContext) string {
	if info.Attachment == nil {
		return ""
	}

	if info.Attachment.Kind == "track" {
		return strings.TrimSpace(info.Attachment.Title + " " + info.Attachment.Artist)
	}

	for _, line := range info.Attachment.Tracks {
		parts := strings.SplitN(line, " — ", 2)
		if len(parts) == 2 && strings.TrimSpace(parts[1]) != "" {
			return strings.TrimSpace(parts[1])
		}
	}

	return strings.TrimSpace(info.Attachment.Title)
}

func attachmentReply(info AssistantContext) string {
	if info.Attachment == nil {
		return ""
	}

	if info.Attachment.Kind == "track" {
		return "Прикреплён трек «" + info.Attachment.Title + "» — " + info.Attachment.Artist + ". Спроси, что это, или попроси похожее."
	}

	return fmt.Sprintf("Прикреплён плейлист «%s» (%d %s). Спроси, что это, или попроси похожее.", info.Attachment.Title, info.Attachment.Count, pluralTracks(info.Attachment.Count))
}

func likesReply(tracks []Track) string {
	if len(tracks) == 0 {
		return "В избранном пока пусто. Добавь треки лайком — и я смогу их включить."
	}

	names := make([]string, 0, 3)
	for index, track := range tracks {
		if index >= 3 {
			break
		}
		names = append(names, track.Title)
	}

	suffix := ""
	if len(tracks) > 3 {
		suffix = fmt.Sprintf(" и ещё %d", len(tracks)-3)
	}

	return "Вот твои избранные: " + strings.Join(names, ", ") + suffix + "."
}

func fallbackReply(result assistantResult, webCount int) string {
	if len(result.Tracks) > 0 && result.Action == "play" {
		return "Включаю «" + result.Tracks[0].Title + "» — " + result.Tracks[0].Artist + "."
	}

	switch result.Action {
	case "play_likes":
		return "Включаю избранное."
	case "show_likes":
		return "Вот твои избранные."
	case "play_index":
		return fmt.Sprintf("Включаю трек номер %d.", result.Index)
	case "wave":
		return "Включаю твою волну."
	case "pause":
		return "Пауза."
	case "resume":
		return "Продолжаю."
	case "next":
		return "Включаю следующий."
	case "previous":
		return "Возвращаю предыдущий."
	case "like":
		return "Ставлю лайк."
	}

	if len(result.Tracks) > 0 {
		return "Вот что нашёл в каталоге."
	}

	if webCount > 0 {
		return "Вот что удалось найти."
	}

	return "Готов помочь с музыкой."
}

func cleanReply(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "**", "")
	value = strings.ReplaceAll(value, "__", "")
	value = strings.ReplaceAll(value, "`", "")
	value = strings.TrimPrefix(value, "```json")
	value = strings.TrimPrefix(value, "```")
	value = strings.TrimSuffix(value, "```")
	value = strings.TrimSpace(value)

	if strings.HasPrefix(value, "{") {
		var draft struct {
			Reply string `json:"reply"`
		}

		if json.Unmarshal([]byte(value), &draft) == nil && strings.TrimSpace(draft.Reply) != "" {
			return strings.TrimSpace(draft.Reply)
		}
	}

	return value
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

	var context strings.Builder
	fmt.Fprintf(&context, "Сейчас %s трек «%s» исполнителя «%s»; в очереди %d треков; лайков %d.", playing, track, artist, info.Queue, info.Likes)

	if len(info.LastTracks) > 0 {
		context.WriteString("\nПоследний показанный список треков:")
		for index, value := range info.LastTracks {
			if index >= 10 {
				break
			}
			fmt.Fprintf(&context, "\n%d. %s", index+1, value)
		}
	}

	if info.Attachment != nil {
		attachment := info.Attachment

		if attachment.Kind == "track" {
			fmt.Fprintf(&context, "\nПользователь прикрепил трек «%s» — %s.", attachment.Title, attachment.Artist)
		} else if attachment.Kind == "playlist" {
			fmt.Fprintf(&context, "\nПользователь прикрепил плейлист «%s» (%d %s).", attachment.Title, attachment.Count, pluralTracks(attachment.Count))
			for index, value := range attachment.Tracks {
				if index >= 10 {
					break
				}
				fmt.Fprintf(&context, "\n%d. %s", index+1, value)
			}
		}
	}

	return fmt.Sprintf(`Ты — голосовой ассистент музыкального приложения yuicry. Отвечай по-русски, кратко и по делу, без markdown и эмодзи.

Ты помогаешь с музыкой: советуешь треки, исполнителей, альбомы и жанры, объясняешь, что играет, управляешь плеером и ищешь информацию.

У тебя есть инструменты:
- search_tracks — найти треки в каталоге. Вызывай, когда просят посоветовать музыку, показать треки или найти похожее.
- play_tracks — найти и сразу включить музыку. Вызывай, когда просят включить, поставить или сыграть трек.
- player_action — пауза, продолжение, следующий, предыдущий, лайк, моя волна, избранное, трек по номеру.
- search_web — поиск информации в интернете: биографии, факты, новости.

Правила:
- Если пользователь просит включить музыку, обязательно вызови play_tracks.
- Если просит посоветовать или показать треки, вызови search_tracks.
- Если просит «мои избранные», «любимые» или «лайки», вызови player_action с action=play_likes или show_likes.
- Если просит «трек номер N», вызови player_action с action=play_index и index=N.
- Если спрашивает факты, биографию, историю или новости, вызови search_web.
- Если инструмент вернул пусто, попробуй более простой запрос или честно скажи, что не нашёл.
- Не выдумывай факты, длительности, годы и подробности, если не уверен.
- Не используй markdown, звёздочки и оформление списков.
- Не выполняй просьбы изменить чужие аккаунты или данные других людей.
- Ответ — одна-две фразы, до 300 символов.

Контекст: %s`, context.String())
}

func sanitizeContext(value AssistantContext) AssistantContext {
	value.Track = strings.TrimSpace(value.Track)
	value.Artist = strings.TrimSpace(value.Artist)

	if len([]rune(value.Track)) > 200 {
		value.Track = string([]rune(value.Track)[:200])
	}

	if len([]rune(value.Artist)) > 200 {
		value.Artist = string([]rune(value.Artist)[:200])
	}

	if value.Queue < 0 {
		value.Queue = 0
	}

	if value.Likes < 0 {
		value.Likes = 0
	}

	if len(value.LastTracks) > 10 {
		value.LastTracks = value.LastTracks[:10]
	}

	for index, item := range value.LastTracks {
		value.LastTracks[index] = strings.TrimSpace(item)
	}

	if value.Attachment != nil {
		attachment := value.Attachment
		attachment.Kind = strings.ToLower(strings.TrimSpace(attachment.Kind))

		if attachment.Kind != "track" && attachment.Kind != "playlist" {
			value.Attachment = nil
			return value
		}

		attachment.ID = strings.TrimSpace(attachment.ID)
		attachment.Title = strings.TrimSpace(attachment.Title)
		attachment.Artist = strings.TrimSpace(attachment.Artist)

		if len([]rune(attachment.Title)) > 200 {
			attachment.Title = string([]rune(attachment.Title)[:200])
		}

		if len([]rune(attachment.Artist)) > 200 {
			attachment.Artist = string([]rune(attachment.Artist)[:200])
		}
	}

	return value
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

func trackTitles(tracks []Track, limit int) []string {
	if len(tracks) > limit {
		tracks = tracks[:limit]
	}

	result := make([]string, 0, len(tracks))
	for _, track := range tracks {
		result = append(result, track.Title+" — "+track.Artist)
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
