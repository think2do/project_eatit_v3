"""F-318 / V32.M3.1.1 — Coach Agent ethical guardrail tests.

Three layers under test (matching the three layers in
``apps/api/app/agents/coach/service.py``):

  1. **Schema (L0 A11)** — ``CoachAgentInput`` is ``extra="forbid"``.
     Resume bodies and PII fields raise ``ValidationError`` before the
     prompt or any LLM contact.
  2. **Tone (L0 条款 12)** — ``sanitize_tone`` coerces every one of the
     12 forbidden judgmental phrases to a constructive fallback and
     emits a ``coach_tone_violation`` WARN log. Mirrors the F-314
     ``coerce_pass_likelihood`` pattern.
  3. **Service** — running the agent against a scripted gateway returns
     a valid ``CoachAgentOutput`` with the metadata fields
     (``user_id`` / ``based_on_*`` / ``generated_at``) stamped server-side.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import pytest
from pydantic import ValidationError

from app.agents.coach.schemas import (
    CoachAgentInput,
    CoachAgentOutput,
    UserInsightCache,
)
from app.agents.coach.service import (
    FORBIDDEN_TONE_WORDS,
    CoachAgentService,
    sanitize_output,
    sanitize_tone,
)
from app.agents.coach.schemas import _LLMCoachOutput
from tests.agents._fakes import ScriptedGateway


# ---------------------------------------------------------------------------
# Schema layer — extra="forbid" + min_length=3 on recent_reports
# ---------------------------------------------------------------------------


def _base_input_kwargs(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = dict(
        user_id="u-1",
        based_on_session_count=3,
        based_on_last_session_id="s-3",
        recent_reports=[{"summary": "report 1"}, {"summary": "r2"}, {"summary": "r3"}],
    )
    base.update(overrides)
    return base


def test_input_rejects_resume_text() -> None:
    """resume_text must NOT slip into the prompt — extra=forbid catches it."""
    with pytest.raises(ValidationError, match="extra"):
        CoachAgentInput(
            **_base_input_kwargs(),
            resume_text="不应该到达 LLM 的简历正文",  # type: ignore[call-arg]
        )


def test_input_rejects_candidate_email() -> None:
    with pytest.raises(ValidationError, match="extra"):
        CoachAgentInput(
            **_base_input_kwargs(),
            candidate_email="user@example.com",  # type: ignore[call-arg]
        )


def test_input_requires_three_recent_reports() -> None:
    with pytest.raises(ValidationError, match="at least"):
        CoachAgentInput(
            user_id="u-1",
            based_on_session_count=3,
            based_on_last_session_id="s-3",
            recent_reports=[{"a": 1}, {"b": 2}],  # only 2
        )


def test_input_session_count_ge_3() -> None:
    """场次<3 跳过是 caller 的职责,但 schema 也兜底。"""
    with pytest.raises(ValidationError, match="greater than or equal to 3"):
        CoachAgentInput(
            user_id="u-1",
            based_on_session_count=2,
            based_on_last_session_id="s-2",
            recent_reports=[{"a": 1}, {"b": 2}, {"c": 3}],
        )


# ---------------------------------------------------------------------------
# Tone scan — every forbidden word must coerce + emit WARN
# ---------------------------------------------------------------------------


def test_forbidden_tone_words_count() -> None:
    """The forbidden list must remain at exactly 12 words (M0.3 / M3.1.1
    parity with F-314 ``pass_likelihood`` red-line)."""
    assert len(FORBIDDEN_TONE_WORDS) == 12


@pytest.mark.parametrize("forbidden", FORBIDDEN_TONE_WORDS)
def test_sanitize_coerces_forbidden_word_in_headline(
    forbidden: str, caplog: pytest.LogCaptureFixture
) -> None:
    """Each L0-forbidden phrase, when present, must coerce to the fallback
    and emit a ``coach_tone_violation`` WARN log."""
    caplog.set_level(logging.WARNING, logger="app.agents.coach.service")
    text = f"近期表现 {forbidden},接下来怎么办"
    fallback = "继续围绕薄弱维度做专项训练"
    result = sanitize_tone(text, fallback=fallback, field="headline")
    assert result == fallback
    assert any(
        r.getMessage() == "coach_tone_violation" for r in caplog.records
    ), f"expected WARN log for forbidden word {forbidden!r}, got {caplog.records!r}"


def test_sanitize_passes_clean_text() -> None:
    """Constructive phrasing must pass through untouched."""
    text = "继续深耕数据驱动方向,聚焦三个维度的补强"
    assert sanitize_tone(text, fallback="x", field="headline") == text


def test_sanitize_output_replaces_dirty_fields_only() -> None:
    """A dirty headline gets replaced; clean fields pass through."""
    dirty = _LLMCoachOutput(
        headline="你不适合这个方向,差距很大",
        headline_detail="近三场表现稳定提升,建议在数据驱动方向多练 3 场",
        recurring_weaknesses=["STAR 框架不完整", "建议放弃 zero-to-one 题"],
        improvement_signals=["近三场结构化表达稳定提升"],
        next_focus_areas=["data-driven"],
    )
    clean = sanitize_output(dirty)
    # Headline got replaced (had "不适合" and "差距很大").
    assert clean.headline != dirty.headline
    # Detail was clean → unchanged.
    assert clean.headline_detail == dirty.headline_detail
    # First weakness clean → unchanged; second has "建议放弃" → replaced.
    assert clean.recurring_weaknesses[0] == dirty.recurring_weaknesses[0]
    assert clean.recurring_weaknesses[1] != dirty.recurring_weaknesses[1]
    # Signal was clean → unchanged.
    assert clean.improvement_signals == dirty.improvement_signals
    # next_focus_areas is enum-typed, not free text → never sanitized.
    assert clean.next_focus_areas == ["data-driven"]


# ---------------------------------------------------------------------------
# Service layer — happy path with scripted gateway
# ---------------------------------------------------------------------------


_LLM_HAPPY_REPLY = json.dumps(
    {
        "headline": "继续深耕数据驱动方向,围绕业务直觉做 3 场专项训练",
        "headline_detail": (
            "近三场结构化表达稳定提升;建议接下来重点训练数据指标推导"
            "与跨职能协作类问题。"
        ),
        "recurring_weaknesses": ["指标拆解深度不足", "STAR 收尾仓促"],
        "improvement_signals": ["近三场结构化表达稳定提升"],
        "next_focus_areas": ["data-driven", "cross-func"],
    },
    ensure_ascii=False,
)


@pytest.fixture
def coach_input() -> CoachAgentInput:
    return CoachAgentInput(
        user_id="u-1",
        based_on_session_count=3,
        based_on_last_session_id="s-3",
        recent_reports=[
            {"summary": "report 1", "overall_score": 70},
            {"summary": "report 2", "overall_score": 72},
            {"summary": "report 3", "overall_score": 75},
        ],
        candidate_profile=None,
    )


async def test_run_happy_path_stamps_server_side_metadata(
    coach_input: CoachAgentInput,
) -> None:
    gateway = ScriptedGateway([_LLM_HAPPY_REPLY])
    result = await CoachAgentService().run(coach_input, gateway)

    assert isinstance(result, CoachAgentOutput)
    assert result.user_id == "u-1"
    assert result.based_on_session_count == 3
    assert result.based_on_last_session_id == "s-3"
    assert result.status == "ok"
    assert result.headline.startswith("继续深耕数据驱动方向")
    # Schema-level: every field round-trips through UserInsightCache.
    assert UserInsightCache.model_validate(result.model_dump()).user_id == "u-1"


async def test_run_sanitises_dirty_llm_output(
    coach_input: CoachAgentInput,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Even if the model produces a forbidden tone word, the service-layer
    post-scan rescues the user-facing payload."""
    dirty_reply = json.dumps(
        {
            "headline": "你不适合这个岗位,差距很大",
            "headline_detail": "建议放弃,继续准备其他方向。",
            "recurring_weaknesses": ["专业深度不合格"],
            "improvement_signals": ["近三场表达进步明显"],
            "next_focus_areas": ["data-driven"],
        },
        ensure_ascii=False,
    )
    gateway = ScriptedGateway([dirty_reply])
    caplog.set_level(logging.WARNING, logger="app.agents.coach.service")

    result = await CoachAgentService().run(coach_input, gateway)

    # Dirty fields got replaced.
    assert "不适合" not in result.headline
    assert "差距很大" not in result.headline
    assert "建议放弃" not in result.headline_detail
    assert all("不合格" not in w for w in result.recurring_weaknesses)
    # Clean field passed through.
    assert "近三场" in result.improvement_signals[0]
    # Tone-violation logs were emitted.
    assert any(
        r.getMessage() == "coach_tone_violation" for r in caplog.records
    )
