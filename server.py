"""
server.py — Audio Theraphy Dev Server
Serves static files AND securely proxies JioSaavn API & audio calls with the correct headers.
Includes strict SSRF protection, method checks, parameter allowlisting, and safe errors.

Run:  python server.py
Then open: http://localhost:5500
"""

import http.server
import urllib.request
import urllib.parse
import json
import os
import sys
import re

PORT = 5500
STATIC_DIR = (
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
    if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "public"))
    else os.path.dirname(os.path.abspath(__file__))
)
JIOSAAVN_API = "https://www.jiosaavn.com/api.php"

# Allowed JioSaavn CDN domains regex
ALLOWED_CDN_REGEX = re.compile(r"^([a-zA-Z0-9-]+\.)*(saavncdn\.com|jiosaavn\.com)$", re.IGNORECASE)

ALLOWED_CALLS = {
    "search.getResults",
    "song.generateAuthToken",
    "song.getDetails",
    "autocomplete.get",
}

DISALLOWED_HOSTS = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "169.254.169.254",
    "instance-data",
    "metadata.google.internal",
}

COMMON_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
    "Cache-Control": "no-cache",
}


def validate_audio_url(raw_url):
    """Strictly validates audio URL against SSRF and arbitrary target probing."""
    if not raw_url or len(raw_url) > 1024:
        return None
    try:
        parsed = urllib.parse.urlparse(raw_url)
    except Exception:
        return None

    if parsed.scheme != "https":
        return None
    if parsed.username or parsed.password:
        return None
    if parsed.port and parsed.port != 443:
        return None

    hostname = (parsed.hostname or "").lower()
    if not hostname or hostname in DISALLOWED_HOSTS:
        return None

    # Block private IP ranges
    if re.match(r"^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)", hostname):
        return None

    # Block raw IPv4 or IPv6
    if re.match(r"^(\d{1,3}\.){3}\d{1,3}$", hostname) or ":" in hostname:
        return None

    if not ALLOWED_CDN_REGEX.match(hostname):
        return None

    return parsed.geturl()


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

    def do_POST(self):
        self._respond_method_not_allowed()

    def do_PUT(self):
        self._respond_method_not_allowed()

    def do_DELETE(self):
        self._respond_method_not_allowed()

    def _respond_method_not_allowed(self):
        self.send_response(405)
        self.send_header("Allow", "GET, OPTIONS")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        for k, v in COMMON_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b'{"error": "Method Not Allowed"}')

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # ── /api/saavn/* — proxy to JioSaavn ──────────────────────────
        if parsed.path.startswith("/api/saavn"):
            self._proxy_saavn(parsed.query)
            return

        # ── /api/audio?url=... — proxy audio stream with Referer ──────
        if parsed.path == "/api/audio":
            params = urllib.parse.parse_qs(parsed.query)
            raw_url = params.get("url", [None])[0]
            if not raw_url:
                self._respond(400, b'{"error": "Missing url parameter"}')
                return

            valid_url = validate_audio_url(raw_url)
            if not valid_url:
                self._respond(400, b'{"error": "Invalid or unauthorized audio URL"}')
                return

            self._proxy_audio(valid_url)
            return

        # ── Everything else — serve static files ──────────────────────
        super().do_GET()

    def _proxy_saavn(self, query_string):
        """Validate input parameters and forward query to JioSaavn API."""
        params = urllib.parse.parse_qs(query_string)
        call = params.get("__call", [None])[0]

        if not call or call not in ALLOWED_CALLS:
            self._respond(400, b'{"error": "Invalid or unauthorized API call"}')
            return

        # Query bounds checking
        q_val = params.get("q", [""])[0]
        if len(q_val) > 100:
            self._respond(400, b'{"error": "Search query exceeds 100 characters"}')
            return

        safe_params = {
            "__call": call,
            "_format": "json",
            "_marker": "0",
            "api_version": "4",
            "ctx": "wap6dot0",
        }
        if "q" in params:
            safe_params["q"] = params["q"][0][:100]
        if "n" in params:
            try:
                num = max(1, min(50, int(params["n"][0])))
                safe_params["n"] = str(num)
            except ValueError:
                safe_params["n"] = "20"
        if "url" in params:
            safe_params["url"] = params["url"][0][:500]
        if "bitrate" in params:
            b = params["bitrate"][0]
            safe_params["bitrate"] = b if b in ("320", "160", "96") else "320"

        target = f"{JIOSAAVN_API}?{urllib.parse.urlencode(safe_params)}"
        try:
            req = urllib.request.Request(
                target,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Referer": "https://www.jiosaavn.com/",
                    "Accept": "application/json, text/plain, */*",
                },
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            for k, v in COMMON_HEADERS.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            print(f"[Server/Saavn] Error: {e}", file=sys.stderr)
            self._respond(502, b'{"error": "Search service unavailable"}')

    def _proxy_audio(self, audio_url):
        """Stream validated JioSaavn CDN audio file with required Referer & Range headers."""
        try:
            req_headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://www.jiosaavn.com/",
                "Accept": "*/*",
            }
            if "Range" in self.headers:
                req_headers["Range"] = self.headers["Range"]

            req = urllib.request.Request(audio_url, headers=req_headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                status_code = resp.status
                self.send_response(status_code)
                for header in ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]:
                    val = resp.headers.get(header)
                    if val:
                        self.send_header(header, val)
                for k, v in COMMON_HEADERS.items():
                    self.send_header(k, v)
                self.end_headers()

                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError, OSError):
            pass
        except Exception as e:
            print(f"[Server/Audio] Error: {e}", file=sys.stderr)
            try:
                self._respond(502, b'{"error": "Audio stream unavailable"}')
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
