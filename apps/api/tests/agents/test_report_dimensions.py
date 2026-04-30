"""F-312 V32.M1.3 — five-dimension scorecard contract tests.

The five dimension names (专业深度 / 结构化表达 / 批判性思考 / 业务直觉 /
沟通节奏) are an A8 L0 red line. These tests run on every CI invocation
and trip on any rename, score-range slip, or `normalize_dimensions`
fallback regression.
"""

from __future__ import annotations

import logging

import pytest
from pydantic import ValidationError

from app.domain.reports.service import (
    DEFAULT_DIMENSION_NAMES,
    normalize_dimensions,
)
from app.schemas.reports import Chip, DimensionScore


def _chip(text: str = "a", good: bool = True) -> Chip:
    return Chip(text=text, good=good)


def test_dimension_name_strict() -> None:
    """A8: a known dimension name passes Pydantic Literal validation."""
    valid = DimensionScore(
        name="专业深度",
        description="对核心问题的认知深度",
        score=80,
        evidence_chips=[_chip()],
    )
    assert valid.name == "专业深度"


def test_alien_dimension_name_rejected() -> None:
    """Any other dimension name (including a near-synonym) must fail."""
    with pytest.raises(ValidationError):
        DimensionScore(
            name="逻辑清晰度",  # type: ignore[arg-type]  # not in Literal
            description="x",
            score=80,
            evidence_chips=[_chip()],
        )


def test_score_boundary_0_and_100() -> None:
    for s in (0, 100):
        d = DimensionScore(
            name="专业深度",
            description="x",
            score=s,
            evidence_chips=[_chip()],
        )
        assert d.score == s


def test_score_out_of_range_fails() -> None:
    for s in (-1, 101):
        with pytest.raises(ValidationError):
            DimensionScore(
                name="专业深度",
                description="x",
                score=s,
                evidence_chips=[_chip()],
            )


def test_evidence_chips_min_length_enforced() -> None:
    """A DimensionScore must carry at least one chip."""
    with pytest.raises(ValidationError):
        DimensionScore(
            name="专业深度",
            description="x",
            score=80,
            evidence_chips=[],
        )


def test_evidence_chips_max_length_enforced() -> None:
    """No more than 6 chips per dimension."""
    too_many = [_chip(text=str(i)) for i in range(7)]
    with pytest.raises(ValidationError):
        DimensionScore(
            name="专业深度",
            description="x",
            score=80,
            evidence_chips=too_many,
        )


def test_chip_text_max_length_20() -> None:
    """Chip.text is bounded at 20 chars so the pill renders single-line."""
    with pytest.raises(ValidationError):
        Chip(text="x" * 21, good=True)


def test_normalize_dimensions_pads_missing(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """LLM emits 4 of 5; normalize fills the gap with 50 + WARN."""
    caplog.set_level(logging.WARNING, logger="app.domain.reports.service")
    partial = [
        DimensionScore(
            name="专业深度", description="x", score=80,
            evidence_chips=[_chip()],
        ),
        DimensionScore(
            name="结构化表达", description="x", score=75,
            evidence_chips=[_chip()],
        ),
        DimensionScore(
            name="批判性思考", description="x", score=65,
            evidence_chips=[_chip()],
        ),
        DimensionScore(
            name="业务直觉", description="x", score=70,
            evidence_chips=[_chip()],
        ),
        # 沟通节奏 missing
    ]
    normalized = normalize_dimensions(partial)
    assert len(normalized) == 5

    # Order is preserved per DEFAULT_DIMENSION_NAMES.
    assert [d.name for d in normalized] == list(DEFAULT_DIMENSION_NAMES)

    last = next(d for d in normalized if d.name == "沟通节奏")
    assert last.score == 50
    assert last.description == "评分异常,默认中性"
    assert last.evidence_chips[0].text == "数据不足"
    assert last.evidence_chips[0].good is False

    assert any("missing" in r.message for r in caplog.records)


def test_normalize_dimensions_reorders_to_canonical() -> None:
    """LLM may emit dimensions in any order; normalize preserves the
    A8 canonical order regardless."""
    shuffled = [
        DimensionScore(name=name, description="x", score=70,
                       evidence_chips=[_chip()])
        for name in (
            "沟通节奏",
            "业务直觉",
            "批判性思考",
            "结构化表达",
            "专业深度",
        )
    ]
    normalized = normalize_dimensions(shuffled)
    assert [d.name for d in normalized] == list(DEFAULT_DIMENSION_NAMES)


def test_normalize_dimensions_pads_all_five_when_input_partial() -> None:
    """Edge case: empty raw list (caller's responsibility to guard
    upstream, but normalize itself returns 5 default-50 rows so we can
    surface the failure mode rather than crash)."""
    normalized = normalize_dimensions([])
    assert len(normalized) == 5
    assert all(d.score == 50 for d in normalized)
    assert all(d.description == "评分异常,默认中性" for d in normalized)


def test_default_dimension_names_match_constraint_doc() -> None:
    """The DEFAULT_DIMENSION_NAMES tuple must match the A8 lock exactly."""
    assert DEFAULT_DIMENSION_NAMES == (
        "专业深度",
        "结构化表达",
        "批判性思考",
        "业务直觉",
        "沟通节奏",
    )
