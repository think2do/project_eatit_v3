from __future__ import annotations

from pydantic import Field

from app.models.enums import (
    InterviewDirection,
    InterviewDirectionV32,
    InterviewStyle,
    InterviewStyleV32,
)
from app.schemas.common import SchemaModel


class FrameworkStage(SchemaModel):
    name: str
    goal: str
    question_budget: int = Field(ge=1)


class DirectionFramework(SchemaModel):
    # Accept either the v3.1 StrEnum value or a v3.2 Literal so the
    # framework agent can be invoked with either-vintage payloads
    # (F-307: InterviewConfigRequest already upgrades requests to the
    # v3.2 palette, so the framework most often sees v3.2 strings).
    style: InterviewStyleV32 | InterviewStyle
    direction: InterviewDirectionV32 | InterviewDirection
    duration_minutes: int = Field(ge=1)
    stages: list[FrameworkStage]
    focus_points: list[str]
    risk_points: list[str]
