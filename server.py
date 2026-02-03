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
        stream = bool(data.get("stream"))

        if not api_key or not model or not messages:
            self._send_json({"error": "Missing apiKey, model, or messages"}, status=400)
            return

        payload_dict = {"model": model, "messages": messages}
        if stream:
            payload_dict["stream"] = True
        payload = json.dumps(payload_dict).encode("utf-8")
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
                if stream:
                    self._stream_response(resp)
                else:
                    resp_body = resp.read().decode("utf-8")
                    resp_json = json.loads(resp_body)
                    assistant_text = resp_json["choices"][0]["message"]["content"]
                    self._send_json({"assistant": assistant_text})
        except urllib.error.HTTPError as err:
            message = "OpenAI API error"
            try:
                err_body = err.read().decode("utf-8")
                err_json = json.loads(err_body)
                message = err_json.get("error", {}).get("message", message)
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
            if stream:
                self._send_sse_error(message)
            else:
                self._send_json({"error": message}, status=err.code)
        except Exception as err:
            message = f"Request failed: {err}"
            if stream:
                self._send_sse_error(message)
            else:
                self._send_json({"error": message}, status=500)

    def _stream_response(self, resp):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        for raw_line in resp:
            try:
                line = raw_line.decode("utf-8")
            except UnicodeDecodeError:
                continue

            if not line.startswith("data: "):
                continue

            data = line.replace("data: ", "", 1).strip()
            if data == "[DONE]":
                self._send_sse_data("[DONE]")
                break

            try:
                payload = json.loads(data)
                delta = payload["choices"][0].get("delta", {}).get("content")
            except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                delta = None

            if delta:
                self._send_sse_data(json.dumps({"delta": delta}))

    def _send_sse_data(self, data):
        message = f"data: {data}\n\n".encode("utf-8")
        self.wfile.write(message)
        self.wfile.flush()

    def _send_sse_error(self, message):
        payload = json.dumps({"error": message})
        event = f"event: error\ndata: {payload}\n\n".encode("utf-8")
        self.wfile.write(event)
        self.wfile.flush()

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
