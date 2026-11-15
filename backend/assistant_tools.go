package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type assistantToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type assistantToolResult struct {
	Content    string
	Tracks     []Track
	Action     string
	Index      int
	Web        bool
	WebResults []webResult
	Playlist   *AssistantPlaylist
}

type webResult struct {
	Title string `json:"title"`
	URL   string `json:"url"`
	Text  string `json:"text"`
}

var (
	quoted     = regexp.MustCompile(`["«]([^"»]{2,80})["»]`)
	latinWord  = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9'&.-]+$`)
	tagPattern = regexp.MustCompile(`<[^>]+>`)
	webIntent  = regexp.MustCompile(`(?i)(кто такой|кто такая|кто такие|что такое|расскажи|биограф|история|когда|где|почему|сколько|новости|факт|информац|что известно|чем известен)`)
	stopWords  = map[string]bool{
		"включи": true, "включай": true, "поставь": true, "сыграй": true, "запусти": true,
		"врубай": true, "мне": true, "пожалуйста": true, "пожалуй": true, "трек": true,
		"треки": true, "песню": true, "песня": true, "песни": true, "музыку": true,
		"музыка": true, "что-нибудь": true, "что-то": true, "похожее": true,
		"похожий": true, "похожие": true, "на": true, "в": true, "стиле": true,
		"жанре": true, "под": true, "настроение": true, "номер": true, "номером": true,
		"из": true, "мои": true, "мою": true, "моё": true, "мое": true,
		"избранные": true, "избранное": true, "любимые": true, "лайк": true,
		"лайки": true, "давай": true, "хочу": true, "посоветуй": true,
		"посоветуйте": true, "можешь": true, "может": true, "скажи": true,
		"покажи": true, "найди": true, "поищи": true, "волну": true, "волна": true,
	}
)

func assistantTools() []map[string]any {
	trackQuery := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"query": map[string]any{"type": "string", "description": "Поисковый запрос: исполнитель и/или название"},
			"limit": map[string]any{"type": "integer", "minimum": 1, "maximum": 6},
		},
		"required": []string{"query"},
	}

	action := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"action": map[string]any{
				"type": "string",
				"enum": []string{
					"pause", "resume", "next", "previous", "like", "wave",
					"play_likes", "show_likes", "play_index", "remove_current",
					"repeat", "shuffle", "save_queue", "queue_info",
				},
			},
			"index": map[string]any{"type": "integer", "minimum": 1},
			"title": map[string]any{"type": "string", "description": "Название плейлиста при сохранении очереди"},
		},
		"required": []string{"action"},
	}

	web := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"query": map[string]any{"type": "string", "description": "Запрос для поиска информации в интернете"},
		},
		"required": []string{"query"},
	}

	return []map[string]any{
		{
			"type": "function",
			"function": map[string]any{
				"name":        "search_tracks",
				"description": "Найти треки в каталоге Deezer. Используй, когда просят посоветовать музыку или показать треки.",
				"parameters":  trackQuery,
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "play_tracks",
				"description": "Найти и сразу включить музыку. Используй, когда просят включить, поставить или сыграть трек.",
				"parameters":  trackQuery,
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "queue_tracks",
				"description": "Найти треки и поставить их следующими в очередь. Используй для «поставь следующим».",
				"parameters":  trackQuery,
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "player_action",
				"description": "Управление плеером: пауза, продолжение, следующий, предыдущий, лайк, моя волна, избранное, трек по номеру, убрать текущий, повторить, перемешать, сохранить очередь, показать очередь.",
				"parameters":  action,
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "remember_preference",
				"description": "Запомнить музыкальное предпочтение пользователя: жанр, исполнителя или заметку.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"kind":  map[string]any{"type": "string", "enum": []string{"like", "dislike", "note"}},
						"value": map[string]any{"type": "string"},
					},
					"required": []string{"kind", "value"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "search_web",
				"description": "Найти информацию в интернете: биографии, факты, новости, объяснения. Используй, когда знаний недостаточно.",
				"parameters":  web,
			},
		},
	}
}

func (a *API) runAssistantTool(ctx context.Context, userID string, call assistantToolCall, info AssistantContext) assistantToolResult {
	switch call.Function.Name {
	case "search_tracks":
		var args struct {
			Query string `json:"query"`
			Limit int    `json:"limit"`
		}

		_ = json.Unmarshal([]byte(call.Function.Arguments), &args)
		tracks := a.searchTracks(ctx, args.Query, clampLimit(args.Limit, 6))

		return assistantToolResult{
			Content: trackToolContent(tracks, ""),
			Tracks:  tracks,
		}

	case "play_tracks":
		var args struct {
			Query string `json:"query"`
			Limit int    `json:"limit"`
		}

		_ = json.Unmarshal([]byte(call.Function.Arguments), &args)
		tracks := a.searchTracks(ctx, args.Query, clampLimit(args.Limit, 6))
		action := ""

		if len(tracks) > 0 {
			action = "play"
		}

		return assistantToolResult{
			Content: trackToolContent(tracks, action),
			Tracks:  tracks,
			Action:  action,
		}

	case "queue_tracks":
		var args struct {
			Query string `json:"query"`
			Limit int    `json:"limit"`
		}

		_ = json.Unmarshal([]byte(call.Function.Arguments), &args)
		tracks := a.searchTracks(ctx, args.Query, clampLimit(args.Limit, 6))
		action := ""

		if len(tracks) > 0 {
			action = "queue_next"
		}

		return assistantToolResult{
			Content: trackToolContent(tracks, action),
			Tracks:  tracks,
			Action:  action,
		}

	case "player_action":
		var args struct {
			Action string `json:"action"`
			Index  int    `json:"index"`
			Title  string `json:"title"`
		}

		_ = json.Unmarshal([]byte(call.Function.Arguments), &args)
		action := normalizeAssistantAction(args.Action)
		result := assistantToolResult{Action: action, Index: args.Index}

		if action == "play_likes" || action == "show_likes" {
			result.Tracks = a.likedTracks(userID, 10)
		}

		if action == "save_queue" {
			playlist, err := a.saveQueuePlaylist(userID, info.QueueTracks, args.Title)
			if err != nil {
				result.Action = "none"
				result.Content = `{"error":"очередь пуста"}`
				return result
			}

			result.Action = "queue_saved"
			result.Playlist = playlist
			result.Content = `{"ok":true}`
			return result
		}

		if action == "queue_info" {
			result.Action = "none"
			result.Content = queueToolContent(info)
			return result
		}

		result.Content = trackToolContent(result.Tracks, action)
		return result

	case "remember_preference":
		var args struct {
			Kind  string `json:"kind"`
			Value string `json:"value"`
		}

		_ = json.Unmarshal([]byte(call.Function.Arguments), &args)
		if err := a.Store.RememberPreference(userID, args.Kind, args.Value); err != nil {
			return assistantToolResult{Content: `{"error":"не удалось запомнить"}`}
		}

		return assistantToolResult{Content: `{"ok":true}`}

	case "search_web":
		var args struct {
			Query string `json:"query"`
		}

		_ = json.Unmarshal([]byte(call.Function.Arguments), &args)
		results, err := a.webSearch(ctx, args.Query)
		if err != nil {
			return assistantToolResult{Content: `{"error":"ничего не найдено"}`, Web: true}
		}

		data, _ := json.Marshal(map[string]any{"results": results})
		return assistantToolResult{Content: string(data), Web: true, WebResults: results}
	}

	return assistantToolResult{Content: `{"error":"неизвестный инструмент"}`}
}

func trackToolContent(tracks []Track, action string) string {
	data, _ := json.Marshal(map[string]any{
		"action": action,
		"tracks": compactTracks(tracks),
	})
	return string(data)
}

func compactTracks(tracks []Track) []map[string]any {
	result := make([]map[string]any, 0, len(tracks))

	for _, track := range tracks {
		result = append(result, map[string]any{
			"id":       track.ID,
			"title":    track.Title,
			"artist":   track.Artist,
			"album":    track.Album,
			"duration": track.Duration,
		})
	}

	return result
}

func (a *API) searchTracks(ctx context.Context, query string, limit int) []Track {
	if limit <= 0 {
		limit = 6
	}

	for _, candidate := range searchQueries(query) {
		found, err := a.Deezer.Search(ctx, candidate, 0)
		if err != nil {
			continue
		}

		unique := uniqueTracks(found)
		if len(unique) > 0 {
			return take(unique, limit)
		}
	}

	return nil
}

func searchQueries(value string) []string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return nil
	}

	result := make([]string, 0, 6)
	seen := make(map[string]bool)

	add := func(candidate string) {
		candidate = strings.TrimSpace(strings.Trim(candidate, " .,!?;:\"'«»()[]{}"))
		if candidate == "" || seen[strings.ToLower(candidate)] {
			return
		}

		seen[strings.ToLower(candidate)] = true
		result = append(result, candidate)
	}

	add(raw)

	cleaned := cleanQuery(raw)
	add(cleaned)

	for _, match := range quoted.FindAllStringSubmatch(raw, -1) {
		add(match[1])
	}

	for _, part := range strings.Split(cleaned, " - ") {
		add(part)
	}

	words := strings.Fields(cleaned)
	if len(words) > 3 {
		add(strings.Join(words[len(words)-3:], " "))
	}

	latin := make([]string, 0, 3)
	for _, word := range words {
		if latinWord.MatchString(word) && len(word) > 2 {
			latin = append(latin, word)
		}
	}

	if len(latin) > 0 {
		add(strings.Join(latin, " "))
	}

	return result
}

func cleanQuery(value string) string {
	words := strings.Fields(value)
	kept := make([]string, 0, len(words))

	for _, word := range words {
		trimmed := strings.Trim(word, " .,!?;:\"'«»()[]{}")
		if trimmed == "" {
			continue
		}

		if stopWords[strings.ToLower(trimmed)] {
			continue
		}

		kept = append(kept, trimmed)
	}

	cleaned := strings.Join(kept, " ")

	return cleaned
}

func needsWeb(value string) bool {
	return webIntent.MatchString(value)
}

func (a *API) likedTracks(userID string, limit int) []Track {
	tracks, err := a.Store.Likes(userID)
	if err != nil {
		return nil
	}

	return take(tracks, limit)
}

func uniqueTracks(tracks []Track) []Track {
	seen := make(map[string]bool)
	result := make([]Track, 0, len(tracks))

	for _, track := range tracks {
		if track.ID == "" || seen[track.ID] {
			continue
		}

		seen[track.ID] = true
		result = append(result, track)
	}

	return result
}

func (a *API) saveQueuePlaylist(userID string, tracks []Track, title string) (*AssistantPlaylist, error) {
	if len(tracks) == 0 {
		return nil, errors.New("пустая очередь")
	}

	title = strings.TrimSpace(title)
	if title == "" {
		title = "Очередь " + time.Now().Format("02.01")
	}

	album, err := a.Store.CreateAlbum(userID, title)
	if err != nil {
		return nil, err
	}

	added := 0
	for _, track := range tracks {
		if track.ID == "" || track.Title == "" {
			continue
		}
		if err := a.Store.AddAlbumTrack(userID, album.ID, track); err == nil {
			added += 1
		}
	}

	if added == 0 {
		return nil, errors.New("не удалось сохранить треки")
	}

	return &AssistantPlaylist{ID: album.ID, Title: album.Title, Count: added}, nil
}

func queueToolContent(info AssistantContext) string {
	tracks := []Track{}
	if info.QueueIndex+1 < len(info.QueueTracks) {
		tracks = info.QueueTracks[info.QueueIndex+1:]
	}

	data, _ := json.Marshal(map[string]any{
		"current": info.Track,
		"next":    compactTracks(tracks),
	})
	return string(data)
}

func mergeWebResults(first, second []webResult) []webResult {
	seen := make(map[string]bool)
	result := make([]webResult, 0, len(first)+len(second))

	for _, item := range append(append([]webResult{}, first...), second...) {
		if item.URL == "" || seen[item.URL] {
			continue
		}
		seen[item.URL] = true
		result = append(result, item)
	}

	return result
}

func mergeTracks(first, second []Track) []Track {
	return uniqueTracks(append(append([]Track{}, first...), second...))
}

func clampLimit(value, fallback int) int {
	if value <= 0 {
		return fallback
	}

	if value > 10 {
		return 10
	}

	return value
}

func normalizeAssistantAction(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "pause", "resume", "next", "previous", "like", "wave", "play_likes", "show_likes", "play_index",
		"remove_current", "repeat", "shuffle", "save_queue", "queue_info":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "none"
	}
}

func (a *API) webSearch(ctx context.Context, query string) ([]webResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, errors.New("пустой запрос")
	}

	for _, language := range []string{"ru", "en"} {
		results, err := a.wikiSearch(ctx, language, query)
		if err == nil && len(results) > 0 {
			return results, nil
		}
	}

	return nil, errors.New("ничего не найдено")
}

func (a *API) wikiSearch(ctx context.Context, language, query string) ([]webResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()

	searchURL := fmt.Sprintf(
		"https://%s.wikipedia.org/w/api.php?action=query&list=search&srsearch=%s&srlimit=3&format=json&utf8=1",
		language,
		url.QueryEscape(query),
	)

	var search struct {
		Query struct {
			Search []struct {
				Title   string `json:"title"`
				Snippet string `json:"snippet"`
			} `json:"search"`
		} `json:"query"`
	}

	if err := a.webJSON(ctx, searchURL, &search); err != nil {
		return nil, err
	}

	if len(search.Query.Search) == 0 {
		return nil, errors.New("ничего не найдено")
	}

	titles := make([]string, 0, 2)
	for _, item := range search.Query.Search {
		if item.Title != "" {
			titles = append(titles, item.Title)
		}
		if len(titles) == 2 {
			break
		}
	}

	extractsURL := fmt.Sprintf(
		"https://%s.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=1&redirects=1&titles=%s&format=json&utf8=1",
		language,
		url.QueryEscape(strings.Join(titles, "|")),
	)

	var extracts struct {
		Query struct {
			Pages map[string]struct {
				Title   string `json:"title"`
				Extract string `json:"extract"`
			} `json:"pages"`
		} `json:"query"`
	}

	_ = a.webJSON(ctx, extractsURL, &extracts)

	texts := make(map[string]string)
	for _, page := range extracts.Query.Pages {
		if page.Extract != "" {
			texts[page.Title] = page.Extract
		}
	}

	results := make([]webResult, 0, 3)

	for _, item := range search.Query.Search {
		text := texts[item.Title]
		if text == "" {
			text = stripTags(item.Snippet)
		}

		text = strings.Join(strings.Fields(text), " ")
		if len([]rune(text)) > 1200 {
			text = string([]rune(text)[:1200])
		}

		if text == "" {
			continue
		}

		results = append(results, webResult{
			Title: item.Title,
			URL:   fmt.Sprintf("https://%s.wikipedia.org/wiki/%s", language, url.PathEscape(strings.ReplaceAll(item.Title, " ", "_"))),
			Text:  text,
		})
	}

	if len(results) == 0 {
		return nil, errors.New("ничего не найдено")
	}

	return results, nil
}

func (a *API) webJSON(ctx context.Context, endpoint string, target any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}

	request.Header.Set("User-Agent", "yuicry/1.5.0")

	response, err := a.Assistant.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("web: статус %d", response.StatusCode)
	}

	return json.NewDecoder(response.Body).Decode(target)
}

func stripTags(value string) string {
	return strings.TrimSpace(tagPattern.ReplaceAllString(value, " "))
}

func formatWebResults(results []webResult) string {
	var builder strings.Builder

	for index, result := range results {
		builder.WriteString(fmt.Sprintf("%d. %s — %s\n", index+1, result.Title, result.Text))
	}

	return builder.String()
}
