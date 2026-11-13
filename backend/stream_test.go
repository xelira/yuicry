package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAudioTypeM4A(t *testing.T) {
	data := []byte{0x00, 0x00, 0x00, 0x20, 'f', 't', 'y', 'p', 'M', '4', 'A', ' '}
	if got := audioType(data); got != "audio/mp4" {
		t.Fatalf("получено %q, ожидалось audio/mp4", got)
	}
}

func TestAudioTypeMP3WithID3(t *testing.T) {
	data := []byte{'I', 'D', '3', 0x04, 0x00}
	if got := audioType(data); got != "audio/mpeg" {
		t.Fatalf("получено %q, ожидалось audio/mpeg", got)
	}
}

func TestAudioTypeMP3Frame(t *testing.T) {
	data := []byte{0xFF, 0xFB, 0x90, 0x00}
	if got := audioType(data); got != "audio/mpeg" {
		t.Fatalf("получено %q, ожидалось audio/mpeg", got)
	}
}

func TestAudioTypeWebM(t *testing.T) {
	data := []byte{0x1A, 0x45, 0xDF, 0xA3, 0x01}
	if got := audioType(data); got != "audio/webm" {
		t.Fatalf("получено %q, ожидалось audio/webm", got)
	}
}

func TestAudioTypeEmpty(t *testing.T) {
	if got := audioType(nil); got != "audio/mp4" {
		t.Fatalf("получено %q, ожидалось audio/mp4", got)
	}
}

type fakeStorage struct {
	data []byte
}

func (f fakeStorage) Size(ctx context.Context, id string) (int64, error) {
	return int64(len(f.data)), nil
}

func (f fakeStorage) ReadAt(ctx context.Context, id string, offset int64, size int) ([]byte, error) {
	if offset >= int64(len(f.data)) {
		return nil, io.EOF
	}

	end := offset + int64(size)
	if end > int64(len(f.data)) {
		end = int64(len(f.data))
	}

	return f.data[offset:end], nil
}

func (f fakeStorage) Put(ctx context.Context, id string, data []byte) error {
	return nil
}

func TestStoredStreamIsCacheable(t *testing.T) {
	data := []byte{0x00, 0x00, 0x00, 0x20, 'f', 't', 'y', 'p', 'M', '4', 'A', ' '}
	streamer := &Streamer{Storage: fakeStorage{data: data}}

	request := httptest.NewRequest(http.MethodGet, "/api/stream/1", nil)
	recorder := httptest.NewRecorder()

	streamer.serveStored(recorder, request, "1", int64(len(data)))

	if got := recorder.Header().Get("Cache-Control"); got != "private, max-age=86400" {
		t.Fatalf("Cache-Control %q", got)
	}
	if got := recorder.Header().Get("Content-Type"); got != "audio/mp4" {
		t.Fatalf("Content-Type %q", got)
	}
	if recorder.Body.Len() != len(data) {
		t.Fatalf("тело %d байт, ожидалось %d", recorder.Body.Len(), len(data))
	}
}
