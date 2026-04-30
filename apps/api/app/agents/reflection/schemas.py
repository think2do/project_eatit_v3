"""Reflection Agent schemas (F-322 / V32.M3.2.1).

Mirrors v32-p2-constraints.md §A17 ReflectionReport. Three sub-models:

  * ``PerQuestionCoaching`` — one card per turn, focused on warn-toned
    answers (the Report agent already covers strong / solid).
  * ``DialogueTurn`` — a follow-up mock dialogue line (≤ 200 chars).
  * ``ReflectionReport`` — the persisted top-level shape.

L0 A11 privacy: ``ReflectionAgentInput`` is ``extra="forbid"``. Callers
that try to slip resume_text / candidate_email through hit a
``ValidationError`` before any LLM contact — same first-line-of-defence
pattern that ``CoachAgentInput`` uses.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ReflectionStatus = Literal["pending", "running", "ok", "failed"]


class PerQuestionCoaching(BaseModel):
    turn_index: int = Field(ge=0)
    question: str = Field(max_length=300)
    your_answer_summary: str = Field(max_length=300)
    diagnosis: str = Field(max_length=300)
    model_answer_outline: list[str] = Field(min_length=2, max_length=5)
    key_phrases_to_use: list[str] = Field(min_length=2, max_length=5)
    mistakes_to_avoid: list[str] = Field(min_length=1, max_length=4)
    recommended_resources: list[str] = Field(default_factory=list, max_length=3)


class DialogueTurn(BaseModel):
    role: Literal["interviewer", "candidate"]
    text: str = Field(max_length=200)


class ReflectionReport(BaseModel):
    report_id: str = Field(min_length=1)
    session_id: str = Field(min_length=1)
    executive_summary: str = Field(max_length=400)
    per_question_coaching: list[PerQuestionCoaching] = Field(default_factory=list)
    general_growth_advice: str = Field(max_length=300)
    mock_followup_dialogue: list[DialogueTurn] = Field(
        default_factory=list, max_length=12
    )
    generated_at: datetime
    status: ReflectionStatus = "ok"


class ReflectionAgentInput(BaseModel):
    """L0 A11 — strictly the audit-safe fields the prompt actually needs.

    ``extra="forbid"`` rejects unknown PII keys (resume_text /
    candidate_email / etc.) before any prompt rendering. The domain layer
    is responsible for projecting the InterviewReport / Turns down onto
    these dict shapes (already-redacted by the report agent).
    """

    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(min_length=1)
    report_id: str = Field(min_length=1)
    # InterviewReportPayload as a dict (already L0-clean — the report
    # agent owns redaction). Including it here lets Reflection key off
    # the report-side ai_verdict / dimensions without re-deriving them.
    report_payload: dict
    # List of {question, answer, assessment?} dicts; ordered by turn_index.
    turns: list[dict] = Field(default_factory=list, max_length=30)
    # Optional Parse + Research signal. Both are dict-shaped to stay
    # forward-compatible with future schema additions on those agents.
    parse_payload: dict | None = None
    research_payload: dict | None = None


class ReflectionAgentOutput(ReflectionReport):
    """Service output. Identical shape to the persisted report."""

    pass


class _LLMReflectionOutput(BaseModel):
    """The slice of ``ReflectionReport`` the LLM is asked to produce.

    ``report_id`` / ``session_id`` / ``generated_at`` / ``status`` are
    stamped server-side and never trusted from model output.
    """

    executive_summary: str = Field(max_length=400)
    per_question_coaching: list[PerQuestionCoaching] = Field(default_factory=list)
    general_growth_advice: str = Field(max_length=300)
    mock_followup_dialogue: list[DialogueTurn] = Field(
        default_factory=list, max_length=12
    )


__all__ = [
    "DialogueTurn",
    "PerQuestionCoaching",
    "ReflectionAgentInput",
    "ReflectionAgentOutput",
    "ReflectionReport",
    "ReflectionStatus",
    "_LLMReflectionOutput",
]
