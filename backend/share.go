package main

import (
	"fmt"
	"html"
	"net/http"
	"strings"

	"github.com/xelira/yuicry/backend/internal/storage"
)

const releaseFingerprint = "CC:FF:5A:2C:0C:68:9C:ED:A5:1B:21:D2:66:AE:D0:25:56:60:3A:E5:EF:F0:B0:DB:30:79:E0:28:D6:13:CE:4F"

func (a *API) handleShareTrack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	target := "/?track=" + id

	if err := storage.ValidID(id); err != nil {
		a.sharePage(w, "yuicry", "Трек в yuicry", "", target)
		return
	}

	track, err := a.Deezer.Track(r.Context(), id)
	if err != nil {
		a.sharePage(w, "yuicry", "Трек в yuicry", "", target)
		return
	}

	a.sharePage(
		w,
		track.Artist+" — "+track.Title,
		"Слушать в yuicry",
		track.Cover,
		target,
	)
}

func (a *API) handleSharePlaylist(w http.ResponseWriter, r *http.Request) {
	a.sharePage(w, "Плейлист в yuicry", "Открыть плейлист", "", "/?playlist="+r.PathValue("id"))
}

func (a *API) sharePage(w http.ResponseWriter, title, description, image, target string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")

	imageTag := ""
	if image != "" {
		imageTag = fmt.Sprintf(
			`<meta property="og:image" content="%s"><meta name="twitter:image" content="%s">`,
			html.EscapeString(image), html.EscapeString(image),
		)
	}

	fmt.Fprintf(w, `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s</title>
<meta property="og:type" content="music.song">
<meta property="og:title" content="%s">
<meta property="og:description" content="%s">
<meta property="og:site_name" content="yuicry">
<meta name="twitter:card" content="summary_large_image">
%s
<script>location.replace(%q)</script>
<style>
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0b0b0d; color: #f2f2f4; font-family: system-ui, sans-serif; }
main { text-align: center; padding: 24px; }
p { color: #8b8b96; font-size: 14px; }
a { display: inline-block; margin-top: 16px; padding: 10px 18px; border-radius: 8px; background: #ff5a36; color: #170704; text-decoration: none; font-size: 14px; font-weight: 600; }
</style>
</head>
<body>
<main>
<p>yuicry</p>
<strong>%s</strong>
<p>%s</p>
<a href="%s">Открыть в yuicry</a>
</main>
</body>
</html>`,
		html.EscapeString(title),
		html.EscapeString(title),
		html.EscapeString(description),
		imageTag,
		target,
		html.EscapeString(title),
		html.EscapeString(description),
		html.EscapeString(target),
	)
}

func (a *API) handleAssetLinks(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600")

	fmt.Fprintf(w, `[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"online.owaw.yuicry","sha256_cert_fingerprints":["%s"]}}]`, releaseFingerprint)
}

func isSharePath(path string) bool {
	return strings.HasPrefix(path, "/t/") || strings.HasPrefix(path, "/p/") || path == "/.well-known/assetlinks.json"
}
