package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Auth struct {
	Issuer   string
	ClientID string
	Redirect string
	Secret   []byte
	Store    *Store
	Client   *http.Client
	Secure   bool
}

type session struct {
	UserID  string `json:"uid"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
	Expires int64  `json:"exp"`
}

type oidcUser struct {
	Sub     string `json:"sub"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func NewAuth(issuer, clientID, redirect string, secret []byte, store *Store) *Auth {
	return &Auth{
		Issuer:   strings.TrimSuffix(issuer, "/"),
		ClientID: clientID,
		Redirect: redirect,
		Secret:   secret,
		Store:    store,
		Client:   &http.Client{Timeout: 15 * time.Second},
		Secure:   true,
	}
}

func (a *Auth) HandleLogin(w http.ResponseWriter, r *http.Request) {
	state := randomToken(24)
	verifier := randomToken(48)

	http.SetCookie(w, &http.Cookie{
		Name:     "yuicry_oauth",
		Value:    a.sign(state + "|" + verifier),
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		Secure:   a.Secure,
		SameSite: http.SameSiteLaxMode,
	})

	params := url.Values{
		"response_type":         {"code"},
		"client_id":             {a.ClientID},
		"redirect_uri":          {a.Redirect},
		"scope":                 {"openid email profile"},
		"state":                 {state},
		"code_challenge":        {challenge(verifier)},
		"code_challenge_method": {"S256"},
	}

	http.Redirect(w, r, a.Issuer+"/oauth/authorize?"+params.Encode(), http.StatusFound)
}

func (a *Auth) HandleCallback(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("yuicry_oauth")
	if err != nil {
		http.Error(w, "нет состояния входа", http.StatusBadRequest)
		return
	}

	payload, ok := a.verify(cookie.Value)
	if !ok {
		http.Error(w, "состояние входа повреждено", http.StatusBadRequest)
		return
	}

	parts := strings.SplitN(payload, "|", 2)
	if len(parts) != 2 || parts[0] != r.URL.Query().Get("state") {
		http.Error(w, "состояние входа не совпало", http.StatusBadRequest)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "код авторизации не получен", http.StatusBadRequest)
		return
	}

	user, err := a.exchange(r.Context(), code, parts[1])
	if err != nil {
		http.Error(w, "не удалось получить профиль: "+err.Error(), http.StatusBadGateway)
		return
	}

	stored, err := a.Store.UpsertUser(user.Sub, user.Name, user.Picture)
	if err != nil {
		http.Error(w, "не удалось сохранить пользователя", http.StatusInternalServerError)
		return
	}

	value, err := a.sessionCookie(session{
		UserID:  stored.ID,
		Name:    stored.Name,
		Picture: stored.Picture,
		Expires: time.Now().Add(30 * 24 * time.Hour).Unix(),
	})
	if err != nil {
		http.Error(w, "не удалось создать сессию", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "yuicry_session",
		Value:    value,
		Path:     "/",
		MaxAge:   30 * 24 * 3600,
		HttpOnly: true,
		Secure:   a.Secure,
		SameSite: http.SameSiteLaxMode,
	})
	http.SetCookie(w, &http.Cookie{Name: "yuicry_oauth", Value: "", Path: "/", MaxAge: -1})

	http.Redirect(w, r, "/", http.StatusFound)
}

func (a *Auth) HandleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "yuicry_session", Value: "", Path: "/", MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}

func (a *Auth) HandleMe(w http.ResponseWriter, r *http.Request) {
	current, ok := a.Current(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "нужен вход"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"name":    current.Name,
		"picture": current.Picture,
	})
}

func (a *Auth) Current(r *http.Request) (session, bool) {
	cookie, err := r.Cookie("yuicry_session")
	if err != nil {
		return session{}, false
	}

	payload, ok := a.verify(cookie.Value)
	if !ok {
		return session{}, false
	}

	var current session
	if err := json.Unmarshal([]byte(payload), &current); err != nil {
		return session{}, false
	}
	if current.Expires < time.Now().Unix() {
		return session{}, false
	}
	return current, true
}

func (a *Auth) exchange(ctx context.Context, code, verifier string) (oidcUser, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {a.Redirect},
		"client_id":     {a.ClientID},
		"code_verifier": {verifier},
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, a.Issuer+"/oauth/token", strings.NewReader(form.Encode()))
	if err != nil {
		return oidcUser{}, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	response, err := a.Client.Do(request)
	if err != nil {
		return oidcUser{}, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return oidcUser{}, err
	}
	if response.StatusCode != http.StatusOK {
		return oidcUser{}, fmt.Errorf("token: %s", response.Status)
	}

	var tokens struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &tokens); err != nil {
		return oidcUser{}, err
	}
	if tokens.AccessToken == "" {
		return oidcUser{}, fmt.Errorf("token: пустой ответ")
	}

	return a.profile(ctx, tokens.AccessToken)
}

func (a *Auth) profile(ctx context.Context, token string) (oidcUser, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, a.Issuer+"/oauth/userinfo", nil)
	if err != nil {
		return oidcUser{}, err
	}
	request.Header.Set("Authorization", "Bearer "+token)

	response, err := a.Client.Do(request)
	if err != nil {
		return oidcUser{}, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return oidcUser{}, fmt.Errorf("userinfo: %s", response.Status)
	}

	var user oidcUser
	if err := json.NewDecoder(response.Body).Decode(&user); err != nil {
		return oidcUser{}, err
	}
	if user.Sub == "" {
		return oidcUser{}, fmt.Errorf("userinfo: нет sub")
	}
	return user, nil
}

func (a *Auth) sessionCookie(current session) (string, error) {
	data, err := json.Marshal(current)
	if err != nil {
		return "", err
	}
	return a.sign(string(data)), nil
}

func (a *Auth) sign(value string) string {
	mac := hmac.New(sha256.New, a.Secret)
	mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString([]byte(value)) + "." + hex.EncodeToString(mac.Sum(nil))
}

func (a *Auth) verify(value string) (string, bool) {
	dot := strings.LastIndexByte(value, '.')
	if dot < 0 {
		return "", false
	}

	raw, err := base64.RawURLEncoding.DecodeString(value[:dot])
	if err != nil {
		return "", false
	}

	mac := hmac.New(sha256.New, a.Secret)
	mac.Write(raw)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(value[dot+1:])) {
		return "", false
	}
	return string(raw), true
}

func challenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func randomToken(size int) string {
	buffer := make([]byte, size)
	if _, err := rand.Read(buffer); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer)
}
