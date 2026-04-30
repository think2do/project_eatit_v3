"""Shared fakes for agent-layer tests.

`ScriptedGateway` plays back a queue of canned content strings (or
`LLMError` subclasses) so we can exercise Instructor's retry loop and our
error-propagation wrapper without touching a real provider. Each `complete`
call pops one entry; error entries are raised, dict/str entries are wrapped
in a LiteLLM `ModelResponse` so Instructor's parser is happy.
"""

from __future__ import annotations

from typing import Any

from litellm import Choices, ModelResponse
from litellm.types.utils import Message

from app.infra.llm.errors import LLMError
from app.infra.llm.gateway import LLMGateway


def make_response(content: str) -> ModelResponse:
    """Return a LiteLLM ModelResponse that carries `content` as the assistant reply."""
    return ModelResponse(
        choices=[
            Choices(
                message=Message(content=content, role="assistant"),
                finish_reason="stop",
                index=0,
            )
        ],
        usage={"prompt_tokens": 5, "completion_tokens": 7, "total_tokens": 12},
    )


class ScriptedGateway(LLMGateway):
    """Gateway that plays back a fixed list of outputs.

    Each entry is either:
      - a `str` — served as the assistant message content (JSON mode).
      - an instance of `LLMError` (or subclass) — raised when dequeued.
    """

    def __init__(self, script: list[str | LLMError]) -> None:
        self._script = list(script)
        self.calls = 0
        self.last_messages: list[dict[str, Any]] | None = None
        # Captured per-call so tests can assert provider-specific kwargs
        # (notably `tools=[...]` for the Research Agent tool-use path).
        self.last_kwargs: dict[str, Any] = {}
        self.kwargs_history: list[dict[str, Any]] = []

    async def complete(self, messages: list[dict[str, Any]], **kwargs: Any) -> Any:
        self.calls += 1
        self.last_messages = messages
        self.last_kwargs = dict(kwargs)
        self.kwargs_history.append(dict(kwargs))
        if not self._script:
            raise AssertionError("ScriptedGateway exhausted: no more canned responses")
        nxt = self._script.pop(0)
        if isinstance(nxt, LLMError):
            raise nxt
        return make_response(nxt)
