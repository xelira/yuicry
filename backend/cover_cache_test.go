package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCoverCachePutAndGet(t *testing.T) {
	cache := NewCoverCache(t.TempDir(), 1<<20)
	data := []byte("cover-bytes")

	cache.put("abc", data)

	got, ok := cache.get("abc")
	if !ok {
		t.Fatal("обложка не найдена в кеше")
	}
	if string(got) != string(data) {
		t.Fatalf("получено %q", got)
	}
}

func TestCoverCacheMissing(t *testing.T) {
	cache := NewCoverCache(t.TempDir(), 1<<20)

	if _, ok := cache.get("нет"); ok {
		t.Fatal("пустой кеш что-то вернул")
	}
}

func TestCoverCacheDisabled(t *testing.T) {
	cache := NewCoverCache("", 0)

	cache.put("abc", []byte("x"))
	if _, ok := cache.get("abc"); ok {
		t.Fatal("отключённый кеш что-то вернул")
	}
}

func TestCoverCacheTrim(t *testing.T) {
	dir := t.TempDir()
	cache := NewCoverCache(dir, 100)

	old := filepath.Join(dir, "old.jpg")
	fresh := filepath.Join(dir, "fresh.jpg")
	middle := filepath.Join(dir, "middle.jpg")

	for _, path := range []string{old, middle, fresh} {
		if err := os.WriteFile(path, make([]byte, 60), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	past := time.Now().Add(-2 * time.Hour)
	mid := time.Now().Add(-time.Hour)

	if err := os.Chtimes(old, past, past); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(middle, mid, mid); err != nil {
		t.Fatal(err)
	}

	cache.trim()

	var total int64
	_ = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			total += info.Size()
		}
		return nil
	})

	if total > 100 {
		t.Fatalf("кеш занимает %d байт, лимит 100", total)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatal("самый старый файл не удалён")
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Fatal("свежий файл удалён")
	}
}
