#!/usr/bin/env python3

import asyncio
import hashlib
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import edge_tts

VOICE = "ru-RU-SvetlanaNeural"
TTL = 3600
LIMIT = 128

CACHE = {}


def synthesize(text):
    async def run():
        communicate = edge_tts.Communicate(text, VOICE)
        chunks = bytearray()

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.extend(chunk["data"])

        return bytes(chunks)

    return asyncio.run(run())


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path != "/tts":
            self.send_error(404)
            return

        params = urllib.parse.parse_qs(parsed.query)
        text = " ".join((params.get("text") or [""])[0].split())

        if not text:
            self.send_error(400)
            return

        if len(text) > 600:
            text = text[:600]

        key = hashlib.sha256(text.encode("utf-8")).hexdigest()
        now = time.time()
        entry = CACHE.get(key)

        if entry and now - entry[0] < TTL:
            data = entry[1]
        else:
            try:
                data = synthesize(text)
            except Exception:
                self.send_error(502)
                return

            if not data:
                self.send_error(502)
                return

            CACHE[key] = (now, data)

            if len(CACHE) > LIMIT:
                oldest = min(CACHE, key=lambda item: CACHE[item][0])
                CACHE.pop(oldest, None)

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "private, max-age=3600")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8790), Handler).serve_forever()
