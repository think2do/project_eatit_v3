from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

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


# F-312 / F-313 V32.M1.3 — five-dimension scorecard + per-question
# review. The five dimension names are an A8 L0 red line; any
# rename / addition / removal trips the Pydantic Literal here plus
# the dimension contract test in tests/agents/test_report_dimensions.py.
DIMENSION_NAMES = Literal[
    "专业深度",
    "结构化表达",
    "批判性思考",
    "业务直觉",
    "沟通节奏",
]


class Chip(BaseModel):
    """Evidence chip surfaced inside a DimensionRow.

    `text` is constrained to 20 chars so the chip renders as a single
    pill on a 140 px progress-bar row. `good` flips the chip class
    (.tag-green vs .tag-warn) and the leading + / − glyph in the UI.
    """

    text: str = Field(max_length=20)
    good: bool


class DimensionScore(BaseModel):
    """One row of the report's "维度分析" card.

    Name is locked to the A8 set; description gives one-line context;
    score is a 0–100 int; chips list 1–6 evidence pills.
    """

    name: DIMENSION_NAMES
    description: str
    score: int = Field(ge=0, le=100)
    evidence_chips: list[Chip] = Field(min_length=1, max_length=6)


class RoundReviewV2(BaseModel):
    """One row of the report's "逐题复盘" card.

    Side-by-side with the legacy `RoundReview` (kept untouched for L0
    backward-compat); v3.2 surfaces independent per-question scoring
    plus a tone tag the UI maps to colour.
    """

    turn_index: int
    question_tag: str
    question_text: str
    score: int = Field(ge=0, le=100)
    tone: Literal["good", "ok", "warn"]
    answer_summary: str
    ai_feedback: str


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
    # ===== v3.2+ 新增(F-312 五维度评分,F-313 单题评分)=====
    # 严格 5 项 (经过 normalize_dimensions 补齐) 或空(v3.1 老报告未填)。
    dimensions: list[DimensionScore] = Field(default_factory=list)
    round_reviews_v2: list[RoundReviewV2] = Field(default_factory=list)


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
