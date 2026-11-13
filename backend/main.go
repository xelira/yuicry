package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/xelira/yuicry/backend/internal/storage"
)

type API struct {
	Store    *Store
	Auth     *Auth
	Deezer   *Deezer
	Covers   *CoverCache
	Playback *PlaybackHub
}

func main() {
	addr := env("ADDR", ":10000")
	databasePath := env("DB_PATH", "./data/yuicry.db")
	if err := os.MkdirAll(filepath.Dir(databasePath), 0o755); err != nil {
		log.Fatal(err)
	}

	store, err := OpenStore(databasePath)
	if err != nil {
		log.Fatal(err)
	}

	secret := env("SESSION_SECRET", "")
	if len(secret) < 32 {
		log.Fatal("SESSION_SECRET должен быть не короче 32 символов")
	}

	auth := NewAuth(
		env("OIDC_ISSUER", "https://owaw.ru"),
		env("OIDC_CLIENT_ID", "yuicry"),
		env("OIDC_REDIRECT", "https://yuicry.owaw.online/api/auth/callback"),
		[]byte(secret),
		store,
	)
	auth.Secure = env("COOKIE_SECURE", "1") == "1"

	deezer := NewDeezer()
	target := openStorage()
	streamer := NewStreamer(target, deezer, env("TEMP_DIR", os.TempDir()), env("YTDLP", "yt-dlp"), env("YTDLP_COOKIES", "/etc/yuicry/cookies.txt"), envInt("YTDLP_SLOTS", 3))

	covers := NewCoverCache(env("COVER_CACHE", "/var/lib/yuicry/covers"), 512<<20)
	api := &API{Store: store, Auth: auth, Deezer: deezer, Covers: covers, Playback: NewPlaybackHub()}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/search", api.handleSearch)
	mux.HandleFunc("GET /api/stream/{id}", streamer.Handle)
	mux.HandleFunc("POST /api/reaction", api.handleReaction)
	mux.HandleFunc("GET /api/likes", api.handleLikes)
	mux.HandleFunc("GET /api/playback", api.handlePlayback)
	mux.HandleFunc("GET /api/playback/stream", api.handlePlaybackStream)
	mux.HandleFunc("POST /api/playback", api.handleSavePlayback)
	mux.HandleFunc("GET /api/albums", api.handleAlbums)
	mux.HandleFunc("POST /api/albums", api.handleCreateAlbum)
	mux.HandleFunc("GET /api/albums/{id}", api.handleAlbum)
	mux.HandleFunc("DELETE /api/albums/{id}", api.handleDeleteAlbum)
	mux.HandleFunc("POST /api/albums/{id}/tracks", api.handleAddTrack)
	mux.HandleFunc("DELETE /api/albums/{id}/tracks/{track}", api.handleRemoveTrack)
	mux.HandleFunc("GET /api/wave", api.handleWave)
	mux.HandleFunc("GET /api/similar/{id}", api.handleSimilar)
	mux.HandleFunc("GET /api/cover", api.handleCover)
	mux.HandleFunc("GET /api/auth/login", auth.HandleLogin)
	mux.HandleFunc("GET /api/auth/callback", auth.HandleCallback)
	mux.HandleFunc("POST /api/auth/logout", auth.HandleLogout)
	mux.HandleFunc("GET /api/me", auth.HandleMe)

	if public := os.Getenv("PUBLIC_DIR"); public != "" {
		mux.Handle("/", spa(public))
	}

	server := &http.Server{
		Addr:              addr,
		Handler:           logRequests(api.guard(mux)),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	go func() {
		log.Printf("api слушает %s", addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Print("останавливаюсь")

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("остановка: %v", err)
	}

	if err := store.db.Close(); err != nil {
		log.Printf("закрытие базы: %v", err)
	}
}

func (a *API) handleSearch(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		writeJSON(w, http.StatusOK, map[string]any{"tracks": []Track{}})
		return
	}

	tracks, err := a.Deezer.Search(r.Context(), query)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "deezer недоступен"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"tracks": tracks})
}

func (a *API) handleReaction(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	var body struct {
		TrackID  string `json:"track_id"`
		Kind     string `json:"kind"`
		Title    string `json:"title"`
		Artist   string `json:"artist"`
		Cover    string `json:"cover_big"`
		Duration int    `json:"duration"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохое тело"})
		return
	}
	if err := storage.ValidID(body.TrackID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "плохой трек"})
		return
	}

	var err error
	switch body.Kind {
	case "like":
		track := Track{
			ID:       body.TrackID,
			Title:    body.Title,
			Artist:   body.Artist,
			Cover:    body.Cover,
			Duration: body.Duration,
		}
		if track.Title == "" {
			if fetched, err := a.Deezer.Track(r.Context(), body.TrackID); err == nil {
				track = fetched
			}
		}
		err = a.Store.AddLike(current.UserID, track)
	case "unlike":
		err = a.Store.RemoveLike(current.UserID, body.TrackID)
	case "dislike":
		err = a.Store.AddSkip(current.UserID, body.TrackID)
		if err == nil {
			_ = a.Store.RemoveLike(current.UserID, body.TrackID)
		}
	case "skip":
		err = a.Store.AddSkip(current.UserID, body.TrackID)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "неизвестная реакция"})
		return
	}

	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "не удалось записать"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) handleLikes(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Auth.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	tracks, err := a.Store.Likes(current.UserID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "не удалось прочитать"})
		return
	}

	a.fillMissing(r.Context(), current.UserID, tracks)

	if tracks == nil {
		tracks = []Track{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"tracks": tracks})
}

func (a *API) fillMissing(ctx context.Context, userID string, tracks []Track) {
	var group sync.WaitGroup
	slots := make(chan struct{}, 4)

	for i := range tracks {
		if tracks[i].Title != "" {
			continue
		}

		group.Add(1)
		slots <- struct{}{}

		go func(position int) {
			defer group.Done()
			defer func() { <-slots }()

			callCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
			defer cancel()

			track, err := a.Deezer.Track(callCtx, tracks[position].ID)
			if err != nil {
				return
			}

			tracks[position] = track
			_ = a.Store.UpdateLikeMeta(userID, track)
		}(i)
	}

	group.Wait()
}

func openStorage() storage.Storage {
	if addr := os.Getenv("STORAGE_ADDR"); addr != "" {
		client, err := storage.Dial(addr)
		if err != nil {
			log.Fatalf("хранилище: %v", err)
		}
		log.Printf("хранилище: gRPC %s", addr)
		return client
	}

	dir := env("CACHE_DIR", "./cache")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		log.Fatal(err)
	}
	log.Printf("хранилище: локальный каталог %s", dir)
	return storage.Disk{Dir: dir}
}

func spa(dir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/_next/static/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-store")
		}

		target := filepath.Join(dir, filepath.Clean("/"+r.URL.Path))

		info, err := os.Stat(target)
		if err == nil {
			if info.IsDir() {
				index := filepath.Join(target, "index.html")
				if _, err := os.Stat(index); err == nil {
					http.ServeFile(w, r, index)
					return
				}
			} else {
				http.ServeFile(w, r, target)
				return
			}
		}

		http.ServeFile(w, r, filepath.Join(dir, "index.html"))
	})
}

func (a *API) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if publicPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		if _, ok := a.Auth.Current(r); ok {
			next.ServeHTTP(w, r)
			return
		}

		if strings.HasPrefix(r.URL.Path, "/api/") {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
			return
		}

		http.Redirect(w, r, "/api/auth/login", http.StatusFound)
	})
}

func publicPath(path string) bool {
	switch {
	case strings.HasPrefix(path, "/api/auth/"):
		return true
	case path == "/api/health":
		return true
	case strings.HasPrefix(path, "/_next/"):
		return true
	case path == "/favicon.ico":
		return true
	case path == "/login", path == "/login/":
		return true
	}
	return false
}

func decodeBody(r *http.Request, target any) error {
	return json.NewDecoder(r.Body).Decode(target)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, recorder.status, time.Since(started).Round(time.Millisecond))
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(status int) {
	s.status = status
	s.ResponseWriter.WriteHeader(status)
}

func (s *statusRecorder) Flush() {
	if flusher, ok := s.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (s *statusRecorder) Unwrap() http.ResponseWriter {
	return s.ResponseWriter
}

func envInt(name string, fallback int) int {
	if value := os.Getenv(name); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			return parsed
		}
	}

	return fallback
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
