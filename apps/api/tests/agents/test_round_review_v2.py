"""F-313 V32.M1.3 — RoundReviewV2 contract tests.

Per-question review surfaced in the report's "逐题复盘" card. Score is
0–100; tone is one of {good, ok, warn} (independent label, not derived
from score). The legacy `RoundReview` schema is left untouched for L0
back-compat — this is a parallel structure, not a replacement.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.reports import RoundReviewV2


@pytest.mark.parametrize(
    "score,tone",
    [
        (0, "warn"),
        (50, "ok"),
        (75, "ok"),
        (80, "good"),
        (100, "good"),
    ],
)
def test_round_review_v2_valid(score: int, tone: str) -> None:
    rv = RoundReviewV2(
        turn_index=1,
        question_tag="项目深挖",
        question_text="你怎么选北极星指标?",
        score=score,
        tone=tone,  # type: ignore[arg-type]
        answer_summary="选了完成率作为主要指标,辅以人均时长。",
        ai_feedback="结构清晰,可以再补充反指标的设置。",
    )
    assert rv.score == score
    assert rv.tone == tone


def test_round_review_v2_invalid_tone() -> None:
    with pytest.raises(ValidationError):
        RoundReviewV2(
            turn_index=1,
            question_tag="x",
            question_text="y",
            score=80,
            tone="bad",  # type: ignore[arg-type]
            answer_summary="a",
            ai_feedback="b",
        )


@pytest.mark.parametrize("score", [-1, 101])
def test_round_review_v2_score_out_of_range(score: int) -> None:
    with pytest.raises(ValidationError):
        RoundReviewV2(
            turn_index=1,
            question_tag="x",
            question_text="y",
            score=score,
            tone="good",
            answer_summary="a",
            ai_feedback="b",
        )


def test_round_review_v2_required_fields() -> None:
    """All seven fields are required — there's no sensible default for
    any of them."""
    with pytest.raises(ValidationError):
        RoundReviewV2(  # type: ignore[call-arg]
            turn_index=1,
            question_tag="x",
            question_text="y",
            score=80,
            tone="good",
            answer_summary="a",
            # ai_feedback omitted
        )
