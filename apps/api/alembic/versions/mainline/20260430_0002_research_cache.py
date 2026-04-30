"""create research_cache table (F-320 / V32.M2.3.2)

Revision ID: 20260430_0002
Revises: 20260430_0001
Create Date: 2026-04-30 12:00:00.000000

ResearchAgent (M2.3.1) emits a ResearchAgentOutput keyed on a
sha256-prefix `cache_key`. M2.3.2 adds the persistence + 30-day TTL
table behind that key. The opt-in flag itself rides on the existing
key/value `app_settings` table (key = "research_opt_in") rather than a
new column — see app.domain.settings.service.ALLOWED_KEYS.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260430_0002"
down_revision = "20260430_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "research_cache",
        sa.Column(
            "cache_key",
            sa.String(length=64),
            primary_key=True,
            nullable=False,
            comment=(
                "sha256(company_name|industry_hints)[:16]. NEVER plaintext "
                "company name (L0 A11)."
            ),
        ),
        sa.Column(
            "payload",
            sa.JSON(),
            nullable=False,
            comment="Serialized ResearchAgentOutput (company + industry + degraded flags).",
        ),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
            comment="fetched_at + 30 days. Lookups treat rows past this as cache-miss.",
        ),
    )
    op.create_index(
        "ix_research_cache_expires_at",
        "research_cache",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_research_cache_expires_at", table_name="research_cache")
    op.drop_table("research_cache")
