"""F-307 v3.1 → v3.2+ data migration tests.

Tests the read-side migration story: an `interview_sessions.config_snapshot`
JSON dict written by a v3.1 client must rehydrate into the v3.2
Pydantic schema without raising. The actual Alembic migration
(`alembic/versions/mainline/20260430_0001_v31_to_v32_directions.py`)
is a no-op marker because all migration work happens at the
Pydantic validator layer.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.sessions import InterviewConfigRequest


# Representative v3.1 config_snapshot payloads gathered from earlier
# session DB fixtures. Each one must rehydrate without ValidationError.
LEGACY_V31_PAYLOADS: list[dict] = [
    {
        "style": "friendly_guided",
        "direction": "role_match",
        "directions": [],
        "duration_minutes": 15,
    },
    {
        "style": "standard_professional",
        "direction": "project_deep_dive",
        "directions": [],
        "duration_minutes": 20,
    },
    {
        "style": "high_pressure_followup",
        "direction": "behavioral_comprehensive",
        "directions": [],
        "duration_minutes": 30,
    },
]


@pytest.mark.parametrize("legacy", LEGACY_V31_PAYLOADS)
def test_v31_config_snapshot_rehydrates_without_error(legacy: dict) -> None:
    """No ValidationError when loading a v3.1 config dict into the v3.2
    schema. The before-validators upgrade style/direction/duration."""
    cfg = InterviewConfigRequest.model_validate(legacy)
    assert cfg.style in {"structured", "pressure", "friendly", "expert"}
    assert cfg.duration_minutes in {15, 30, 45}
    assert 1 <= len(cfg.directions) <= 3


def test_v31_to_v32_style_mapping_exhaustive() -> None:
    """Each of the three legacy styles maps to exactly one v3.2 style."""
    cases = [
        ("friendly_guided", "friendly"),
        ("standard_professional", "structured"),
        ("high_pressure_followup", "pressure"),
    ]
    for legacy_style, expected in cases:
        cfg = InterviewConfigRequest(
            style=legacy_style,
            directions=["ai-insight"],
            duration_minutes=30,
        )
        assert cfg.style == expected


def test_v31_to_v32_direction_mapping_exhaustive() -> None:
    """Each of the three legacy directions maps to a single-element
    v3.2 directions list."""
    cases = [
        ("role_match", "cross-func"),
        ("project_deep_dive", "zero-to-one"),
        ("behavioral_comprehensive", "cross-func"),
    ]
    for legacy_direction, expected in cases:
        cfg = InterviewConfigRequest(
            style="structured",
            direction=legacy_direction,
            directions=[],
            duration_minutes=30,
        )
        assert cfg.directions == [expected]


def test_v31_payload_with_garbage_style_still_raises() -> None:
    """Migration is permissive on legacy values, not on garbage."""
    with pytest.raises(ValidationError):
        InterviewConfigRequest.model_validate(
            {
                "style": "totally_made_up_style",
                "direction": "role_match",
                "directions": [],
                "duration_minutes": 30,
            }
        )
