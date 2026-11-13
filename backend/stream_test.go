package main

import "testing"

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
