from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ReportTurnAssessmentSnippet(BaseModel):
    summary: str


class ReportTurnRecord(BaseModel):
    question: str
    answer: str
    assessment: ReportTurnAssessmentSnippet | None = None


class ReportAgentInput(BaseModel):
    parse_payload_json: str
    framework_json: str
    turns: list[ReportTurnRecord]
    long_term_summary: str | None = None


Verdict = Literal["strong", "solid", "mixed", "weak"]


class Reason(BaseModel):
    aspect: str
    verdict: Verdict
    evidence_turn_index: int = Field(ge=0)
    quote: str


class ReportAgentOutput(BaseModel):
    pass_probability: int = Field(ge=0, le=100)
    summary: str
    reasons: list[Reason]
    next_actions: list[str]
    # F-314 ethical guardrail. The LLM may produce a free-form
    # `pass_likelihood` (validated/coerced to one of 中上/中/中下 by
    # `app.domain.reports.service.coerce_pass_likelihood`) or a 0–100
    # `overall_score`. `ai_verdict` is a free-form one-liner that is
    # screened by `tests/agents/test_ai_verdict_scan.py` for negative
    # keywords. All three default to None for back-compat with old
    # ScriptedGateway payloads.
    pass_likelihood: str | None = None
    overall_score: int | None = Field(default=None, ge=0, le=100)
    ai_verdict: str | None = None
    # F-312 / F-313 V32.M1.3 — five-dimension scorecard + per-question
    # review. Both default to []; the report service runs
    # `normalize_dimensions` to pad to 5 (or preserve [] for v3.1
    # legacy payloads). Schemas live in app.schemas.reports so the
    # REST envelope can reuse them without circular imports.
    dimensions: list["DimensionScore"] = Field(default_factory=list)
    round_reviews_v2: list["RoundReviewV2"] = Field(default_factory=list)
    # F-317 — opt-in preset-driven next-session CTA. Defaults to None;
    # the report service usually derives this server-side via
    # `derive_preset_config` rather than trusting LLM output, so the
    # field is rarely populated by the agent itself. Keeping it here
    # lets future LLM revisions emit an explicit suggestion without
    # a schema change.
    next_actions_v2: "NextActions | None" = None


# Forward-ref imports — placed at module bottom to avoid circular
# import (schemas.reports imports nothing from agents.report).
from app.schemas.reports import (  # noqa: E402
    DimensionScore,
    NextActions,
    RoundReviewV2,
)

ReportAgentOutput.model_rebuild()
