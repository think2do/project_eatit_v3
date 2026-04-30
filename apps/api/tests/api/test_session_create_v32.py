"""F-307 v3.2 session-create payload contract tests.

Pydantic-level coverage of the request/response shapes; we don't spin
up the full TestClient here because the integration test would
require user auth, asset upload, and a parsed JD — way out of scope
for V32.M1.1 which only owns the schema layer. Once F-307 lands the
real REST router, the existing api/test_*.py pattern can extend this.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.sessions import (
    CreateSessionRequest,
    InterviewConfigRequest,
    InterviewConfigResponse,
)


def test_create_session_request_accepts_v32_payload() -> None:
    payload = {
        "asset_bundle_id": str(uuid4()),
        "config": {
            "style": "structured",
            "directions": ["ai-insight", "data-driven"],
            "duration_minutes": 45,
        },
    }
    req = CreateSessionRequest.model_validate(payload)
    assert req.config.style == "structured"
    assert req.config.directions == ["ai-insight", "data-driven"]
    assert req.config.duration_minutes == 45


def test_create_session_request_accepts_legacy_v31_payload() -> None:
    """v3.1 client (single direction, legacy style, legacy duration)
    flows through the before-validators and ends up as a v3.2 envelope."""
    payload = {
        "asset_bundle_id": str(uuid4()),
        "config": {
            "style": "high_pressure_followup",
            "direction": "behavioral_comprehensive",
            "directions": [],
            "duration_minutes": 20,
        },
    }
    req = CreateSessionRequest.model_validate(payload)
    assert req.config.style == "pressure"
    assert req.config.directions == ["cross-func"]
    assert req.config.duration_minutes == 30  # 20 → snaps up to 30


def test_create_session_request_rejects_empty_directions_without_legacy() -> None:
    payload = {
        "asset_bundle_id": str(uuid4()),
        "config": {
            "style": "structured",
            "directions": [],
            "duration_minutes": 30,
            # no `direction` legacy fallback
        },
    }
    with pytest.raises(ValidationError):
        CreateSessionRequest.model_validate(payload)


def test_interview_config_response_round_trip() -> None:
    """Response shape preserves both new `directions` list and legacy
    single `direction` so v3.1 clients keep rendering."""
    response_payload = {
        "id": str(uuid4()),
        "interview_session_id": str(uuid4()),
        "created_at": "2026-04-30T12:00:00Z",
        "updated_at": "2026-04-30T12:00:00Z",
        "style": "expert",
        "directions": ["strategy", "user-research"],
        "duration_minutes": 45,
        "direction": "behavioral_comprehensive",
    }
    rsp = InterviewConfigResponse.model_validate(response_payload)
    assert rsp.style == "expert"
    assert rsp.directions == ["strategy", "user-research"]
    assert rsp.duration_minutes == 45
    assert rsp.direction == "behavioral_comprehensive"


def test_interview_config_request_strips_unknown_direction_in_list() -> None:
    """A directions entry outside the v3.2 palette must fail Literal."""
    with pytest.raises(ValidationError):
        InterviewConfigRequest(
            style="structured",
            directions=["ai-insight", "nonexistent-direction"],
            duration_minutes=30,
        )
