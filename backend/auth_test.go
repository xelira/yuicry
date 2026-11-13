package main

import (
	"strings"
	"testing"
)

func TestSignAndVerify(t *testing.T) {
	auth := &Auth{Secret: []byte(strings.Repeat("k", 48))}

	value := auth.sign("hello")

	got, ok := auth.verify(value)
	if !ok {
		t.Fatal("подпись не прошла проверку")
	}
	if got != "hello" {
		t.Fatalf("получено %q, ожидалось hello", got)
	}
}

func TestVerifyRejectsTampered(t *testing.T) {
	auth := &Auth{Secret: []byte(strings.Repeat("k", 48))}

	value := auth.sign("hello")
	if _, ok := auth.verify(value + "0"); ok {
		t.Fatal("испорченная подпись прошла проверку")
	}
}

func TestVerifyRejectsAnotherSecret(t *testing.T) {
	first := &Auth{Secret: []byte(strings.Repeat("a", 48))}
	second := &Auth{Secret: []byte(strings.Repeat("b", 48))}

	if _, ok := second.verify(first.sign("hello")); ok {
		t.Fatal("подпись чужим ключом прошла проверку")
	}
}

func TestChallengeLength(t *testing.T) {
	got := challenge("verifier")
	if len(got) != 43 {
		t.Fatalf("длина challenge %d, ожидалось 43", len(got))
	}
}

func TestRandomTokenIsUnique(t *testing.T) {
	first := randomToken(24)
	second := randomToken(24)

	if first == second {
		t.Fatal("два токена совпали")
	}
	if len(first) != 32 {
		t.Fatalf("длина токена %d, ожидалось 32", len(first))
	}
}
