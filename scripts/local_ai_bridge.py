"""Optional local AI bridge for Market AI Pro.

Reads GROQ_API_KEY from the environment only. The key is never written to a
file, printed, or sent to the browser — the page talks to this local endpoint
with a dummy key. Stop with Ctrl+C.

Run: python scripts/local_ai_bridge.py
Then in the app: settings -> "استخدم Groq من مفتاح الجهاز".
"""

import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

KEY = os.environ.get("GROQ_API_KEY", "")
UPSTREAM = "https://api.groq.com/openai/v1/chat/completions"
PORT = 8767


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not KEY:
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"GROQ_API_KEY not set"}')
            return
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
            body = self.rfile.read(length)
            req = urllib.request.Request(
                UPSTREAM,
                data=body,
                headers={"Authorization": "Bearer " + KEY,
                         "Content-Type": "application/json",
                         "Accept": "application/json, text/event-stream",
                         "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                                        "Chrome/131.0.0.0 Safari/537.36")},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as upstream:
                ctype = upstream.headers.get("Content-Type", "application/json")
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", ctype)
                self.end_headers()
                while True:
                    chunk = upstream.read(8192)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                self.wfile.flush()
        except urllib.error.HTTPError as exc:
            try:
                payload = exc.read()
            except Exception:
                payload = b'{"error":"upstream error"}'
            self.send_response(exc.code)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(payload)
        except Exception:
            self.send_response(502)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"bridge error"}')

    def log_message(self, *args):
        # Never log request lines or bodies: they contain user prompts.
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
