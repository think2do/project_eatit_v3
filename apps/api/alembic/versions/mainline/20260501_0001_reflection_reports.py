"""create reflection_reports table (F-322 / V32.M3.2.2)

Revision ID: 20260501_0001
Revises: 20260430_0003
Create Date: 2026-05-01 00:00:00.000000

Backs the Reflection Agent (F-322 / M3.2.1). One row per session — keyed
on ``session_id`` UNIQUE so re-runs upsert in place. Schema mirrors the
contract in ``v32-p2-constraints.md §E4``.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260501_0001"
down_revision = "20260430_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reflection_reports",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column(
            "session_id",
            sa.String(length=36),
            sa.ForeignKey("interview_sessions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            comment=(
                "FK to interview_sessions.id. UNIQUE because a session has at "
                "most one reflection (re-runs upsert in place)."
            ),
        ),
        sa.Column(
            "payload",
            sa.JSON(),
            nullable=False,
            comment=(
                "Serialized ReflectionReport — executive_summary + "
                "per_question_coaching + general_growth_advice + "
                "mock_followup_dialogue."
            ),
        ),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            comment="One of pending/running/ok/failed.",
        ),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_rr_session", "reflection_reports", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_rr_session", table_name="reflection_reports")
    op.drop_table("reflection_reports")
