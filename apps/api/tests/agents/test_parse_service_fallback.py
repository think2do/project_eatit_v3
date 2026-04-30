"""Integration tests for ParseAgentService fallback paths (V32.M2.2.X audit fix).

The service has two server-side guards that fire when the LLM returns
under-specified output:

  1. `_derive_match_score(advantages_n, gaps_n)` — invoked when the LLM
     omits `match_score`. Maps the (advantages-gaps) delta onto a
     deterministic MID/LOW band.
  2. `_DEFAULT_INTERVIEW_FOCUS` — invoked when `interview_focus` has fewer
     than 2 items, so the front-end FocusCards row never collapses to nothing.

Both paths previously had zero coverage; this file exercises them through
the real `ParseAgentService.run` against a `ScriptedGateway`.
"""
from __future__ import annotations

import json

import pytest

from app.agents.parse.schemas import ParseAgentInput
from app.agents.parse.service import ParseAgentService
from tests.agents._fakes import ScriptedGateway


@pytest.fixture
def agent_input() -> ParseAgentInput:
    return ParseAgentInput(resume_text="候选人简历", jd_text="岗位描述")


def _payload_without_match_score(advantages_n: int, gaps_n: int) -> str:
    """Build a parse payload that the LLM would return WITHOUT a match_score field."""
    return json.dumps(
        {
            "match_summary": "候选人整体匹配但量化欠缺",
            "match_advantages": [
                {"label": f"优势{i}", "tag": "匹配", "evidence": "证据"}
                for i in range(advantages_n)
            ],
            "gaps": [
                {"label": f"差距{i}", "tag": "需补充", "evidence": "证据"}
                for i in range(gaps_n)
            ],
            "interview_focus": [
                {
                    "direction_id": "ai-insight",
                    "priority": "high",
                    "title": "AI 洞察",
                    "description": "考察对 AI 趋势的判断与边界感。",
                },
                {
                    "direction_id": "data-driven",
                    "priority": "mid",
                    "title": "数据驱动",
                    "description": "指标体系、AB 实验、归因。",
                },
            ],
        }
    )


def _payload_with_empty_focus() -> str:
    """Build a parse payload where interview_focus is empty (LLM gave up)."""
    return json.dumps(
        {
            "match_summary": "候选人整体匹配",
            "match_score": {
                "score": 70,
                "level": "MID",
                "one_line": "整体匹配,部分维度需深挖",
            },
            "match_advantages": [
                {"label": "结果导向", "tag": "匹配", "evidence": "项目有量化"}
            ],
            "gaps": [],
            "interview_focus": [],
        }
    )


async def test_service_fallback_derives_match_score_when_llm_omits(
    agent_input: ParseAgentInput,
) -> None:
    # delta = advantages(3) - gaps(0) = 3 -> _derive returns score=65/MID
    gateway = ScriptedGateway([_payload_without_match_score(advantages_n=3, gaps_n=0)])

    result = await ParseAgentService().run(agent_input, gateway)

    assert result.match_score is not None
    assert result.match_score.score == 65
    assert result.match_score.level == "MID"
    assert "自动估算" in result.match_score.one_line


async def test_service_fallback_derives_low_when_gaps_dominate(
    agent_input: ParseAgentInput,
) -> None:
    # delta = advantages(1) - gaps(3) = -2 -> _derive returns score=40/LOW
    gateway = ScriptedGateway([_payload_without_match_score(advantages_n=1, gaps_n=3)])

    result = await ParseAgentService().run(agent_input, gateway)

    assert result.match_score is not None
    assert result.match_score.score == 40
    assert result.match_score.level == "LOW"


async def test_service_fallback_replaces_empty_interview_focus(
    agent_input: ParseAgentInput,
) -> None:
    gateway = ScriptedGateway([_payload_with_empty_focus()])

    result = await ParseAgentService().run(agent_input, gateway)

    # _DEFAULT_INTERVIEW_FOCUS provides exactly 2 items so FocusCards row never empty.
    assert len(result.interview_focus) == 2
    direction_ids = [f.direction_id for f in result.interview_focus]
    assert direction_ids == ["cross-func", "zero-to-one"]
    # Each fallback focus must still satisfy the schema constraints (priority + title len).
    assert result.interview_focus[0].priority == "high"
    assert result.interview_focus[1].priority == "mid"
