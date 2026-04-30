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
