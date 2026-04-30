"""Boundary tests for v3.2 ParseResult schema extensions (F-301).

Locks: match_score range/level, direction_id 6-enum, advantages/gaps cap,
interview_focus cap, tag literals, and legacy field retention (L0 A10).
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.parse import (
    Gap,
    InterviewFocus,
    MatchAdvantage,
    MatchScore,
    ParseResultPayload,
    ProjectHookV32,
)


# ---------------------------------------------------------------------------
# match_score
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "score,level",
    [
        (0, "LOW"),
        (59, "LOW"),
        (60, "MID"),
        (75, "MID"),
        (76, "HIGH"),
        (100, "HIGH"),
    ],
)
def test_match_score_level_alignment(score: int, level: str) -> None:
    """level 与 score 区间对齐(<60 LOW / 60-75 MID / >=76 HIGH)."""
    ms = MatchScore(score=score, level=level, one_line="一句解读")
    assert ms.level == level
    assert ms.score == score


@pytest.mark.parametrize("invalid", [-1, 101])
def test_match_score_out_of_range_rejected(invalid: int) -> None:
    with pytest.raises(ValidationError):
        MatchScore(score=invalid, level="LOW", one_line="x")


def test_match_score_one_line_max_length() -> None:
    with pytest.raises(ValidationError, match="at most"):
        MatchScore(score=70, level="MID", one_line="x" * 81)


@pytest.mark.parametrize(
    "score,level",
    [
        # score in LOW band but mislabelled
        (10, "HIGH"),
        (10, "MID"),
        (59, "MID"),
        (59, "HIGH"),
        # score in MID band but mislabelled
        (60, "LOW"),
        (60, "HIGH"),
        (75, "LOW"),
        (75, "HIGH"),
        # score in HIGH band but mislabelled
        (76, "LOW"),
        (76, "MID"),
        (90, "LOW"),
        (100, "MID"),
    ],
)
def test_match_score_alien_level_rejected(score: int, level: str) -> None:
    """Cross-field validator rejects score/level mismatches that the UI would render as garbage."""
    with pytest.raises(ValidationError, match="must be"):
        MatchScore(score=score, level=level, one_line="一句解读")


# ---------------------------------------------------------------------------
# interview_focus / direction_id
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "did",
    [
        "ai-insight",
        "data-driven",
        "cross-func",
        "zero-to-one",
        "user-research",
        "strategy",
    ],
)
def test_interview_focus_direction_id_valid(did: str) -> None:
    f = InterviewFocus(direction_id=did, priority="high", title="t", description="d")
    assert f.direction_id == did


def test_interview_focus_alien_direction_id_rejected() -> None:
    with pytest.raises(ValidationError):
        InterviewFocus(
            direction_id="legacy_role_match",  # type: ignore[arg-type]
            priority="high",
            title="t",
            description="d",
        )


def test_interview_focus_3_items_ok() -> None:
    payload = ParseResultPayload(
        interview_focus=[
            InterviewFocus(direction_id="ai-insight", priority="high", title="t", description="d"),
            InterviewFocus(direction_id="data-driven", priority="mid", title="t", description="d"),
            InterviewFocus(direction_id="cross-func", priority="low", title="t", description="d"),
        ],
    )
    assert len(payload.interview_focus) == 3


def test_interview_focus_4_items_rejected() -> None:
    with pytest.raises(ValidationError, match="at most"):
        ParseResultPayload(
            interview_focus=[
                InterviewFocus(direction_id=did, priority="mid", title="t", description="d")
                for did in [
                    "ai-insight",
                    "data-driven",
                    "cross-func",
                    "zero-to-one",
                ]
            ],
        )


# ---------------------------------------------------------------------------
# advantages / gaps caps & tag literals
# ---------------------------------------------------------------------------


def test_advantages_5_max_ok() -> None:
    payload = ParseResultPayload(
        match_advantages=[
            MatchAdvantage(label=f"l{i}", tag="匹配", evidence="e") for i in range(5)
        ]
    )
    assert len(payload.match_advantages) == 5


def test_advantages_6_rejected() -> None:
    with pytest.raises(ValidationError, match="at most"):
        ParseResultPayload(
            match_advantages=[
                MatchAdvantage(label=f"l{i}", tag="匹配", evidence="e") for i in range(6)
            ]
        )


def test_gaps_5_max_ok() -> None:
    payload = ParseResultPayload(
        gaps=[Gap(label=f"l{i}", tag="需补充", evidence="e") for i in range(5)]
    )
    assert len(payload.gaps) == 5


def test_gaps_6_rejected() -> None:
    with pytest.raises(ValidationError, match="at most"):
        ParseResultPayload(
            gaps=[Gap(label=f"l{i}", tag="需补充", evidence="e") for i in range(6)]
        )


def test_match_advantage_alien_tag_rejected() -> None:
    with pytest.raises(ValidationError):
        MatchAdvantage(label="x", tag="一般", evidence="y")  # type: ignore[arg-type]


def test_gap_alien_tag_rejected() -> None:
    with pytest.raises(ValidationError):
        Gap(label="x", tag="不行", evidence="y")  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# project_hooks_v32 (1-2 items)
# ---------------------------------------------------------------------------


def test_project_hooks_v32_2_items_ok() -> None:
    payload = ParseResultPayload(
        project_hooks_v32=[
            ProjectHookV32(name="项目A", why="主打项目"),
            ProjectHookV32(name="项目B", why="次要项目"),
        ],
    )
    assert len(payload.project_hooks_v32) == 2


def test_project_hooks_v32_3_items_rejected() -> None:
    with pytest.raises(ValidationError, match="at most"):
        ParseResultPayload(
            project_hooks_v32=[
                ProjectHookV32(name=f"p{i}", why="w") for i in range(3)
            ],
        )


# ---------------------------------------------------------------------------
# Legacy retention (L0 A10) — must keep all v3.1 fields by name
# ---------------------------------------------------------------------------


def test_legacy_fields_retained() -> None:
    fields = ParseResultPayload.model_fields
    assert "match_summary" in fields
    assert "job_requirements" in fields
    assert "candidate_highlights" in fields
    assert "candidate_risks" in fields
    assert "project_hooks" in fields


def test_legacy_payload_still_constructs() -> None:
    """A v3.1-shaped payload (no v3.2 fields) must still be a valid ParseResultPayload."""
    payload = ParseResultPayload(match_summary="候选人整体匹配度中上")
    assert payload.match_summary == "候选人整体匹配度中上"
    assert payload.match_score is None
    assert payload.match_advantages == []
    assert payload.interview_focus == []


# ---------------------------------------------------------------------------
# profile_summary length cap
# ---------------------------------------------------------------------------


def test_profile_summary_300_ok() -> None:
    payload = ParseResultPayload(profile_summary="x" * 300)
    assert payload.profile_summary is not None and len(payload.profile_summary) == 300


def test_profile_summary_301_rejected() -> None:
    with pytest.raises(ValidationError, match="at most"):
        ParseResultPayload(profile_summary="x" * 301)


# ---------------------------------------------------------------------------
# M2.3.X audit-fix: jd_* fields (F-320)
# ---------------------------------------------------------------------------


def test_jd_fields_default_none_and_empty() -> None:
    """All three jd_* fields are optional — Parse Agent may legit return them None."""
    payload = ParseResultPayload()
    assert payload.jd_company_name is None
    assert payload.jd_role_title is None
    assert payload.jd_industry_hints == []


def test_jd_company_name_max_length() -> None:
    with pytest.raises(ValidationError, match="at most"):
        ParseResultPayload(jd_company_name="x" * 81)


def test_jd_role_title_max_length() -> None:
    with pytest.raises(ValidationError, match="at most"):
        ParseResultPayload(jd_role_title="r" * 81)


def test_jd_industry_hints_5_ok_6_rejected() -> None:
    payload = ParseResultPayload(jd_industry_hints=["a", "b", "c", "d", "e"])
    assert len(payload.jd_industry_hints) == 5
    with pytest.raises(ValidationError, match="at most"):
        ParseResultPayload(jd_industry_hints=["a"] * 6)


def test_jd_fields_round_trip_through_parse_payload() -> None:
    """jd_* fields survive ParseResultPayload round-trip via JSON."""
    payload = ParseResultPayload(
        jd_company_name="OpenAI",
        jd_role_title="Senior PM",
        jd_industry_hints=["LLM", "AI infra"],
    )
    encoded = payload.model_dump_json()
    decoded = ParseResultPayload.model_validate_json(encoded)
    assert decoded.jd_company_name == "OpenAI"
    assert decoded.jd_role_title == "Senior PM"
    assert decoded.jd_industry_hints == ["LLM", "AI infra"]
