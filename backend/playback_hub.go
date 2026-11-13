package main

import "sync"

type PlaybackHub struct {
	mu   sync.Mutex
	subs map[string]map[*playbackSub]struct{}
}

type playbackSub struct {
	state chan PlaybackState
}

func NewPlaybackHub() *PlaybackHub {
	return &PlaybackHub{subs: make(map[string]map[*playbackSub]struct{})}
}

func (h *PlaybackHub) Subscribe(userID string) *playbackSub {
	sub := &playbackSub{state: make(chan PlaybackState, 4)}

	h.mu.Lock()
	if h.subs[userID] == nil {
		h.subs[userID] = make(map[*playbackSub]struct{})
	}
	h.subs[userID][sub] = struct{}{}
	h.mu.Unlock()

	return sub
}

func (h *PlaybackHub) Unsubscribe(userID string, sub *playbackSub) {
	h.mu.Lock()
	defer h.mu.Unlock()

	set, ok := h.subs[userID]
	if !ok {
		return
	}

	delete(set, sub)
	if len(set) == 0 {
		delete(h.subs, userID)
	}
}

func (h *PlaybackHub) Publish(userID string, state PlaybackState) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for sub := range h.subs[userID] {
		select {
		case sub.state <- state:
		default:
		}
	}
}
