from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field, ValidationInfo, field_validator

from app.models.enums import (
    InterviewDirection,
    InterviewDirectionV32,
    InterviewDurationV32,
    InterviewSessionStatus,
    InterviewStyle,
    InterviewStyleV32,
)
from app.models.legacy_mapping import (
    upgrade_legacy_direction,
    upgrade_legacy_duration,
    upgrade_legacy_style,
)
from app.schemas.common import PaginatedResponse, SchemaModel, TimestampedResponse
from app.schemas.frameworks import DirectionFramework


class InterviewConfigRequest(SchemaModel):
    """v3.2+ InterviewConfig request shape (F-307).

    Backward compat (L0): legacy v3.1 fields `direction` (singular) and
    `style` values like `standard_professional` continue to validate.
    Validators run in `mode='before'` to project the legacy palette
    onto the v3.2 Literal palette before strict typing kicks in.
    Any 1–3-direction list of v3.2 ids is accepted; a missing /
    empty `directions` falls back to the legacy `direction` field.
    """

    style: InterviewStyleV32
    # NB: `direction` is declared BEFORE `directions` so the
    # before-validator on `directions` can read the legacy field via
    # `info.data["direction"]` (Pydantic v2 only exposes already-
    # validated fields in `info.data`).
    direction: InterviewDirection | None = None
    # v3.2+ multi-select. Default to `[]` so v3.1 clients that omit the
    # field altogether (and only send `direction`) still hit the
    # before-validator that promotes the legacy single-direction. The
    # min_length=1 guard then fires AFTER the back-fill, so a payload
    # with neither `directions` nor `direction` still gets rejected.
    directions: list[InterviewDirectionV32] = Field(
        default_factory=list, min_length=1, max_length=3
    )
    duration_minutes: InterviewDurationV32

    @field_validator("style", mode="before")
    @classmethod
    def _upgrade_style(cls, v: Any) -> Any:
        return upgrade_legacy_style(v)

    @field_validator("duration_minutes", mode="before")
    @classmethod
    def _upgrade_duration(cls, v: Any) -> Any:
        return upgrade_legacy_duration(v)

    @field_validator("directions", mode="before")
    @classmethod
    def _fill_directions_from_legacy(
        cls, v: Any, info: ValidationInfo
    ) -> Any:
        # Old front-ends that send only `direction` (singular) get
        # auto-promoted to a one-element `directions` list.
        if (not v) and info.data.get("direction"):
            mapped = upgrade_legacy_direction(info.data["direction"])
            if mapped is not None:
                return [mapped]
        return v


class InterviewConfigResponse(TimestampedResponse):
    interview_session_id: UUID
    style: InterviewStyleV32
    directions: list[InterviewDirectionV32] = Field(default_factory=list)
    duration_minutes: InterviewDurationV32
    # `direction` echoes back whatever was stored in the legacy column
    # (string(64), nullable=False). The create_session shim now writes
    # the FIRST v3.2 direction id (e.g. "ai-insight") for v3.2+ clients
    # and falls back to the v3.1 enum value for legacy ones — so the
    # response type must accept either palette. Without this Union, GET
    # /sessions/{id} blows up with a Pydantic ValidationError on every
    # session whose primary direction is a v3.2 id.
    direction: InterviewDirectionV32 | InterviewDirection | None = None


class CreateSessionRequest(SchemaModel):
    asset_bundle_id: UUID
    config: InterviewConfigRequest


class SessionListRequest(SchemaModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    status: InterviewSessionStatus | None = None


class CreateSessionResponse(SchemaModel):
    session_id: UUID
    status: InterviewSessionStatus
    direction_framework: DirectionFramework


class SessionSummary(TimestampedResponse):
    user_id: UUID
    candidate_asset_id: UUID
    status: InterviewSessionStatus
    started_at: datetime | None = None
    ended_at: datetime | None = None
    turn_count: int = Field(ge=0)
    config_snapshot: dict
    # M4-late additions for HistoryPage SessionTable. Both are optional
    # so v3.1 clients (and not-yet-graded sessions) keep working with
    # `None` / `[]` and the desktop renders the existing "—" placeholder.
    # Sourced from the *latest* InterviewReport row joined per session.
    latest_overall_score: int | None = None
    latest_weaknesses: list[str] = Field(default_factory=list, max_length=2)


class SessionDetailResponse(SessionSummary):
    config: InterviewConfigResponse | None = None
    direction_framework: DirectionFramework | None = None


class SessionListResponse(PaginatedResponse[SessionSummary]):
    pass


class EndSessionResponse(SchemaModel):
    session_id: UUID
    status: InterviewSessionStatus
    ended_at: datetime
