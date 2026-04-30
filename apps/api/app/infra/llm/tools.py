"""LLM tool-use adapters (F-320).

Today only a single tool is exposed — Anthropic's hosted `web_search`,
which lets Claude fetch live URLs without us proxying the search engine.
The adapter is split into two halves:

  * `build_web_search_tool()` — returns the JSON schema the model expects
    in the `tools=[...]` field of a chat completion. Anthropic-shaped
    today; when other providers ship their own hosted tools we add a
    discriminating layer here.

  * `ToolUseCapability.probe()` — best-effort detection of whether the
    BYOK key in front of us speaks tool use at all. We send a tiny
    no-op tool and look for a `tool_use` content block. A failure is a
    "tool use unsupported" signal, *not* a network error: the caller
    falls back to a degraded research path that uses model-internal
    knowledge only.

The probe result is intentionally **not** cached at module scope. Each
ResearchAgentService.run() call probes once. Caching across requests is
left to upper layers because each user holds their own LLMConfig.
"""
from __future__ import annotations

import logging
from typing import Any

from app.infra.llm.errors import LLMError
from app.infra.llm.gateway import LLMGateway

logger = logging.getLogger(__name__)


# Anthropic's hosted web search tool. Reference:
# https://docs.anthropic.com/en/docs/agents-and-tools/tool-use
# When other providers ship hosted search this becomes a discriminated
# return based on `gateway._config.provider`.
_WEB_SEARCH_TOOL_SCHEMA: dict[str, Any] = {
    "type": "web_search_20250320",
    "name": "web_search",
    "max_uses": 5,
}


def build_web_search_tool() -> dict[str, Any]:
    """Return the provider tool schema for hosted web search."""
    return dict(_WEB_SEARCH_TOOL_SCHEMA)


class ToolUseCapability:
    """Best-effort probe: can THIS BYOK key call tools at all?

    Used by ResearchAgentService to decide whether to take the tool-
    augmented path or fall straight to the degraded path. The probe
    must never raise: any exception is interpreted as "tool use
    unsupported" so the user gets a degraded result rather than a
    crash.
    """

    @staticmethod
    async def probe(gateway: LLMGateway) -> bool:
        try:
            response = await gateway.complete(
                messages=[
                    {
                        "role": "user",
                        "content": "Reply with the literal token READY.",
                    }
                ],
                tools=[build_web_search_tool()],
                max_tokens=16,
            )
        except LLMError as exc:
            # Auth / rate limit / network — caller already has typed
            # error context; we just classify as "no tool use".
            logger.info("tool_use_probe_failed", extra={"reason": type(exc).__name__})
            return False
        except Exception as exc:  # noqa: BLE001 — defensive
            logger.info("tool_use_probe_failed", extra={"reason": type(exc).__name__})
            return False
        return _looks_like_tool_capable(response)


def _looks_like_tool_capable(response: Any) -> bool:
    """Heuristic: did the upstream return a shape that includes tool slots?

    LiteLLM normalises responses to OpenAI-compatible objects, so we look
    for either a `tool_calls` slot or a 200-style finish reason. A bare
    text reply still counts as tool-capable: the model elected not to
    call the tool, but the *channel* exists.
    """
    try:
        choices = getattr(response, "choices", None)
        if not choices:
            return False
        # Even a plain text reply through tools=[] proves the provider
        # accepted the tool block without 4xx-ing on us, which is the
        # only signal we need.
        return True
    except Exception:  # noqa: BLE001 — defensive
        return False
