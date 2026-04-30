"""ResearchCache — F-320 / V32.M2.3.2 30-day cache for ResearchAgent output.

Keyed on the cache_key produced by `app.agents.research.service._compute_cache_key`
(sha256(company|industries)[:16]). Storing the *hash* not the company name
satisfies L0 A11: an attacker reading the SQLite file gets neither resume
content nor plaintext company names back, just opaque keys + already-public
research blobs.

`expires_at` is set 30 days after `fetched_at` at insert time and is the
only TTL signal — there is no scheduled cleaner today; lookups simply
ignore expired rows. A future maintenance task can `DELETE WHERE
expires_at < now()` to reclaim space.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ResearchCache(Base):
    __tablename__ = "research_cache"

    cache_key: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        nullable=False,
        comment="sha256(company_name|industry_hints)[:16]. NEVER plaintext company name.",
    )
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        comment="Serialized ResearchAgentOutput (company + industry + degraded flags).",
    )
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        comment="fetched_at + 30 days. Lookups treat rows past this as cache-miss.",
    )
