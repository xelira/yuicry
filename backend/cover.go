package main

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var coverClient = &http.Client{Timeout: 15 * time.Second}

var coverSize = regexp.MustCompile(`^\d+x\d+`)

type CoverCache struct {
	Dir    string
	Max    int64
	mu     sync.Mutex
	writes int
}

func NewCoverCache(dir string, max int64) *CoverCache {
	if dir == "" {
		return &CoverCache{}
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		log.Printf("кеш обложек: %v", err)
		return &CoverCache{}
	}

	return &CoverCache{Dir: dir, Max: max}
}

func (a *API) handleCover(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.Auth.Current(r); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	raw := r.URL.Query().Get("url")
	target, err := url.Parse(raw)
	if err != nil || target.Scheme != "https" {
		http.Error(w, "плохой адрес", http.StatusBadRequest)
		return
	}
	if !validCoverHost(target.Host) {
		http.Error(w, "чужой хост", http.StatusBadRequest)
		return
	}

	target.Path = shrinkCover(target.Path, r.URL.Query().Get("size"))
	key := coverKey(target.String())

	if data, ok := a.Covers.get(key); ok {
		writeCover(w, "image/jpeg", data)
		return
	}

	response, err := coverClient.Get(target.String())
	if err != nil {
		http.Error(w, "обложка недоступна", http.StatusBadGateway)
		return
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		http.Error(w, "обложка недоступна", http.StatusBadGateway)
		return
	}

	data, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		http.Error(w, "обложка недоступна", http.StatusBadGateway)
		return
	}

	kind := response.Header.Get("Content-Type")
	if kind == "" {
		kind = "image/jpeg"
	}

	a.Covers.put(key, data)
	writeCover(w, kind, data)
}

func validCoverHost(host string) bool {
	return host == "dzcdn.net" || strings.HasSuffix(host, ".dzcdn.net")
}

func writeCover(w http.ResponseWriter, kind string, data []byte) {
	w.Header().Set("Content-Type", kind)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Write(data)
}

func coverKey(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (c *CoverCache) get(key string) ([]byte, bool) {
	if c.Dir == "" {
		return nil, false
	}

	data, err := os.ReadFile(c.path(key))
	if err != nil {
		return nil, false
	}

	return data, true
}

func (c *CoverCache) put(key string, data []byte) {
	if c.Dir == "" {
		return
	}

	tmp := c.path(key) + "." + strconv.FormatInt(time.Now().UnixNano(), 36) + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return
	}
	if err := os.Rename(tmp, c.path(key)); err != nil {
		os.Remove(tmp)
		return
	}

	c.mu.Lock()
	c.writes += 1
	due := c.writes%50 == 0
	c.mu.Unlock()

	if due {
		c.trim()
	}
}

func (c *CoverCache) trim() {
	if c.Max <= 0 {
		return
	}

	type entry struct {
		path string
		size int64
		mod  time.Time
	}

	var entries []entry
	var total int64

	err := filepath.Walk(c.Dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		entries = append(entries, entry{path, info.Size(), info.ModTime()})
		total += info.Size()
		return nil
	})
	if err != nil || total <= c.Max {
		return
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].mod.Before(entries[j].mod)
	})

	for _, item := range entries {
		if total <= c.Max {
			break
		}
		if err := os.Remove(item.path); err == nil {
			total -= item.size
		}
	}
}

func (c *CoverCache) path(key string) string {
	return filepath.Join(c.Dir, key+".jpg")
}

func shrinkCover(path, size string) string {
	width := "500"

	switch size {
	case "small":
		width = "120"
	case "medium":
		width = "250"
	case "large":
		width = "500"
	}

	parts := strings.Split(path, "/")
	for index, part := range parts {
		if !coverSize.MatchString(part) {
			continue
		}

		rest := strings.TrimPrefix(part, coverSize.FindString(part))
		parts[index] = width + "x" + width + rest
	}

	return strings.Join(parts, "/")
}
