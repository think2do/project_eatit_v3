"""F-319 V32.M1.4 — InterviewerAgentOutput.followup_hints contract tests.

The chip row is either empty (graceful degradation when the LLM
fails to comply) or 2–3 items, each ≤ 8 chars. Anything in between
(1 item, 4+ items, or any item > 8 chars) is rejected so the UI can
treat `followup_hints.length` as a binary "show row / hide row"
signal.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.agents.interviewer.schemas import InterviewerAgentOutput


# Minimum legal payload for the surrounding required fields. Each test
# spreads `**VALID_BASE` and overrides `followup_hints` only.
VALID_BASE: dict = {
    "question": "你最近一次主导上线是什么项目?",
    "intent": "深挖项目背景",
    "expected_depth": "tactical",
}


def test_empty_hints_is_ok_for_degradation() -> None:
    """`followup_hints=[]` is the documented LLM-failure escape hatch."""
    out = InterviewerAgentOutput(**VALID_BASE, followup_hints=[])
    assert out.followup_hints == []


def test_two_hints_ok() -> None:
    out = InterviewerAgentOutput(**VALID_BASE, followup_hints=["指标", "用户"])
    assert len(out.followup_hints) == 2


def test_three_hints_ok() -> None:
    out = InterviewerAgentOutput(
        **VALID_BASE, followup_hints=["指标", "用户", "成本"]
    )
    assert len(out.followup_hints) == 3


def test_one_hint_fails() -> None:
    with pytest.raises(ValidationError) as ei:
        InterviewerAgentOutput(**VALID_BASE, followup_hints=["指标"])
    assert "must be empty" in str(ei.value) or "got 1" in str(ei.value)


def test_four_hints_fails() -> None:
    with pytest.raises(ValidationError):
        InterviewerAgentOutput(
            **VALID_BASE, followup_hints=["a", "b", "c", "d"]
        )


def test_hint_over_8_chars_fails() -> None:
    """A 9-char hint must surface a clear "exceeds 8 chars" error."""
    with pytest.raises(ValidationError) as ei:
        InterviewerAgentOutput(
            **VALID_BASE,
            followup_hints=["指标", "超过八个字的追问线索"],
        )
    assert "exceeds 8 chars" in str(ei.value)


def test_hint_at_exactly_8_chars_ok() -> None:
    """Boundary: a hint of exactly 8 chars passes."""
    out = InterviewerAgentOutput(
        **VALID_BASE,
        followup_hints=["指标", "12345678"],
    )
    assert out.followup_hints[1] == "12345678"


def test_default_followup_hints_is_empty_list() -> None:
    """Omitting the field entirely yields the empty-list default."""
    out = InterviewerAgentOutput(**VALID_BASE)
    assert out.followup_hints == []
