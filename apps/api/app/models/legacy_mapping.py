"""V32.M1.1 (F-307) — v3.1 → v3.2+ legacy enum mapping.

The v3.1 enums (`InterviewStyle`, `InterviewDirection`) and the old
free-form `duration_minutes` int are L0-protected: never delete the
StrEnums, never reject old session payloads. Instead, the upgrade
helpers below project legacy values onto the v3.2 palette so
in-flight requests and rehydrated DB rows still validate against
the new Pydantic schema.

Mapping rationale (single source of truth, mirrored in
`tests/migrations/test_v31_to_v32.py`):

* `friendly_guided`           → `"friendly"`
* `standard_professional`     → `"structured"`
* `high_pressure_followup`    → `"pressure"`
* `role_match`                → `"cross-func"`
* `project_deep_dive`         → `"zero-to-one"`
* `behavioral_comprehensive`  → `"cross-func"`

Duration rounding (no enum, just validation against
`InterviewDurationV32 = Literal[15, 30, 45]`): values that are
already in the legal set pass through; everything else snaps to the
nearest legal value, with ties broken by rounding up.
"""

from __future__ import annotations

from typing import Any

from app.models.enums import (
    InterviewDirection,
    InterviewDirectionV32,
    InterviewDurationV32,
    InterviewStyle,
    InterviewStyleV32,
)


STYLE_LEGACY_TO_V32: dict[str, InterviewStyleV32] = {
    InterviewStyle.FRIENDLY_GUIDED.value: "friendly",
    InterviewStyle.STANDARD_PROFESSIONAL.value: "structured",
    InterviewStyle.HIGH_PRESSURE_FOLLOWUP.value: "pressure",
}

DIRECTION_LEGACY_TO_V32: dict[str, InterviewDirectionV32] = {
    InterviewDirection.ROLE_MATCH.value: "cross-func",
    InterviewDirection.PROJECT_DEEP_DIVE.value: "zero-to-one",
    InterviewDirection.BEHAVIORAL_COMPREHENSIVE.value: "cross-func",
}

VALID_V32_STYLES: frozenset[str] = frozenset(
    {"structured", "pressure", "friendly", "expert"}
)
VALID_V32_DIRECTIONS: frozenset[str] = frozenset(
    {
        "ai-insight",
        "data-driven",
        "cross-func",
        "zero-to-one",
        "user-research",
        "strategy",
    }
)
VALID_V32_DURATIONS: frozenset[int] = frozenset({15, 30, 45, 60})


def upgrade_legacy_style(value: Any) -> Any:
    """Map a legacy v3.1 style to its v3.2 equivalent.

    No-ops on values already in the v3.2 set. Returns the input
    unchanged for unknown values so downstream Literal validation can
    surface the precise error.
    """
    if value is None:
        return None
    if isinstance(value, str) and value in STYLE_LEGACY_TO_V32:
        return STYLE_LEGACY_TO_V32[value]
    return value


def upgrade_legacy_direction(value: Any) -> Any:
    """Map a legacy v3.1 direction to its v3.2 equivalent (single value)."""
    if value is None:
        return None
    if isinstance(value, str) and value in DIRECTION_LEGACY_TO_V32:
        return DIRECTION_LEGACY_TO_V32[value]
    return value


# Intent-aware legacy duration mapping. v3.1 had {15, 20, 30} as its
# duration palette where 20 was the default mid-tier; v3.2 has
# {15, 30, 45} where 30 is the new default mid-tier. So 20 maps to 30
# (preserve the user's "default mid" intent) rather than to the
# mathematically-nearest 15. 60 (a v3.1+ extended option floated in
# AGENTS.md) snaps to 45.
LEGACY_DURATION_MAP: dict[int, int] = {
    15: 15,
    20: 30,
    30: 30,
    45: 45,
    60: 60,  # v3.2.1 — 60 is a legal v3.2 duration (深度·含 case)
}


def upgrade_legacy_duration(value: Any) -> Any:
    """Snap a legacy duration_minutes int to {15, 30, 45}.

    Values already in the v3.2 set pass through; values in the
    intent-aware mapping table get re-pointed; everything else snaps
    to the nearest legal value with ties broken by rounding up. Non-
    ints return unchanged so the downstream Literal validator can
    surface the type error precisely.
    """
    if not isinstance(value, int) or isinstance(value, bool):
        return value
    if value in VALID_V32_DURATIONS:
        return value
    if value in LEGACY_DURATION_MAP:
        return LEGACY_DURATION_MAP[value]
    legal = sorted(VALID_V32_DURATIONS)
    # Pure math fallback for unmapped values (e.g. 22, 50). Tie-break
    # prefers the larger candidate so an out-of-table value rounds up.
    return min(legal, key=lambda candidate: (abs(candidate - value), -candidate))
