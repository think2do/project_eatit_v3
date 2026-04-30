from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.models.enums import InterviewReportStatus
from app.schemas.common import SchemaModel, TimestampedResponse
from app.schemas.turns import NormalizedAnswer, NormalizedQuestion, NormalizedUserAssessment


class RoundReview(SchemaModel):
    question: NormalizedQuestion
    answer: NormalizedAnswer
    assessment: NormalizedUserAssessment


ReportVerdict = Literal["strong", "solid", "mixed", "weak"]


class ReportReason(SchemaModel):
    aspect: str
    verdict: ReportVerdict
    evidence_turn_index: int = Field(ge=0)
    quote: str


PassLikelihood = Literal["中上", "中", "中下"]


class InterviewReportPayload(SchemaModel):
    overall_summary: str
    round_reviews: list[RoundReview] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    # ===== L0 红线:老字段保留兼容(deprecated,不向用户展示)=====
    pass_probability: int = Field(default=0, ge=0, le=100)
    reasons: list[ReportReason] = Field(default_factory=list)
    # ===== v3.2+ 新增(F-314 ethical guardrail)=====
    # 通过可能性 3 档枚举。LLM 输出非法值会被 service 层 coerce 到合法档。
    pass_likelihood: PassLikelihood | None = None
    # 0–100 综合分数,与 pass_probability 不同语义(后者是匹配度)。
    overall_score: int | None = Field(default=None, ge=0, le=100)
    # LLM 直接输出的 verdict 文案。CI 用 NEGATIVE_KEYWORDS 正则扫禁
    # 止词,运行期 service 层应该已经过 prompt-side 护栏。
    ai_verdict: str | None = None


class TriggerReportResponse(SchemaModel):
    session_id: UUID
    status: InterviewReportStatus
    requested_at: datetime


class TriggerReportRequest(SchemaModel):
    force_regenerate: bool = False


class InterviewReportResponse(TimestampedResponse):
    interview_session_id: UUID
    status: InterviewReportStatus
    requested_at: datetime | None = None
    generated_at: datetime | None = None
    payload: InterviewReportPayload


class ReportStatusResponse(SchemaModel):
    session_id: UUID
    status: InterviewReportStatus
    has_payload: bool
