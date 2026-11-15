package main

import (
	"context"
	"encoding/json"
	"strings"
)

type voiceCorrection struct {
	Text       string  `json:"text"`
	Confidence float64 `json:"confidence"`
	Suggestion string  `json:"suggestion"`
}

func (a *API) correctVoice(ctx context.Context, userID, text string, info AssistantContext, memory AssistantMemory) (string, float64, string) {
	original := strings.TrimSpace(text)
	if original == "" {
		return "", 0, ""
	}

	hot := voiceHotWords(a, userID, info, memory)

	if corrected, score := hotWordMatch(original, hot); score >= 0.55 {
		return corrected, score, corrected
	}

	message := "Фраза после распознавания речи: " + original
	if len(hot) > 0 {
		message += "\nИзвестные названия: " + strings.Join(hot, ", ")
	}

	turn, err := a.Assistant.Chat(ctx, []AssistantMessage{
		{
			Role: "system",
			Content: `Ты исправляешь ошибки распознавания речи в музыкальном приложении. Верни только JSON:
{"text":"исправленная фраза","confidence":0.0,"suggestion":"исполнитель или трек"}
Исправляй только названия исполнителей, треков и альбомов. Не меняй смысл фразы. confidence — от 0 до 1.`,
		},
		{Role: "user", Content: message},
	}, nil)

	if err != nil {
		return original, 0, ""
	}

	var draft voiceCorrection
	content := cleanReply(turn.Content)
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start >= 0 && end > start {
		_ = json.Unmarshal([]byte(content[start:end+1]), &draft)
	}

	corrected := strings.TrimSpace(draft.Text)
	if corrected == "" {
		corrected = original
	}

	confidence := draft.Confidence

	if !strings.EqualFold(corrected, original) && phoneticScore(original, corrected) < 0.35 {
		corrected = original
		confidence = 0
	}
	suggestion := strings.TrimSpace(draft.Suggestion)

	tracks := a.searchTracks(ctx, corrected, 5)
	bestScore := 0.0
	var best Track

	for _, track := range tracks {
		score := voiceScore(corrected, track)
		if score > bestScore {
			bestScore = score
			best = track
		}
	}

	if bestScore > confidence {
		confidence = bestScore
	}

	if best.ID != "" && bestScore >= 0.45 {
		if suggestion == "" {
			suggestion = best.Title + " — " + best.Artist
		}
	}

	if confidence < 0.45 {
		return original, confidence, suggestion
	}

	return corrected, confidence, suggestion
}

func voiceHotWords(a *API, userID string, info AssistantContext, memory AssistantMemory) []string {
	result := make([]string, 0, 40)
	seen := make(map[string]bool)

	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" || len([]rune(value)) > 80 || seen[strings.ToLower(value)] {
			return
		}
		seen[strings.ToLower(value)] = true
		result = append(result, value)
	}

	for _, value := range memory.Likes {
		add(value)
	}
	for _, value := range memory.Dislikes {
		add(value)
	}
	for _, value := range info.LastTracks {
		add(value)
	}
	for _, track := range info.QueueTracks {
		add(track.Artist)
		add(track.Title)
	}
	for _, track := range a.likedTracks(userID, 10) {
		add(track.Artist)
		add(track.Title)
	}

	return result
}

func voiceScore(text string, track Track) float64 {
	return phoneticScore(text, track.Artist+" "+track.Title)
}

var transliteration = map[rune]string{
	'а': "a", 'б': "b", 'в': "v", 'г': "g", 'д': "d", 'е': "e", 'ё': "e",
	'ж': "zh", 'з': "z", 'и': "i", 'й': "y", 'к': "k", 'л': "l", 'м': "m",
	'н': "n", 'о': "o", 'п': "p", 'р': "r", 'с': "s", 'т': "t", 'у': "u",
	'ф': "f", 'х': "kh", 'ц': "ts", 'ч': "ch", 'ш': "sh", 'щ': "shch",
	'ъ': "", 'ы': "y", 'ь': "", 'э': "e", 'ю': "yu", 'я': "ya",
}

func latinize(value string) string {
	var builder strings.Builder

	for _, symbol := range strings.ToLower(value) {
		if mapped, ok := transliteration[symbol]; ok {
			builder.WriteString(mapped)
			continue
		}

		if (symbol >= 'a' && symbol <= 'z') || (symbol >= '0' && symbol <= '9') {
			builder.WriteRune(symbol)
			continue
		}

		builder.WriteRune(' ')
	}

	return strings.Join(strings.Fields(builder.String()), " ")
}

func phoneticScore(first, second string) float64 {
	left := strings.Fields(latinize(first))
	right := strings.Fields(latinize(second))

	if len(left) == 0 || len(right) == 0 {
		return 0
	}

	total := 0.0
	for _, word := range right {
		if len([]rune(word)) < 2 {
			continue
		}

		best := 0.0
		for _, candidate := range left {
			if len([]rune(candidate)) < 2 {
				continue
			}
			if score := tokenSimilarity(candidate, word); score > best {
				best = score
			}
		}

		total += best
	}

	return total / float64(len(right))
}

func tokenSimilarity(first, second string) float64 {
	if first == second {
		return 1
	}

	left := []rune(first)
	right := []rune(second)
	limit := len(left)
	if len(right) > limit {
		limit = len(right)
	}
	if limit == 0 {
		return 0
	}

	distance := levenshtein(left, right)
	return 1 - float64(distance)/float64(limit)
}

func levenshtein(first, second []rune) int {
	previous := make([]int, len(second)+1)
	current := make([]int, len(second)+1)

	for index := range previous {
		previous[index] = index
	}

	for i := 1; i <= len(first); i += 1 {
		current[0] = i
		for j := 1; j <= len(second); j += 1 {
			cost := 1
			if first[i-1] == second[j-1] {
				cost = 0
			}

			deletion := previous[j] + 1
			insertion := current[j-1] + 1
			substitution := previous[j-1] + cost

			current[j] = minInt(deletion, minInt(insertion, substitution))
		}
		previous, current = current, previous
	}

	return previous[len(second)]
}

func minInt(first, second int) int {
	if first < second {
		return first
	}
	return second
}

func hotWordMatch(value string, hotWords []string) (string, float64) {
	words := strings.Fields(value)
	if len(words) == 0 {
		return value, 0
	}

	best := 0.0
	corrected := value

	for _, hot := range hotWords {
		hotWordsList := strings.Fields(hot)
		if len(hotWordsList) == 0 || len(hotWordsList) > len(words) {
			continue
		}

		for start := 0; start+len(hotWordsList) <= len(words); start += 1 {
			window := strings.Join(words[start:start+len(hotWordsList)], " ")
			score := phoneticScore(window, hot)

			if score <= best {
				continue
			}

			best = score
			next := append([]string{}, words[:start]...)
			next = append(next, hot)
			next = append(next, words[start+len(hotWordsList):]...)
			corrected = strings.Join(next, " ")
		}
	}

	return corrected, best
}
