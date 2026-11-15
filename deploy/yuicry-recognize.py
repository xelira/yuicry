#!/usr/bin/env python3

import asyncio
import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from shazamio import Shazam


def recognize(path):
    async def run():
        shazam = Shazam()
        try:
            return await shazam.recognize(path)
        finally:
            await shazam.close()

    return asyncio.run(run())


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/recognize":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 12 * 1024 * 1024:
            self.send_error(400)
            return

        data = self.rfile.read(length)
        if len(data) < 32000:
            self.send_error(400)
            return

        path = ""

        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as file:
                file.write(data)
                path = file.name

            result = recognize(path)
        except Exception:
            self.send_error(502)
            return
        finally:
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass

        track = result.get("track") or {}
        title = str(track.get("title", "")).strip()
        artist = str(track.get("subtitle", "")).strip()

        if not title:
            self.send_error(404)
            return

        album = ""
        for section in track.get("sections", []):
            for item in section.get("metadata", []):
                if item.get("title") == "Album":
                    album = str(item.get("text", "")).strip()
                    break

        images = track.get("images") or {}
        cover = images.get("coverarthq") or images.get("coverart") or ""

        body = json.dumps(
            {
                "title": title,
                "artist": artist,
                "album": album,
                "cover": cover,
                "shazam": track.get("url", ""),
            },
            ensure_ascii=False,
        ).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8792), Handler).serve_forever()
