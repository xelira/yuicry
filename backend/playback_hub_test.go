package main

import (
	"testing"
	"time"
)

func TestPlaybackHubDeliversToSubscribers(t *testing.T) {
	hub := NewPlaybackHub()

	first := hub.Subscribe("user")
	second := hub.Subscribe("user")
	other := hub.Subscribe("other")

	defer hub.Unsubscribe("user", first)
	defer hub.Unsubscribe("user", second)
	defer hub.Unsubscribe("other", other)

	state := PlaybackState{Device: "phone", Track: Track{ID: "1"}}
	hub.Publish("user", state)

	for name, sub := range map[string]*playbackSub{"first": first, "second": second} {
		select {
		case got := <-sub.state:
			if got.Device != "phone" {
				t.Fatalf("%s: устройство %q", name, got.Device)
			}
		case <-time.After(time.Second):
			t.Fatalf("%s: событие не пришло", name)
		}
	}

	select {
	case <-other.state:
		t.Fatal("чужой пользователь получил событие")
	case <-time.After(50 * time.Millisecond):
	}
}

func TestPlaybackHubStopsAfterUnsubscribe(t *testing.T) {
	hub := NewPlaybackHub()
	sub := hub.Subscribe("user")

	hub.Unsubscribe("user", sub)
	hub.Publish("user", PlaybackState{Device: "phone"})

	select {
	case <-sub.state:
		t.Fatal("событие пришло после отписки")
	case <-time.After(50 * time.Millisecond):
	}
}

func TestPlaybackHubDropsSlowSubscribers(t *testing.T) {
	hub := NewPlaybackHub()
	sub := hub.Subscribe("user")
	defer hub.Unsubscribe("user", sub)

	done := make(chan struct{})
	go func() {
		for i := 0; i < 20; i++ {
			hub.Publish("user", PlaybackState{Device: "phone"})
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("публикация заблокировалась на медленном подписчике")
	}
}
