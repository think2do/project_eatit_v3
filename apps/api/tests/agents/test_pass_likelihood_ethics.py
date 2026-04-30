"""F-314 L0 ethical guardrail: pass_likelihood fuzz.

Every `pass_likelihood` value must end up as one of {"中上", "中", "中下"}
before it leaves the service layer. LLMs occasionally produce 不建议 /
不通过 / "low" / numeric / etc. — these must be force-coerced and a WARN
log raised. See `app.domain.reports.service.coerce_pass_likelihood`.
"""

from __future__ import annotations

import logging

import pytest

from app.domain.reports.service import (
    coerce_pass_likelihood,
    derive_pass_likelihood,
)


# 12 禁止词,与 v32-p0-constraints.md §A5 红线条款逐字对齐。
FORBIDDEN_VALUES: list[str] = [
    "不建议",
    "不通过",
    "不合格",
    "淘汰",
    "不推荐",
    "建议放弃",
    "不适合",
    "低",
    "差",
    "非常低",
    "reject",
    "no",
]


@pytest.mark.parametrize("forbidden", FORBIDDEN_VALUES)
def test_forbidden_pass_likelihood_coerces_to_zhongxia(
    forbidden: str, caplog: pytest.LogCaptureFixture
) -> None:
    """Every L0-forbidden string must coerce to 中下 + emit a WARN log."""
    caplog.set_level(logging.WARNING, logger="app.domain.reports.service")
    result = coerce_pass_likelihood(forbidden, overall_score=50, match_score=55)
    assert result == "中下"
    assert any("illegal value" in r.message for r in caplog.records), (
        f"expected WARN log for forbidden value {forbidden!r}, got {caplog.records!r}"
    )


@pytest.mark.parametrize(
    "valid,expected",
    [("中上", "中上"), ("中", "中"), ("中下", "中下")],
)
def test_valid_passes_through(valid: str, expected: str) -> None:
    """The three legal tiers pass through unchanged regardless of scores."""
    assert coerce_pass_likelihood(valid, 80, 80) == expected


def test_none_input_uses_derive() -> None:
    """When LLM omits pass_likelihood entirely, derive from scores."""
    assert coerce_pass_likelihood(None, 85, 80) == "中上"
    assert coerce_pass_likelihood(None, 70, 65) == "中"
    assert coerce_pass_likelihood(None, 30, 40) == "中下"


def test_empty_string_treated_as_illegal() -> None:
    """Empty string is not a legal tier; coerce to derive result."""
    result = coerce_pass_likelihood("", overall_score=85, match_score=80)
    assert result == "中上"


def test_numeric_like_string_coerces() -> None:
    """LLM sometimes returns "75" / "0" / "100" — illegal, must coerce."""
    assert coerce_pass_likelihood("75", overall_score=85, match_score=80) == "中上"
    assert coerce_pass_likelihood("0", overall_score=20, match_score=20) == "中下"


def test_derive_thresholds_exhaustive() -> None:
    """Boundary table for `derive_pass_likelihood`. Bottoms out at 中下,
    never produces any other tier (L0 invariant)."""
    # 中上 floor
    assert derive_pass_likelihood(80, 75) == "中上"
    # one axis short → drop to 中
    assert derive_pass_likelihood(80, 60) == "中"
    assert derive_pass_likelihood(65, 75) == "中"
    # 中 floor
    assert derive_pass_likelihood(65, 60) == "中"
    # below 中 → 中下
    assert derive_pass_likelihood(64, 75) == "中下"
    assert derive_pass_likelihood(80, 59) == "中下"
    # absolute bottom
    assert derive_pass_likelihood(0, 0) == "中下"
    assert derive_pass_likelihood(None, None) == "中下"
