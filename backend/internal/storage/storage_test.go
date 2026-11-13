package storage

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestValidIDAcceptsNumbers(t *testing.T) {
	if err := ValidID("3135553"); err != nil {
		t.Fatalf("числовой id отвергнут: %v", err)
	}
}

func TestValidIDRejectsBadValues(t *testing.T) {
	cases := []string{"", "../etc/passwd", "12a", "1 2", "-5"}
	for _, value := range cases {
		if err := ValidID(value); err == nil {
			t.Fatalf("id %q должен быть отвергнут", value)
		}
	}
}

func TestDiskPutAndRead(t *testing.T) {
	dir := t.TempDir()
	disk := Disk{Dir: dir}
	payload := []byte("abcdefghij")

	if err := disk.Put(context.Background(), "42", payload); err != nil {
		t.Fatalf("запись: %v", err)
	}

	size, err := disk.Size(context.Background(), "42")
	if err != nil {
		t.Fatalf("размер: %v", err)
	}
	if size != int64(len(payload)) {
		t.Fatalf("размер %d, ожидалось %d", size, len(payload))
	}

	part, err := disk.ReadAt(context.Background(), "42", 3, 4)
	if err != nil {
		t.Fatalf("чтение: %v", err)
	}
	if string(part) != "defg" {
		t.Fatalf("получено %q, ожидалось defg", string(part))
	}
}

func TestDiskReadPastEnd(t *testing.T) {
	dir := t.TempDir()
	disk := Disk{Dir: dir}

	if err := disk.Put(context.Background(), "7", []byte("short")); err != nil {
		t.Fatalf("запись: %v", err)
	}

	part, err := disk.ReadAt(context.Background(), "7", 3, 100)
	if err != nil {
		t.Fatalf("чтение: %v", err)
	}
	if string(part) != "rt" {
		t.Fatalf("получено %q, ожидалось rt", string(part))
	}
}

func TestDiskMissingFile(t *testing.T) {
	disk := Disk{Dir: t.TempDir()}

	if _, err := disk.Size(context.Background(), "1"); err == nil {
		t.Fatal("ожидалась ошибка для отсутствующего файла")
	}
}

func TestCleanupRemovesOldest(t *testing.T) {
	dir := t.TempDir()

	old := filepath.Join(dir, "old.m4a")
	fresh := filepath.Join(dir, "fresh.m4a")

	if err := os.WriteFile(old, make([]byte, 60), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fresh, make([]byte, 60), 0o644); err != nil {
		t.Fatal(err)
	}

	past := time.Now().Add(-time.Hour)
	if err := os.Chtimes(old, past, past); err != nil {
		t.Fatal(err)
	}

	removed, err := Cleanup(dir, 100)
	if err != nil {
		t.Fatalf("очистка: %v", err)
	}
	if removed != 60 {
		t.Fatalf("удалено %d байт, ожидалось 60", removed)
	}

	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatal("старый файл не удалён")
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Fatal("свежий файл удалён")
	}
}

func TestCleanupKeepsUnderLimit(t *testing.T) {
	dir := t.TempDir()

	if err := os.WriteFile(filepath.Join(dir, "a.m4a"), make([]byte, 10), 0o644); err != nil {
		t.Fatal(err)
	}

	removed, err := Cleanup(dir, 1024)
	if err != nil {
		t.Fatalf("очистка: %v", err)
	}
	if removed != 0 {
		t.Fatalf("удалено %d байт, ожидалось 0", removed)
	}
}
