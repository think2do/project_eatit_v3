"""UserInsightCache — F-318 / V32.M3.1.3 cross-session insight cache.

One row per user. ``based_on_last_session_id`` is the idempotency key
the Coach trigger uses to short-circuit re-runs against the same most-
recent session. ``status`` carries the lifecycle state so the Dashboard
GET API can render running / failed / skipped without inferring from
absent payload fields.

The full insight payload (``UserInsightCache`` Pydantic schema at
``app/agents/coach/schemas.py``) lives in the ``payload`` JSON column;
we don't shred its fields into columns because the read pattern is
"fetch the whole row to render the AICoach card", and a JSON blob keeps
the schema additive across future Coach iterations.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class UserInsightCacheRow(TimestampMixin, Base):
    __tablename__ = "user_insight_cache"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    based_on_session_count: Mapped[int] = mapped_column(nullable=False)
    based_on_last_session_id: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
        comment=(
            "Most-recent ready report session id at the time this cache "
            "was produced. CoachService treats a match as idempotent."
        ),
    )
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment="Serialized UserInsightCache (Pydantic) — headline / weaknesses / signals / focus areas.",
    )
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        comment="One of pending/running/ok/failed/skipped (UserInsightStatus).",
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    __table_args__ = (
        Index(
            "ix_uic_user_session",
            "user_id",
            "based_on_last_session_id",
        ),
    )
