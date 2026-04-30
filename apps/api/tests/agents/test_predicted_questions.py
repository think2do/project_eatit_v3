"""V32.M2.3.3 — PredictedQuestionBank schema + interviewer extraction tests (F-321).

Schema layer:
  * 8-15 questions (min/max validators)
  * 4 category enum
  * 3 source enum, min_length=1
  * field length caps on question/why_likely/related_evidence

Service layer:
  * InterviewerAgentService._extract_predicted_questions handles missing,
    null, malformed, and well-formed framework_json.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.agents.framework.schemas import (
    FrameworkAgentOutput,
    PredictedQuestion,
    PredictedQuestionBank,
)
from app.agents.interviewer.service import _extract_predicted_questions


def _make_question(i: int, category: str = "general-pm") -> PredictedQuestion:
    return PredictedQuestion(
        category=category,  # type: ignore[arg-type]
        question=f"问题 {i}",
        why_likely="证据充分",
        related_evidence=f"项目 {i} 上线指标",
    )


# ---------------------------------------------------------------------------
# PredictedQuestionBank schema
# ---------------------------------------------------------------------------


def test_bank_min_8_questions() -> None:
    with pytest.raises(ValidationError, match="at least 8"):
        PredictedQuestionBank(
            questions=[_make_question(i) for i in range(7)],
            generated_at=datetime.now(timezone.utc),
            sources=["jd"],
        )


def test_bank_max_15_questions() -> None:
    with pytest.raises(ValidationError, match="at most 15"):
        PredictedQuestionBank(
            questions=[_make_question(i) for i in range(16)],
            generated_at=datetime.now(timezone.utc),
            sources=["jd"],
        )


@pytest.mark.parametrize("n", [8, 12, 15])
def test_bank_accepts_valid_count(n: int) -> None:
    bank = PredictedQuestionBank(
        questions=[_make_question(i) for i in range(n)],
        generated_at=datetime.now(timezone.utc),
        sources=["jd", "resume"],
    )
    assert len(bank.questions) == n


def test_bank_requires_at_least_one_source() -> None:
    with pytest.raises(ValidationError, match="at least 1"):
        PredictedQuestionBank(
            questions=[_make_question(i) for i in range(8)],
            generated_at=datetime.now(timezone.utc),
            sources=[],
        )


def test_bank_rejects_alien_source() -> None:
    with pytest.raises(ValidationError):
        PredictedQuestionBank(
            questions=[_make_question(i) for i in range(8)],
            generated_at=datetime.now(timezone.utc),
            sources=["linkedin"],  # type: ignore[list-item]
        )


@pytest.mark.parametrize(
    "category",
    [
        "company-business",
        "industry-judgment",
        "project-deepdive",
        "general-pm",
    ],
)
def test_question_accepts_all_4_categories(category: str) -> None:
    q = _make_question(0, category=category)
    assert q.category == category


def test_question_rejects_alien_category() -> None:
    with pytest.raises(ValidationError):
        PredictedQuestion(
            category="behavioral",  # type: ignore[arg-type]
            question="x",
            why_likely="y",
            related_evidence="z",
        )


def test_question_max_length_caps() -> None:
    with pytest.raises(ValidationError, match="at most"):
        PredictedQuestion(
            category="general-pm",
            question="x" * 201,
            why_likely="y",
            related_evidence="z",
        )
    with pytest.raises(ValidationError, match="at most"):
        PredictedQuestion(
            category="general-pm",
            question="x",
            why_likely="y" * 81,
            related_evidence="z",
        )
    with pytest.raises(ValidationError, match="at most"):
        PredictedQuestion(
            category="general-pm",
            question="x",
            why_likely="y",
            related_evidence="z" * 121,
        )


# ---------------------------------------------------------------------------
# FrameworkAgentOutput integration
# ---------------------------------------------------------------------------


def test_framework_output_predicted_questions_optional() -> None:
    """Bank is optional; null is the M2.3.4-not-yet-wired path."""
    out = FrameworkAgentOutput(
        direction="hybrid",
        focus_competencies=[],
        opening_questions=[],
        deep_dive_anchors=[],
        pace_plan={"total_minutes": 30, "segments": []},  # type: ignore[arg-type]
    )
    assert out.predicted_questions is None


def test_framework_output_with_predicted_bank_round_trips() -> None:
    bank = PredictedQuestionBank(
        questions=[_make_question(i) for i in range(8)],
        generated_at=datetime.now(timezone.utc),
        sources=["resume", "research"],
    )
    out = FrameworkAgentOutput(
        direction="hybrid",
        focus_competencies=[],
        opening_questions=[],
        deep_dive_anchors=[],
        pace_plan={"total_minutes": 30, "segments": []},  # type: ignore[arg-type]
        predicted_questions=bank,
    )
    encoded = out.model_dump_json()
    decoded = FrameworkAgentOutput.model_validate_json(encoded)
    assert decoded.predicted_questions is not None
    assert len(decoded.predicted_questions.questions) == 8
    assert "research" in decoded.predicted_questions.sources


# ---------------------------------------------------------------------------
# _extract_predicted_questions — interviewer service helper
# ---------------------------------------------------------------------------


def test_extract_returns_empty_for_unparseable_framework_json() -> None:
    assert _extract_predicted_questions("not-json") == []
    assert _extract_predicted_questions("") == []


def test_extract_returns_empty_when_no_predicted_questions_key() -> None:
    fw = json.dumps({"direction": "hybrid", "focus_competencies": []})
    assert _extract_predicted_questions(fw) == []


def test_extract_returns_empty_when_predicted_questions_null() -> None:
    fw = json.dumps({"direction": "hybrid", "predicted_questions": None})
    assert _extract_predicted_questions(fw) == []


def test_extract_returns_questions_list_when_well_formed() -> None:
    questions = [
        {
            "category": "project-deepdive",
            "question": "为什么选这个指标?",
            "why_likely": "项目里有量化",
            "related_evidence": "项目 A 的留存提升",
        },
        {
            "category": "industry-judgment",
            "question": "这个行业的痛点是什么?",
            "why_likely": "JD 强调行业理解",
            "related_evidence": "JD 第 3 条",
        },
    ]
    fw = json.dumps(
        {
            "direction": "hybrid",
            "predicted_questions": {
                "questions": questions,
                "generated_at": "2026-04-30T12:00:00+00:00",
                "sources": ["resume", "research"],
            },
        }
    )
    extracted = _extract_predicted_questions(fw)
    assert len(extracted) == 2
    assert extracted[0]["category"] == "project-deepdive"
    assert extracted[1]["question"] == "这个行业的痛点是什么?"


def test_extract_filters_out_non_dict_question_entries() -> None:
    """Defensive: a malformed entry shouldn't poison the whole list."""
    fw = json.dumps(
        {
            "predicted_questions": {
                "questions": [
                    {
                        "category": "general-pm",
                        "question": "ok",
                        "why_likely": "y",
                        "related_evidence": "z",
                    },
                    "bad-string-entry",
                    None,
                ],
                "generated_at": "2026-04-30T12:00:00+00:00",
                "sources": ["jd"],
            }
        }
    )
    extracted = _extract_predicted_questions(fw)
    assert len(extracted) == 1
    assert extracted[0]["question"] == "ok"
