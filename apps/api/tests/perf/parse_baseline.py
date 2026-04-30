"""Locust scaffold — POST parse baseline.

本地跑::

    cd apps/api
    uv run locust -f tests/perf/parse_baseline.py \\
        --headless -u 5 -r 1 -t 60s --host http://localhost:8000

注意:

- 必须先启动 backend(``uv run uvicorn app.main:app --port 8000``)。
- backend 必须用 mock LLM gateway(``EATIT_LLM_BACKEND=mock``)— 真 LLM
  会污染基线数字,A21 红线明确禁止。
- CI 不跑(详见 ``./README.md``);本节点只落骨架,首次实测留给人工。
- 真实路由是 ``/api/v1/asset-bundles/{bundle_id}/parse``,需要预先 POST
  上传 resume/JD 拿到 ``bundle_id``。本骨架沿用 spec 文案的占位 URL
  ``/api/v1/sessions/parse``,首次跑前需要先把 ``on_start`` 改成预上传。

V32.M4.4 — A21 enforced. 本地 only,baseline.md 由人工填数字。
"""
from __future__ import annotations

from pathlib import Path

from locust import HttpUser, between, task

# Resolve fixtures relative to this file so locust can be invoked from
# any cwd without breaking — `tests/fixtures/sample_*` are placeholders
# that the operator drops in before the first real run.
_FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"
_RESUME_PATH = _FIXTURE_DIR / "sample_resume.pdf"
_JD_PATH = _FIXTURE_DIR / "sample_jd.txt"


class ParseUser(HttpUser):
    """Single-task user that exercises the parse endpoint."""

    wait_time = between(1, 3)

    def on_start(self) -> None:
        # Pre-load fixture bytes once per user — re-reading from disk on
        # every request would inflate P50 with filesystem noise.
        self._resume_bytes = (
            _RESUME_PATH.read_bytes() if _RESUME_PATH.exists() else b""
        )
        self._jd_bytes = _JD_PATH.read_bytes() if _JD_PATH.exists() else b""

    @task
    def parse(self) -> None:
        self.client.post(
            "/api/v1/sessions/parse",
            files={
                "resume": ("resume.pdf", self._resume_bytes, "application/pdf"),
                "jd": ("jd.txt", self._jd_bytes, "text/plain"),
            },
        )
