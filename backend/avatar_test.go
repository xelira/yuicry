package main

import "testing"

func TestValidAvatarHost(t *testing.T) {
	good := []string{"owaw.ru", "id.owaw.ru", "static.owaw.ru"}
	for _, host := range good {
		if !validAvatarHost(host) {
			t.Fatalf("хост %q должен быть разрешён", host)
		}
	}

	bad := []string{"evildzcdn.net", "owaw.ru.example.com", "example.com", ""}
	for _, host := range bad {
		if validAvatarHost(host) {
			t.Fatalf("хост %q должен быть запрещён", host)
		}
	}
}
