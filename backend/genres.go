package main

type waveGenre struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

var waveGenres = []waveGenre{
	{ID: "132", Name: "Поп"},
	{ID: "116", Name: "Рэп и хип-хоп"},
	{ID: "152", Name: "Рок"},
	{ID: "106", Name: "Электроника"},
	{ID: "113", Name: "Танцевальная"},
	{ID: "165", Name: "R&B"},
	{ID: "85", Name: "Альтернатива"},
	{ID: "464", Name: "Метал"},
	{ID: "144", Name: "Регги"},
	{ID: "129", Name: "Джаз"},
	{ID: "169", Name: "Соул и фанк"},
	{ID: "466", Name: "Фолк"},
	{ID: "197", Name: "Латино"},
	{ID: "98", Name: "Классика"},
}

func waveGenreAllowed(id string) bool {
	for _, genre := range waveGenres {
		if genre.ID == id {
			return true
		}
	}
	return false
}
