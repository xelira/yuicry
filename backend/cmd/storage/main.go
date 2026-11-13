package main

import (
	"log"
	"os"
	"time"

	"github.com/xelira/yuicry/backend/internal/storage"
)

func main() {
	addr := env("STORAGE_ADDR", ":10101")
	dir := env("STORAGE_DIR", "/var/lib/yuicry/cache")
	limit := int64(5 << 30)

	if err := os.MkdirAll(dir, 0o755); err != nil {
		log.Fatal(err)
	}

	go cleanupLoop(dir, limit)

	log.Printf("storage слушает %s, каталог %s", addr, dir)
	if err := storage.Serve(addr, dir); err != nil {
		log.Fatal(err)
	}
}

func cleanupLoop(dir string, limit int64) {
	for {
		if removed, err := storage.Cleanup(dir, limit); err != nil {
			log.Printf("очистка: %v", err)
		} else if removed > 0 {
			log.Printf("очистка: освобождено %d МБ", removed>>20)
		}
		time.Sleep(10 * time.Minute)
	}
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
