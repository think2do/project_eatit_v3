"""Coach Agent schemas (F-318 / V32.M3.1.1).

L0 A11/隐私 guardrail: ``CoachAgentInput`` is ``extra="forbid"``. Any caller
that hands in resume_text / candidate_email / candidate_phone / etc. raises
``ValidationError`` before the request ever reaches the LLM. The shape of
``recent_reports`` is intentionally a list of opaque dicts (already-redacted
``InterviewReportPayload`` snapshots produced by the report agent) — the
domain layer is responsible for picking only the safe fields when building
the input.

The ``UserInsightCache`` schema is the source of truth used by both the
agent output and the persistence layer (``user_insight_cache`` table is
introduced in V32.M3.1.3).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import InterviewDirectionV32


UserInsightStatus = Literal["pending", "running", "ok", "failed", "skipped"]


class CoachAgentInput(BaseModel):
    """Input to the Coach Agent.

    ``extra="forbid"`` is the first line of defence against PII leaks. The
    domain layer (M3.1.2) is responsible for upstream validation that
    ``len(recent_reports) >= 3`` and that each entry is a redacted dict
    safe to forward to the LLM.
    """

    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(min_length=1)
    based_on_session_count: int = Field(ge=3)
    based_on_last_session_id: str = Field(min_length=1)
    recent_reports: list[dict] = Field(min_length=3, max_length=10)
    candidate_profile: dict | None = None


class UserInsightCache(BaseModel):
    """Cross-session insight payload (mirrors PRD §5.6 + v32-p2-constraints A17).

    Persisted in ``user_insight_cache`` (one row per user). The
    ``based_on_last_session_id`` field is the idempotency key — the domain
    layer in M3.1.2 short-circuits when this matches the last completed
    report's session id.
    """

    user_id: str = Field(min_length=1)
    based_on_session_count: int = Field(ge=3)
    based_on_last_session_id: str = Field(min_length=1)
    headline: str = Field(max_length=80)
    headline_detail: str = Field(max_length=240)
    recurring_weaknesses: list[str] = Field(default_factory=list, max_length=5)
    improvement_signals: list[str] = Field(default_factory=list, max_length=5)
    next_focus_areas: list[InterviewDirectionV32] = Field(
        default_factory=list, max_length=3
    )
    generated_at: datetime
    status: UserInsightStatus = "ok"


class CoachAgentOutput(UserInsightCache):
    """Service output. Identical shape to the cache row payload."""

    pass


class _LLMCoachOutput(BaseModel):
    """The slice of UserInsightCache the LLM is asked to produce.

    Metadata fields (``user_id`` / ``based_on_*`` / ``generated_at`` /
    ``status``) are stamped server-side and never trusted from the model.
    """

    headline: str = Field(max_length=80)
    headline_detail: str = Field(max_length=240)
    recurring_weaknesses: list[str] = Field(default_factory=list, max_length=5)
    improvement_signals: list[str] = Field(default_factory=list, max_length=5)
    next_focus_areas: list[InterviewDirectionV32] = Field(
        default_factory=list, max_length=3
    )


__all__ = [
    "CoachAgentInput",
    "CoachAgentOutput",
    "UserInsightCache",
    "UserInsightStatus",
    "_LLMCoachOutput",
]
