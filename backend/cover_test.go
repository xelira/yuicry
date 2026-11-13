package main

import "testing"

func TestShrinkCoverSizes(t *testing.T) {
	path := "/images/cover/311bba0fc112d15f72c8b5a65f0456c1/1000x1000-000000-80-0-0.jpg"

	cases := map[string]string{
		"small":  "/images/cover/311bba0fc112d15f72c8b5a65f0456c1/120x120-000000-80-0-0.jpg",
		"medium": "/images/cover/311bba0fc112d15f72c8b5a65f0456c1/250x250-000000-80-0-0.jpg",
		"large":  "/images/cover/311bba0fc112d15f72c8b5a65f0456c1/500x500-000000-80-0-0.jpg",
	}

	for size, want := range cases {
		if got := shrinkCover(path, size); got != want {
			t.Fatalf("размер %s: получено %q, ожидалось %q", size, got, want)
		}
	}
}

func TestShrinkCoverKeepsUnknownSize(t *testing.T) {
	path := "/images/cover/abc/1000x1000-000000-80-0-0.jpg"

	if got := shrinkCover(path, "huge"); got != "/images/cover/abc/500x500-000000-80-0-0.jpg" {
		t.Fatalf("неизвестный размер должен давать large, получено %q", got)
	}
}

func TestShrinkCoverWithoutDimension(t *testing.T) {
	path := "/images/cover/abc/cover.jpg"

	if got := shrinkCover(path, "small"); got != path {
		t.Fatalf("путь без размера изменён: %q", got)
	}
}

func TestShrinkCoverReplacesOnlySize(t *testing.T) {
	path := "/images/cover/abc/250x250-000000-80-0-0.jpg"

	got := shrinkCover(path, "small")
	if got != "/images/cover/abc/120x120-000000-80-0-0.jpg" {
		t.Fatalf("получено %q", got)
	}
}

func TestValidCoverHost(t *testing.T) {
	good := []string{"dzcdn.net", "cdn-images.dzcdn.net", "e-cdns-images.dzcdn.net"}
	for _, host := range good {
		if !validCoverHost(host) {
			t.Fatalf("хост %q должен быть разрешён", host)
		}
	}

	bad := []string{"evildzcdn.net", "dzcdn.net.example.com", "example.com", ""}
	for _, host := range bad {
		if validCoverHost(host) {
			t.Fatalf("хост %q должен быть запрещён", host)
		}
	}
}
