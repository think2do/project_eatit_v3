"""F-307 v3.2 InterviewConfig boundary tests.

These six (plus two extra L0 tests) are the headline acceptance for
V32.M1.1. Each one corresponds to one branch of the spec:
  * directions length 1 / 2 / 3 → pass
  * directions length 0 / 4 → fail
  * duration_minutes 15 / 30 / 45 → pass; 20 / 60 → fail (or coerced)
  * legacy `style` value → auto-upgrades
  * legacy `direction` value (no `directions`) → promotes
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.sessions import InterviewConfigRequest


def test_valid_directions_length_2() -> None:
    cfg = InterviewConfigRequest(
        style="structured",
        directions=["ai-insight", "data-driven"],
        duration_minutes=30,
    )
    assert len(cfg.directions) == 2


def test_directions_length_0_fails() -> None:
    with pytest.raises(ValidationError) as ei:
        InterviewConfigRequest(
            style="structured",
            directions=[],
            duration_minutes=30,
        )
    # Pydantic v2 reports `too_short` rather than the literal "min_length".
    assert "too_short" in str(ei.value) or "min_length" in str(ei.value)


def test_directions_length_4_fails() -> None:
    with pytest.raises(ValidationError) as ei:
        InterviewConfigRequest(
            style="structured",
            directions=["ai-insight", "data-driven", "cross-func", "zero-to-one"],
            duration_minutes=30,
        )
    assert "too_long" in str(ei.value) or "max_length" in str(ei.value)


def test_duration_20_minutes_coerces_to_30() -> None:
    """v3.1 default 20 min snaps up to 30 (nearest legal, ties → larger)."""
    cfg = InterviewConfigRequest(
        style="structured",
        directions=["ai-insight"],
        duration_minutes=20,
    )
    assert cfg.duration_minutes == 30


def test_duration_60_minutes_snaps_to_45() -> None:
    cfg = InterviewConfigRequest(
        style="structured",
        directions=["ai-insight"],
        duration_minutes=60,
    )
    assert cfg.duration_minutes == 45


def test_legacy_style_auto_upgrades() -> None:
    cfg = InterviewConfigRequest(
        style="standard_professional",  # v3.1 legacy enum value
        directions=["ai-insight"],
        duration_minutes=30,
    )
    assert cfg.style == "structured"


def test_legacy_direction_promotes_to_directions_list() -> None:
    """Front-end sending only `direction` (no `directions`) should still
    validate. The before-validator promotes legacy single-select to a
    one-element multi-select."""
    cfg = InterviewConfigRequest(
        style="structured",
        direction="role_match",
        directions=[],  # explicit empty so the before-validator fills
        duration_minutes=30,
    )
    assert cfg.directions == ["cross-func"]
    # Old field must still echo back for v3.1 client compat (L0).
    assert cfg.direction == "role_match"


def test_unknown_style_fails_with_literal_error() -> None:
    """Strings outside both legacy and v3.2 palettes must surface a
    Literal validation error rather than silently passing through."""
    with pytest.raises(ValidationError) as ei:
        InterviewConfigRequest(
            style="brand_new_style",
            directions=["ai-insight"],
            duration_minutes=30,
        )
    assert "structured" in str(ei.value)  # error lists legal options


def test_all_four_v32_styles_accepted() -> None:
    for style in ("structured", "pressure", "friendly", "expert"):
        cfg = InterviewConfigRequest(
            style=style,
            directions=["ai-insight"],
            duration_minutes=15,
        )
        assert cfg.style == style
