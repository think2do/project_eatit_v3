from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import SchemaModel, TimestampedResponse


class JobRequirement(SchemaModel):
    title: str
    detail: str


class CandidateHighlight(SchemaModel):
    title: str
    detail: str


class CandidateRisk(SchemaModel):
    title: str
    detail: str


class ProjectHook(SchemaModel):
    project_name: str
    reason: str
    focus_points: list[str]


# ===== v3.2 sub-schemas (F-301) =====


class MatchScore(SchemaModel):
    score: int = Field(ge=0, le=100)
    level: Literal["LOW", "MID", "HIGH"]
    one_line: str = Field(max_length=80)


class MatchAdvantage(SchemaModel):
    label: str = Field(max_length=30)
    tag: Literal["强匹配", "匹配"]
    evidence: str = Field(max_length=200)


class Gap(SchemaModel):
    label: str = Field(max_length=30)
    tag: Literal["需补充", "待评估"]
    evidence: str = Field(max_length=200)


class InterviewFocus(SchemaModel):
    direction_id: Literal[
        "ai-insight",
        "data-driven",
        "cross-func",
        "zero-to-one",
        "user-research",
        "strategy",
    ]
    priority: Literal["high", "mid", "low"]
    title: str = Field(max_length=30)
    description: str = Field(max_length=120)


class ProjectHookV32(SchemaModel):
    name: str = Field(max_length=50)
    why: str = Field(max_length=120)


class CandidateProfile(SchemaModel):
    role: str = Field(max_length=40)
    years: int = Field(ge=0, le=60)
    companies: list[str] = Field(default_factory=list, max_length=10)
    domain_tags: list[str] = Field(default_factory=list, max_length=10)


class ParseResultPayload(SchemaModel):
    # ===== legacy fields retained (L0 A10) =====
    job_requirements: list[JobRequirement] = Field(default_factory=list)
    candidate_highlights: list[CandidateHighlight] = Field(default_factory=list)
    candidate_risks: list[CandidateRisk] = Field(default_factory=list)
    project_hooks: list[ProjectHook] = Field(default_factory=list)
    match_summary: str | None = None

    # ===== v3.2 additions (F-301) =====
    candidate_profile: CandidateProfile | None = None
    match_score: MatchScore | None = None
    profile_summary: str | None = Field(default=None, max_length=300)
    match_advantages: list[MatchAdvantage] = Field(default_factory=list, max_length=5)
    gaps: list[Gap] = Field(default_factory=list, max_length=5)
    interview_focus: list[InterviewFocus] = Field(
        default_factory=list, min_length=0, max_length=3
    )
    project_hooks_v32: list[ProjectHookV32] = Field(
        default_factory=list, min_length=0, max_length=2
    )


class ParseRequestResponse(SchemaModel):
    asset_bundle_id: UUID
    status: str
    payload: ParseResultPayload


class ParseResultResponse(TimestampedResponse):
    candidate_asset_id: UUID
    status: str
    payload: ParseResultPayload


class ParseResultPreview(SchemaModel):
    match_summary: str
    candidate_risk_count: int = Field(ge=0)
    project_hook_count: int = Field(ge=0)
