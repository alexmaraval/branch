import json
import os
import sys
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

WEB_DIR = os.path.join(os.path.dirname(__file__), "web")
API_URL = "https://api.openai.com/v1/chat/completions"


class BranchHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_POST(self):
        if self.path != "/api/chat":
            self.send_error(404, "Not Found")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            self._send_json({"error": "Empty request body"}, status=400)
            return

        try:
            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json({"error": "Invalid JSON"}, status=400)
            return

        api_key = data.get("apiKey")
        model = data.get("model")
        messages = data.get("messages")

        if not api_key or not model or not messages:
            self._send_json({"error": "Missing apiKey, model, or messages"}, status=400)
            return

        payload = json.dumps({"model": model, "messages": messages}).encode("utf-8")
        req = urllib.request.Request(
            API_URL,
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                resp_body = resp.read().decode("utf-8")
                resp_json = json.loads(resp_body)
        except urllib.error.HTTPError as err:
            try:
                err_body = err.read().decode("utf-8")
                err_json = json.loads(err_body)
                message = err_json.get("error", {}).get("message", "OpenAI API error")
            except (json.JSONDecodeError, UnicodeDecodeError):
                message = "OpenAI API error"
            self._send_json({"error": message}, status=err.code)
            return
        except Exception as err:
            self._send_json({"error": f"Request failed: {err}"}, status=500)
            return

        try:
            assistant_text = resp_json["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            self._send_json({"error": "Unexpected API response"}, status=500)
            return

        self._send_json({"assistant": assistant_text})

    def _send_json(self, data, status=200):
        response = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)


if __name__ == "__main__":
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("Invalid port, using 8000")

    server = ThreadingHTTPServer(("localhost", port), BranchHandler)
    print(f"Branch server running at http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
