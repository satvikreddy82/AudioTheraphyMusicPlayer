"""
server.py — Audio Theraphy Dev Server
Serves static files AND proxies JioSaavn API calls with the correct headers.

Run:  python server.py
Then open: http://localhost:5500
"""

import http.server
import urllib.request
import urllib.parse
import json
import os
import sys

PORT = 5500
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

JIOSAAVN_API = "https://www.jiosaavn.com/api.php"

# CORS and cache headers added to every response
COMMON_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS, HEAD",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "no-cache",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = http.server.SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map.update({
        ".webmanifest": "application/manifest+json; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
    })

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, fmt, *args):
        # Only log errors/warnings to keep console clean
        if args and len(args) >= 2 and str(args[1]) not in ("200", "206", "304"):
            super().log_message(fmt, *args)

    def end_headers(self):
        if hasattr(self, "path") and self.path.split("?")[0] == "/sw.js":
            self.send_header("Service-Worker-Allowed", "/")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        for k, v in COMMON_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # ── /api/saavn/* — proxy to JioSaavn ──────────────────────────
        if parsed.path.startswith("/api/saavn"):
            self._proxy_saavn(parsed.query)
            return

        # ── /api/audio?url=... — proxy audio stream with Referer ──────
        if parsed.path == "/api/audio":
            params = urllib.parse.parse_qs(parsed.query)
            url = params.get("url", [None])[0]
            if url:
                self._proxy_audio(url)
            else:
                self._respond(400, b'{"error": "Missing url parameter"}')
            return

        # ── Everything else — serve static files ──────────────────────
        super().do_GET()

    def _proxy_saavn(self, query_string):
        """Forward a query string to JioSaavn API and return the JSON response."""
        target = f"{JIOSAAVN_API}?{query_string}"
        try:
            req = urllib.request.Request(
                target,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Referer": "https://www.jiosaavn.com/",
                    "Accept": "application/json, text/plain, */*",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            for k, v in COMMON_HEADERS.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self._respond(502, json.dumps({"error": str(e)}).encode())

    def _proxy_audio(self, audio_url):
        """Stream a JioSaavn CDN audio file with the required Referer and Range headers."""
        try:
            req_headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://www.jiosaavn.com/",
                "Accept": "*/*",
            }
            # Forward Range header if browser sent one (essential for seeking and audio duration)
            if "Range" in self.headers:
                req_headers["Range"] = self.headers["Range"]

            req = urllib.request.Request(audio_url, headers=req_headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                status_code = resp.status
                self.send_response(status_code)
                for header in ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]:
                    val = resp.headers.get(header)
                    if val:
                        self.send_header(header, val)
                for k, v in COMMON_HEADERS.items():
                    self.send_header(k, v)
                self.end_headers()

                # Stream in 64KB chunks
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError, OSError):
            # Client closed connection (e.g. paused, scrubbed, or closed tab)
            pass
        except Exception as e:
            try:
                self._respond(502, json.dumps({"error": str(e)}).encode())
            except Exception:
                pass

    def _respond(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        for k, v in COMMON_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)


class ReusableThreadingServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    server = ReusableThreadingServer(("", PORT), Handler)
    print("\n  >> Audio Theraphy Dev Server")
    print("  -----------------------------")
    print(f"  Landing page : http://localhost:{PORT}/index.html")
    print(f"  Music player : http://localhost:{PORT}/player.html")
    print("  -----------------------------")
    print("  Press Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
        sys.exit(0)
