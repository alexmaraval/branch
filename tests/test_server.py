import importlib.util
from pathlib import Path


def load_server_module():
    root = Path(__file__).resolve().parents[1]
    server_path = root / "server.py"
    spec = importlib.util.spec_from_file_location("branch_server", server_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_api_url():
    server = load_server_module()
    assert server.API_URL.endswith("/chat/completions")
