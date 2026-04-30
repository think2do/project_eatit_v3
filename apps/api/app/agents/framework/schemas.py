from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class FrameworkConfigInput(BaseModel):
    level: str
    style: str
    duration_minutes: int = Field(ge=1)


class FrameworkAgentInput(BaseModel):
    parse_payload_json: str
    config: FrameworkConfigInput
    # F-321 V32.M2.3.3 — optional Research output (CompanyProfile +
    # IndustryProfile) serialized as JSON. When present, FrameworkAgent
    # is expected to emit a PredictedQuestionBank drawing from both
    # Parse and Research. None → bank may still be emitted but `sources`
    # is restricted to a subset of {"jd","resume"}.
    research_payload_json: str | None = None


class FocusCompetency(BaseModel):
    title: str
    why: str
    probe_hint: str


class DeepDiveAnchor(BaseModel):
    anchor: str
    probe_chain: list[str]


class PaceSegment(BaseModel):
    name: str
    rough_minutes: int = Field(ge=1)
    goal: str


class PacePlan(BaseModel):
    total_minutes: int = Field(ge=1)
    segments: list[PaceSegment]


# ===== F-321 V32.M2.3.3 — Predicted question bank =====


PredictedCategory = Literal[
    "company-business",
    "industry-judgment",
    "project-deepdive",
    "general-pm",
]
PredictedSource = Literal["jd", "resume", "research"]


class PredictedQuestion(BaseModel):
    category: PredictedCategory
    question: str = Field(max_length=200)
    why_likely: str = Field(max_length=80)
    related_evidence: str = Field(max_length=120)


class PredictedQuestionBank(BaseModel):
    questions: list[PredictedQuestion] = Field(min_length=8, max_length=15)
    generated_at: datetime
    # At least one source must back the bank; lists with all three are
    # the M2.3.4 happy path (intake_graph runs Parse + Research in
    # parallel and Framework reads both).
    sources: list[PredictedSource] = Field(min_length=1)


class FrameworkAgentOutput(BaseModel):
    direction: Literal["project_deep_dive", "competency_probe", "culture_fit", "hybrid"]
    focus_competencies: list[FocusCompetency]
    opening_questions: list[str]
    deep_dive_anchors: list[DeepDiveAnchor]
    pace_plan: PacePlan
    # F-321 V32.M2.3.3 — None when Research is unavailable AND the
    # model elects not to predict from Parse alone. UI hides the
    # PredictedQuestionList card in that case.
    predicted_questions: PredictedQuestionBank | None = None
