"""Instructor adapter over our BYOKGateway.

Instructor needs a callable with the same shape as `litellm.acompletion` so it
can inject the JSON/tool prompts, call the model, and parse the response into
a Pydantic model. We don't want to let Instructor call `litellm.acompletion`
directly because that would bypass our gateway — we'd lose error mapping,
retry policy, and the single call site that touches `api_key`.

The adapter here wraps `gateway.complete` so Instructor can call it as if it
were `litellm.acompletion`. The gateway already pins api_key / base_url /
model from its LLMConfig, so we strip any `model` kwarg Instructor tries to
pass through (it is not needed and would collide with the gateway's own).
"""

from __future__ import annotations

from typing import Any, Callable, TypeVar

import instructor
from instructor.core.exceptions import InstructorRetryException
from pydantic import BaseModel

from app.infra.llm.errors import LLMError
from app.infra.llm.gateway import LLMGateway

T = TypeVar("T", bound=BaseModel)


def _gateway_adapter(gateway: LLMGateway) -> Callable[..., Any]:
    async def _completion(**kwargs: Any) -> Any:
        messages = kwargs.pop("messages")
        kwargs.pop("model", None)  # gateway resolves model from LLMConfig
        return await gateway.complete(messages=messages, **kwargs)

    return _completion


def make_instructor(
    gateway: LLMGateway,
    *,
    mode: instructor.Mode = instructor.Mode.JSON,
) -> instructor.AsyncInstructor:
    """Return an Instructor client wired to call the supplied gateway.

    JSON mode is the default because every OpenAI-compatible provider we ship
    (siliconflow / deepseek / dashscope / openai / custom) supports
    `response_format={"type": "json_object"}`. Anthropic is handled by
    LiteLLM's OpenAI-compat shim at the model-ref layer.
    """
    return instructor.from_litellm(_gateway_adapter(gateway), mode=mode)


async def structured_completion(
    client: instructor.AsyncInstructor,
    *,
    messages: list[dict[str, Any]],
    response_model: type[T],
    max_retries: int = 2,
    **completion_kwargs: Any,
) -> T:
    """Thin wrapper that unwraps Instructor's retry exception.

    Instructor wraps any exception raised inside the completion callable in an
    `InstructorRetryException`. That hides our typed `LLMError` subclasses from
    callers. We peel the wrapper off so the agent-layer contract stays
    "typed LLM errors bubble up unchanged".

    `**completion_kwargs` lets callers forward provider-specific options
    (e.g. `tools=[build_web_search_tool()]`, `max_tokens=...`) all the way
    through to `gateway.complete`. Instructor accepts unknown kwargs and
    passes them along to the litellm-style completion callable.
    """
    try:
        return await client.chat.completions.create(
            model="byok",
            messages=messages,
            response_model=response_model,
            max_retries=max_retries,
            **completion_kwargs,
        )
    except InstructorRetryException as exc:
        for arg in exc.args:
            if isinstance(arg, LLMError):
                raise arg from exc
        raise
