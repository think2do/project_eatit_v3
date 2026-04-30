"""create user_insight_cache table (F-318 / V32.M3.1.3)

Revision ID: 20260430_0003
Revises: 20260430_0002
Create Date: 2026-04-30 14:00:00.000000

Backs the cross-session Coach Agent (F-318): one row per user with the
most-recent insight payload + lifecycle status. ``based_on_last_session_id``
is the idempotency key the Coach trigger uses to skip re-runs against
the same report.

Schema mirrors the contract in ``v32-p2-constraints.md §E3``.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260430_0003"
down_revision = "20260430_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_insight_cache",
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("based_on_session_count", sa.Integer(), nullable=False),
        sa.Column(
            "based_on_last_session_id",
            sa.String(length=36),
            nullable=False,
            comment=(
                "Most-recent ready report session id at the time this cache "
                "was produced. CoachService treats a match as idempotent."
            ),
        ),
        sa.Column(
            "payload",
            sa.JSON(),
            nullable=False,
            comment=(
                "Serialized UserInsightCache (Pydantic) — headline / "
                "weaknesses / signals / focus areas."
            ),
        ),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            comment="One of pending/running/ok/failed/skipped.",
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
    op.create_index(
        "ix_uic_user_session",
        "user_insight_cache",
        ["user_id", "based_on_last_session_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_uic_user_session", table_name="user_insight_cache")
    op.drop_table("user_insight_cache")
