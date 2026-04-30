"""v3.1 → v3.2+ InterviewConfig migration (F-307)

Revision ID: 20260430_0001
Revises: 20260424_0001
Create Date: 2026-04-30 00:00:00.000000

Marker migration. The v3.2+ palette upgrade is implemented at the
Pydantic validator layer (`app/schemas/sessions.py` +
`app/models/legacy_mapping.py`) rather than as a one-shot SQL
rewrite, so legacy `interview_sessions.config_snapshot` JSON dicts
keep round-tripping with their original values. New writes land
directly in v3.2 shape via `InterviewConfigRequest`.

This file only bumps the Alembic head pointer so `alembic upgrade
head` does the right thing in fresh installs and so future
migrations have a consistent `down_revision` to chain off.

If a future deployment ever wants to physically rewrite legacy rows
(e.g. for analytics queries that don't go through Pydantic), the
data-migration body would loop over interview_sessions and apply
`upgrade_legacy_style` / `upgrade_legacy_direction` /
`upgrade_legacy_duration` to each `config_snapshot` JSON dict.
That code is intentionally NOT here — the Pydantic-layer story is
sufficient for the current feature scope.
"""

from __future__ import annotations


revision = "20260430_0001"
down_revision = "20260424_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No DDL changes. interview_sessions.config_snapshot is already a
    # JSON column (created in 20260421_0000_initial_sqlite.py) and the
    # v3.2+ palette additions are read-side only, courtesy of the
    # Pydantic before-validators in app.schemas.sessions.
    pass


def downgrade() -> None:
    # No-op pair. There's no schema state to roll back.
    pass
