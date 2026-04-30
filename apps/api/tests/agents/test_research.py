"""V32.M2.3.1 — ResearchAgentService + L0 A11 privacy tests (F-320).

Three guardrail layers under test here:

  1. **Schema layer** — ResearchAgentInput is `extra="forbid"`. Tests
     show that resume_text / candidate_email / candidate_phone all
     raise ValidationError before any LLM contact.
  2. **Audit layer** — service.run() logs `cache_key` (sha256 prefix)
     only. The plaintext company_name MUST NOT show up in any log
     `extra` payload. We capture log records and grep them.
  3. **Service layer** — when ToolUseCapability.probe returns False
     (BYOK key without tool support), service falls back to a
     degraded run that still produces a valid ResearchAgentOutput
     with `degraded=True` + a non-empty `degraded_reason`.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import pytest
from pydantic import ValidationError

from app.agents.research.schemas import (
    CompanyProfile,
    IndustryProfile,
    ResearchAgentInput,
    ResearchAgentOutput,
    Signal,
)
from app.agents.research.service import ResearchAgentService, _compute_cache_key
from tests.agents._fakes import ScriptedGateway


# ---------------------------------------------------------------------------
# Schema layer (L0 A11) — extra="forbid"
# ---------------------------------------------------------------------------


def test_input_rejects_resume_text() -> None:
    """resume_text MUST be rejected at the Pydantic layer (extra=forbid)."""
    with pytest.raises(ValidationError, match="extra"):
        ResearchAgentInput(
            company_name="字节跳动",
            role_title="高级产品经理",
            industry_hints=["短视频"],
            resume_text="这是简历正文,不应该到达 LLM",  # type: ignore[call-arg]
        )


def test_input_rejects_candidate_email() -> None:
    with pytest.raises(ValidationError, match="extra"):
        ResearchAgentInput(
            company_name="Stripe",
            role_title="PM",
            industry_hints=["payments"],
            candidate_email="user@example.com",  # type: ignore[call-arg]
        )


def test_input_rejects_candidate_phone() -> None:
    with pytest.raises(ValidationError, match="extra"):
        ResearchAgentInput(
            company_name="Stripe",
            role_title="PM",
            industry_hints=["payments"],
            candidate_phone="13800138000",  # type: ignore[call-arg]
        )


def test_industry_hints_min_1() -> None:
    with pytest.raises(ValidationError, match="at least"):
        ResearchAgentInput(
            company_name="x", role_title="y", industry_hints=[]
        )


def test_industry_hints_max_5() -> None:
    with pytest.raises(ValidationError, match="at most"):
        ResearchAgentInput(
            company_name="x", role_title="y", industry_hints=["a"] * 6
        )


def test_company_name_min_max_length() -> None:
    with pytest.raises(ValidationError, match="at least"):
        ResearchAgentInput(company_name="", role_title="y", industry_hints=["z"])
    with pytest.raises(ValidationError, match="at most"):
        ResearchAgentInput(
            company_name="x" * 81, role_title="y", industry_hints=["z"]
        )


# ---------------------------------------------------------------------------
# Cache key — hash, not plaintext
# ---------------------------------------------------------------------------


def test_cache_key_is_deterministic_hash() -> None:
    inp = ResearchAgentInput(
        company_name="字节跳动",
        role_title="高级产品经理",
        industry_hints=["短视频", "推荐算法"],
    )
    key_a = _compute_cache_key(inp)
    key_b = _compute_cache_key(inp)
    assert key_a == key_b
    assert len(key_a) == 16
    # The hash must NOT contain the company plaintext.
    assert "字节" not in key_a
    assert "跳动" not in key_a
    assert "短视频" not in key_a


def test_cache_key_changes_with_input() -> None:
    a = _compute_cache_key(
        ResearchAgentInput(
            company_name="A", role_title="r", industry_hints=["x"]
        )
    )
    b = _compute_cache_key(
        ResearchAgentInput(
            company_name="B", role_title="r", industry_hints=["x"]
        )
    )
    assert a != b


# ---------------------------------------------------------------------------
# Service layer — degraded path
# ---------------------------------------------------------------------------


_LLM_DEGRADED_REPLY = json.dumps(
    {
        "company": {
            "name": "字节跳动",
            "business_model": "短视频与社交平台,广告变现为主。",
            "stage": "mature",
            "recent_signals": [],
            "evidence_links": [],
            "confidence": "low",
        },
        "industry": {
            "name": "短视频",
            "landscape_summary": "中国短视频行业进入存量竞争。(信息可能陈旧,请人工核实)",
            "key_metrics": ["DAU", "时长", "广告 ARPU"],
            "typical_pain_points": ["内容审核成本", "创作者生态"],
            "competitors_in_jd_ctx": [],
        },
    }
)


@pytest.fixture
def agent_input() -> ResearchAgentInput:
    return ResearchAgentInput(
        company_name="字节跳动",
        role_title="高级产品经理",
        industry_hints=["短视频"],
    )


async def test_degraded_when_tool_use_unsupported(
    monkeypatch: pytest.MonkeyPatch, agent_input: ResearchAgentInput
) -> None:
    """If ToolUseCapability.probe returns False the service must fall back."""

    async def _force_no_tool_use(_gateway: Any) -> bool:
        return False

    monkeypatch.setattr(
        "app.agents.research.service.ToolUseCapability.probe",
        staticmethod(_force_no_tool_use),
    )
    gateway = ScriptedGateway([_LLM_DEGRADED_REPLY])

    result = await ResearchAgentService().run(agent_input, gateway)

    assert isinstance(result, ResearchAgentOutput)
    assert result.degraded is True
    assert result.degraded_reason == "tool_use_unsupported"
    assert result.company.name == "字节跳动"
    assert result.industry.name == "短视频"
    # cache_key is hash, not plaintext.
    assert "字节" not in result.cache_key
    assert len(result.cache_key) == 16


async def test_degraded_uses_stub_when_even_fallback_fails(
    monkeypatch: pytest.MonkeyPatch, agent_input: ResearchAgentInput
) -> None:
    """Belt-and-braces: if the tool-less LLM call ALSO errors, ship a stub."""
    from app.infra.llm.errors import LLMNetworkError

    async def _force_no_tool_use(_gateway: Any) -> bool:
        return False

    monkeypatch.setattr(
        "app.agents.research.service.ToolUseCapability.probe",
        staticmethod(_force_no_tool_use),
    )
    # 3 attempts (instructor max_retries=2 + initial = 3). All fail.
    gateway = ScriptedGateway([LLMNetworkError("upstream offline")] * 3)

    result = await ResearchAgentService().run(agent_input, gateway)

    assert result.degraded is True
    assert result.company.stage == "unknown"
    assert "暂不可用" in result.company.business_model
    # Industry stub still satisfies min_length=3 / 2 schema constraints.
    assert len(result.industry.key_metrics) >= 3
    assert len(result.industry.typical_pain_points) >= 2


# ---------------------------------------------------------------------------
# Audit log — no resume / PII / plaintext company in any log record
# ---------------------------------------------------------------------------


async def test_audit_log_no_resume_or_plaintext_company(
    monkeypatch: pytest.MonkeyPatch,
    agent_input: ResearchAgentInput,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Capture all log records emitted by the service and grep them."""

    async def _force_no_tool_use(_gateway: Any) -> bool:
        return False

    monkeypatch.setattr(
        "app.agents.research.service.ToolUseCapability.probe",
        staticmethod(_force_no_tool_use),
    )
    gateway = ScriptedGateway([_LLM_DEGRADED_REPLY])

    with caplog.at_level(logging.INFO, logger="app.agents.research.service"):
        await ResearchAgentService().run(agent_input, gateway)

    # No record should mention "resume" or "candidate_email/phone" or the
    # plaintext company name in any of: message, args, or extra.
    forbidden = ["resume", "candidate_email", "candidate_phone", "字节跳动"]
    for record in caplog.records:
        haystack = " ".join(
            [
                record.getMessage(),
                str(record.args or ""),
                json.dumps(
                    {
                        k: v
                        for k, v in record.__dict__.items()
                        if k
                        not in {
                            "args",
                            "msg",
                            "exc_info",
                            "exc_text",
                            "stack_info",
                            "name",
                            "msecs",
                            "relativeCreated",
                            "thread",
                            "threadName",
                            "processName",
                            "process",
                            "module",
                            "filename",
                            "pathname",
                            "lineno",
                            "funcName",
                            "created",
                            "levelname",
                            "levelno",
                        }
                    },
                    default=str,
                    ensure_ascii=False,
                ),
            ]
        )
        for needle in forbidden:
            assert needle not in haystack, (
                f"audit log leaked {needle!r}: {haystack}"
            )

    # At least one INFO record was emitted (research_request).
    assert any(
        r.getMessage() == "research_request" for r in caplog.records
    ), "expected a single research_request audit line"


# ---------------------------------------------------------------------------
# Schema sanity — every produced ResearchAgentOutput is round-trippable
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Service layer — tool-augmented happy path (M2.3.X audit-fix G7)
# ---------------------------------------------------------------------------


_LLM_HAPPY_REPLY = json.dumps(
    {
        "company": {
            "name": "字节跳动",
            "business_model": "短视频与社交平台,广告变现为主。",
            "stage": "mature",
            "recent_signals": [
                {
                    "type": "product",
                    "summary": "TikTok Shop 在东南亚扩张",
                    "occurred_at": None,
                    "source_url": "https://example.com/tiktokshop",
                }
            ],
            "evidence_links": ["https://example.com/bytedance"],
            "confidence": "high",
        },
        "industry": {
            "name": "短视频",
            "landscape_summary": "中国短视频行业进入存量竞争。",
            "key_metrics": ["DAU", "时长", "广告 ARPU"],
            "typical_pain_points": ["内容审核成本", "创作者生态"],
            "competitors_in_jd_ctx": ["快手"],
        },
    }
)


async def test_tool_augmented_run_passes_web_search_tool(
    monkeypatch: pytest.MonkeyPatch, agent_input: ResearchAgentInput
) -> None:
    """Pre-audit `tools=[...]` was commented out — make sure it actually
    reaches the gateway when probe=True. This locks G2 (the dead-lock fix
    where the LLM never received the tool block) against regression."""

    async def _force_tool_use(_gateway: Any) -> bool:
        return True

    monkeypatch.setattr(
        "app.agents.research.service.ToolUseCapability.probe",
        staticmethod(_force_tool_use),
    )
    gateway = ScriptedGateway([_LLM_HAPPY_REPLY])

    result = await ResearchAgentService().run(agent_input, gateway)

    assert isinstance(result, ResearchAgentOutput)
    assert result.degraded is False
    assert result.company.name == "字节跳动"
    # The point of this test: tool block actually hit the gateway.
    # ScriptedGateway captures kwargs per call; the structured_completion
    # call is the only LLM contact and it must include `tools`.
    completion_call = gateway.kwargs_history[0]
    assert "tools" in completion_call, (
        "tools=[build_web_search_tool()] regressed back to commented-out — "
        f"completion kwargs were {completion_call!r}"
    )
    tools = completion_call["tools"]
    assert isinstance(tools, list) and len(tools) >= 1
    assert tools[0].get("name") == "web_search"
    assert tools[0].get("type") == "web_search_20250320"


def test_resolve_tools_static_helper() -> None:
    """_resolve_tools(True) returns a single web_search block; (False) → None."""
    enabled = ResearchAgentService._resolve_tools(True)
    assert enabled is not None and len(enabled) == 1
    assert enabled[0]["name"] == "web_search"
    assert ResearchAgentService._resolve_tools(False) is None


def test_research_output_round_trip() -> None:
    """A hand-built valid output deserialises into the same shape."""
    out = ResearchAgentOutput(
        company=CompanyProfile(
            name="OpenAI",
            business_model="基础大模型 API 与 ChatGPT 订阅。",
            stage="growth",
            recent_signals=[
                Signal(type="funding", summary="C 轮 100 亿美元", source_url=None)
            ],
            evidence_links=["https://example.com/oai"],
            confidence="high",
        ),
        industry=IndustryProfile(
            name="基础模型",
            landscape_summary="基础模型市场进入推理与多模态扩展期。",
            key_metrics=["MAU", "推理成本", "Token 价格"],
            typical_pain_points=["推理算力", "数据合规"],
            competitors_in_jd_ctx=["Anthropic", "Google"],
        ),
        fetched_at="2026-04-30T12:00:00+00:00",  # type: ignore[arg-type]
        cache_key="0123456789abcdef",
        degraded=False,
    )
    encoded = out.model_dump_json()
    decoded = ResearchAgentOutput.model_validate_json(encoded)
    assert decoded.company.name == "OpenAI"
    assert decoded.degraded is False
