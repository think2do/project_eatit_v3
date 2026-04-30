"""F-322 / V32.M3.2.1 — Reflection Agent ethical guardrail tests.

Three layers under test (matching the three layers in
``apps/api/app/agents/reflection/service.py``):

  1. **Schema (L0 A11)** — ``ReflectionAgentInput`` is ``extra="forbid"``.
     PII / resume_text raise ``ValidationError`` before prompt render.
  2. **Tone (L0 条款 12)** — ``sanitize_tone`` coerces every one of the
     12 forbidden judgmental phrases (Coach parity); ``mistakes_to_avoid``
     items get an additional sentence-pattern check (accusatory openings
     rewritten to "建议下次" form).
  3. **Service** — running the agent against a scripted gateway returns
     a valid ``ReflectionAgentOutput`` with metadata stamped server-side.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import pytest
from pydantic import ValidationError

from app.agents.reflection.schemas import (
    PerQuestionCoaching,
    ReflectionAgentInput,
    ReflectionAgentOutput,
    ReflectionReport,
    _LLMReflectionOutput,
)
from app.agents.reflection.service import (
    ACCUSATORY_PREFIXES,
    FORBIDDEN_TONE_WORDS,
    ReflectionAgentService,
    rewrite_accusatory_to_teaching,
    sanitize_output,
    sanitize_per_question,
    sanitize_tone,
)
from tests.agents._fakes import ScriptedGateway


# ---------------------------------------------------------------------------
# Schema layer — extra="forbid"
# ---------------------------------------------------------------------------


def _input_kwargs(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = dict(
        session_id="s-1",
        report_id="r-1",
        report_payload={"ai_verdict": "整体表现稳定", "overall_score": 70},
        turns=[
            {"question": "Q1", "answer": "A1", "assessment": None},
            {"question": "Q2", "answer": "A2", "assessment": {"summary": "ok"}},
        ],
    )
    base.update(overrides)
    return base


def test_input_rejects_resume_text() -> None:
    with pytest.raises(ValidationError, match="extra"):
        ReflectionAgentInput(
            **_input_kwargs(),
            resume_text="不应到 LLM 的简历正文",  # type: ignore[call-arg]
        )


def test_input_rejects_candidate_email() -> None:
    with pytest.raises(ValidationError, match="extra"):
        ReflectionAgentInput(
            **_input_kwargs(),
            candidate_email="user@example.com",  # type: ignore[call-arg]
        )


def test_input_accepts_optional_parse_and_research() -> None:
    inp = ReflectionAgentInput(
        **_input_kwargs(),
        parse_payload={"match": 70},
        research_payload={"company": {"name": "X"}},
    )
    assert inp.parse_payload == {"match": 70}
    assert inp.research_payload == {"company": {"name": "X"}}


# ---------------------------------------------------------------------------
# Tone scan — every forbidden word must coerce + emit WARN
# ---------------------------------------------------------------------------


def test_forbidden_tone_words_count_matches_coach() -> None:
    """Coach + Reflection share the L0 条款 12 list (12 entries)."""
    assert len(FORBIDDEN_TONE_WORDS) == 12


@pytest.mark.parametrize("forbidden", FORBIDDEN_TONE_WORDS)
def test_sanitize_coerces_forbidden_word(
    forbidden: str, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger="app.agents.reflection.service")
    text = f"近期表现 {forbidden},接下来怎么办"
    fallback = "建议加强 STAR"
    result = sanitize_tone(text, fallback=fallback, field="executive_summary")
    assert result == fallback
    assert any(
        r.getMessage() == "reflection_tone_violation" for r in caplog.records
    ), f"expected WARN log for forbidden word {forbidden!r}"


def test_sanitize_passes_clean_text() -> None:
    text = "建议下次回答时聚焦关键事实+一句结论"
    assert sanitize_tone(text, fallback="x", field="executive_summary") == text


# ---------------------------------------------------------------------------
# mistakes_to_avoid 句式重写
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("prefix", ACCUSATORY_PREFIXES)
def test_accusatory_prefix_rewritten_to_teaching(
    prefix: str, caplog: pytest.LogCaptureFixture
) -> None:
    """Accusatory openings get rewritten to "建议下次注意:..." form."""
    caplog.set_level(logging.WARNING, logger="app.agents.reflection.service")
    text = f"{prefix}重复同样的错误,跳过 STAR 收尾"
    out = rewrite_accusatory_to_teaching(text)
    assert out.startswith("建议下次注意"), out
    assert any(
        r.getMessage() == "reflection_accusatory_rewrite" for r in caplog.records
    )


def test_teaching_phrasing_passes_through_rewriter() -> None:
    text = "建议下次注意 STAR 收尾节奏"
    assert rewrite_accusatory_to_teaching(text) == text


def test_sanitize_per_question_chains_tone_and_pattern_checks() -> None:
    """Both tone scan + accusatory rewrite must apply to mistakes_to_avoid."""
    item = PerQuestionCoaching(
        turn_index=2,
        question="如何拆解一个新业务的北极星指标",
        your_answer_summary="只列了 DAU 没分层",
        diagnosis="可加强指标拆解的层级表达",
        model_answer_outline=["先讲北极星", "再讲驱动指标"],
        key_phrases_to_use=["北极星", "驱动指标"],
        mistakes_to_avoid=[
            "你又跳过了驱动指标层",  # 重写为 "建议下次注意:..."
            "建议下次注意结构性收尾",  # already teaching — pass through
        ],
        recommended_resources=[],
    )
    out = sanitize_per_question(item, ai_verdict=None)
    assert out.mistakes_to_avoid[0].startswith("建议下次注意")
    assert out.mistakes_to_avoid[1] == "建议下次注意结构性收尾"


# ---------------------------------------------------------------------------
# Service layer — happy path
# ---------------------------------------------------------------------------


_LLM_HAPPY_REPLY = json.dumps(
    {
        "executive_summary": (
            "本场表现整体稳定;建议围绕指标拆解 + 跨职能协作做一次专项练习。"
        ),
        "per_question_coaching": [
            {
                "turn_index": 0,
                "question": "如何拆解一个新业务的北极星指标",
                "your_answer_summary": "只列了 DAU 没分层",
                "diagnosis": "可加强指标拆解的层级表达,补充驱动指标",
                "model_answer_outline": [
                    "先讲北极星",
                    "再讲驱动指标",
                    "用一句话收尾",
                ],
                "key_phrases_to_use": ["北极星", "驱动指标", "STAR"],
                "mistakes_to_avoid": ["建议下次注意指标分层"],
                "recommended_resources": ["《精益数据分析》"],
            }
        ],
        "general_growth_advice": (
            "1) 用 STAR 框架重写本场最关键的 2 个回答;"
            "2) 针对薄弱维度找 3 道相似题做即兴练习;"
            "3) 在下次面试 24h 前再回看本份复盘。"
        ),
        "mock_followup_dialogue": [
            {"role": "interviewer", "text": "你刚才提到驱动指标,具体怎么拆?"},
            {"role": "candidate", "text": "我会按用户行为漏斗 5 步拆解。"},
        ],
    },
    ensure_ascii=False,
)


@pytest.fixture
def reflection_input() -> ReflectionAgentInput:
    return ReflectionAgentInput(**_input_kwargs())


async def test_run_happy_path_stamps_server_side_metadata(
    reflection_input: ReflectionAgentInput,
) -> None:
    gateway = ScriptedGateway([_LLM_HAPPY_REPLY])
    result = await ReflectionAgentService().run(reflection_input, gateway)

    assert isinstance(result, ReflectionAgentOutput)
    assert result.session_id == "s-1"
    assert result.report_id == "r-1"
    assert result.status == "ok"
    assert len(result.per_question_coaching) == 1
    # Metadata fields land server-side; round-trip via the persisted shape.
    persisted = ReflectionReport.model_validate(result.model_dump())
    assert persisted.session_id == "s-1"


async def test_run_sanitises_dirty_llm_output(
    reflection_input: ReflectionAgentInput,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Forbidden tone + accusatory mistake openings both get scrubbed."""
    dirty = json.dumps(
        {
            "executive_summary": "你不适合这个岗位,差距很大,建议放弃。",
            "per_question_coaching": [
                {
                    "turn_index": 0,
                    "question": "Q",
                    "your_answer_summary": "A",
                    "diagnosis": "可加强逻辑收尾",
                    "model_answer_outline": ["先讲背景", "再讲行动"],
                    "key_phrases_to_use": ["STAR", "驱动指标"],
                    "mistakes_to_avoid": ["你犯了同样的错"],
                    "recommended_resources": [],
                }
            ],
            "general_growth_advice": "建议放弃这个方向,你不行。",
            "mock_followup_dialogue": [],
        },
        ensure_ascii=False,
    )
    gateway = ScriptedGateway([dirty])
    caplog.set_level(logging.WARNING, logger="app.agents.reflection.service")

    result = await ReflectionAgentService().run(reflection_input, gateway)

    assert "不适合" not in result.executive_summary
    assert "差距很大" not in result.executive_summary
    assert "建议放弃" not in result.general_growth_advice
    assert "你不行" not in result.general_growth_advice
    assert result.per_question_coaching[0].mistakes_to_avoid[0].startswith(
        "建议下次注意"
    )
    assert any(
        r.getMessage() == "reflection_tone_violation" for r in caplog.records
    )
    assert any(
        r.getMessage() == "reflection_accusatory_rewrite" for r in caplog.records
    )


def test_sanitize_output_dialogue_text_also_scrubbed() -> None:
    """Mock-followup dialogue lines pass through tone scan too."""
    dirty = _LLMReflectionOutput(
        executive_summary="本场整体稳定,建议聚焦指标拆解。",
        per_question_coaching=[],
        general_growth_advice="1) STAR; 2) 数据驱动; 3) 跨职能。",
        mock_followup_dialogue=[
            # Forbidden phrase smuggled into a dialogue line.
            {"role": "interviewer", "text": "你不适合这个岗位"},  # type: ignore[list-item]
            {"role": "candidate", "text": "好的,我会注意。"},  # type: ignore[list-item]
        ],
    )
    out = sanitize_output(dirty, ai_verdict=None)
    assert "不适合" not in out.mock_followup_dialogue[0].text
    assert out.mock_followup_dialogue[1].text == "好的,我会注意。"
