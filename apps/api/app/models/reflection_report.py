"""ReflectionReport — F-322 / V32.M3.2.2 teaching-tone reflection cache.

One row per report (FK 'session_id' → interview_sessions.id, unique).
Lifecycle states mirror the agent service ``ReflectionStatus`` literal:
``pending`` / ``running`` / ``ok`` / ``failed``. ``payload`` carries the
serialised ``ReflectionReport`` Pydantic blob (executive_summary +
per_question_coaching + general_growth_advice + mock_followup_dialogue).

This table is independent of the Coach-side ``user_insight_cache`` —
they run in parallel under ``post_report_graph`` (M3.2.2). Reflection
is keyed on session, Coach on user; the two never share rows.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDv7PrimaryKeyMixin


class ReflectionReportRow(UUIDv7PrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reflection_reports"

    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
        comment=(
            "FK to interview_sessions.id. UNIQUE because a session has at "
            "most one reflection (re-runs upsert in place)."
        ),
    )
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment=(
            "Serialized ReflectionReport — executive_summary + "
            "per_question_coaching + general_growth_advice + "
            "mock_followup_dialogue."
        ),
    )
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        comment="One of pending/running/ok/failed (ReflectionStatus).",
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_rr_session", "session_id"),
    )
