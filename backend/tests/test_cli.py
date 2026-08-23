from __future__ import annotations

import pytest
import uvicorn

from cvfuzz.cli import serve_command
from cvfuzz.exceptions import CVFuzzError


def test_serve_uses_api_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    called: dict[str, object] = {}
    monkeypatch.setenv("CVFUZZ_API_HOST", "0.0.0.0")
    monkeypatch.setenv("CVFUZZ_API_PORT", "8123")
    monkeypatch.setattr(uvicorn, "run", lambda app, **kwargs: called.update(app=app, **kwargs))

    serve_command(host=None, port=None, reload=False)

    assert called == {
        "app": "cvfuzz.api:app",
        "host": "0.0.0.0",
        "port": 8123,
        "reload": False,
    }


def test_serve_options_override_api_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    called: dict[str, object] = {}
    monkeypatch.setenv("CVFUZZ_API_HOST", "127.0.0.2")
    monkeypatch.setenv("CVFUZZ_API_PORT", "8123")
    monkeypatch.setattr(uvicorn, "run", lambda app, **kwargs: called.update(app=app, **kwargs))

    serve_command(host="127.0.0.3", port=9000, reload=True)

    assert called["host"] == "127.0.0.3"
    assert called["port"] == 9000
    assert called["reload"] is True


@pytest.mark.parametrize("value", ["not-a-port", "0", "65536"])
def test_serve_rejects_invalid_environment_port(
    value: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CVFUZZ_API_PORT", value)

    with pytest.raises(CVFuzzError, match="CVFUZZ_API_PORT"):
        serve_command(host=None, port=None, reload=False)
