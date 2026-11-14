#!/usr/bin/env python3

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from vosk import KaldiRecognizer, Model, SetLogLevel

SetLogLevel(-1)

MODEL = Model("/opt/yuicry-stt-model")
LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/transcribe":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 12 * 1024 * 1024:
            self.send_error(400)
            return

        data = self.rfile.read(length)
        if len(data) < 3200:
            self.send_error(400)
            return

        with LOCK:
            recognizer = KaldiRecognizer(MODEL, 16000)
            recognizer.AcceptWaveform(data)
            text = json.loads(recognizer.FinalResult()).get("text", "").strip()

        body = json.dumps({"text": text}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8791), Handler).serve_forever()
