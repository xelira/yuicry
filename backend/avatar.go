package main

import (
	"io"
	"net/http"
	"net/url"
	"strings"
)

func (a *API) handleAvatar(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.Auth.Current(r); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	raw := r.URL.Query().Get("url")
	target, err := url.Parse(raw)
	if err != nil || target.Scheme != "https" || !validAvatarHost(target.Host) {
		http.Error(w, "плохой адрес", http.StatusBadRequest)
		return
	}

	key := "avatar:" + coverKey(target.String())

	if data, ok := a.Covers.get(key); ok {
		writeCover(w, "image/jpeg", data)
		return
	}

	response, err := coverClient.Get(target.String())
	if err != nil {
		http.Error(w, "аватар недоступен", http.StatusBadGateway)
		return
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		http.Error(w, "аватар недоступен", http.StatusBadGateway)
		return
	}

	data, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		http.Error(w, "аватар недоступен", http.StatusBadGateway)
		return
	}

	kind := response.Header.Get("Content-Type")
	if kind == "" {
		kind = "image/jpeg"
	}

	a.Covers.put(key, data)
	writeCover(w, kind, data)
}

func validAvatarHost(host string) bool {
	return host == "owaw.ru" || strings.HasSuffix(host, ".owaw.ru")
}
