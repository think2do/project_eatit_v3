"""ResearchCache repository — F-320 / V32.M2.3.X audit-fix (G4).

Reads / writes the `research_cache` table backing ResearchAgent's 30-day
cache. Pre-audit the table existed (M2.3.2 migration) but nothing read or
wrote it, so the "30-day cache" promise was vapourware. This repository
closes the gap.

L0 A11 reminder: the primary key is the sha256-derived `cache_key`, so
even with full SQLite access an attacker never recovers the plaintext
company name. The serialised payload contains only research blobs the
LLM was already prepared to ship over the wire.

Lookup contract:
  * `get(session, cache_key)` returns the row's payload dict if present
    AND not yet expired; otherwise `None`. Expired rows are NOT deleted
    here — a future cleanup job can sweep them; for now we just ignore.
  * `set(session, cache_key, payload, ttl_days=30)` upserts, bumping
    `fetched_at` / `expires_at` so a re-fetch after an external retry
    keeps the freshest copy.

The caller (`ResearchAgentService`) commits the surrounding session —
this module never commits or rolls back on its own. This keeps cache
writes inside the same transaction as the rest of the request, so a
later failure (e.g. response serialisation) rolls the cache write back
too.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.research_cache import ResearchCache


DEFAULT_TTL_DAYS: int = 30


async def get(
    session: AsyncSession, cache_key: str, *, now: datetime | None = None
) -> dict[str, Any] | None:
    """Return the cached payload dict iff it exists AND has not expired."""
    if not cache_key:
        return None
    result = await session.execute(
        select(ResearchCache).where(ResearchCache.cache_key == cache_key)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None
    horizon = now or datetime.now(timezone.utc)
    # `expires_at` is stored timezone-aware on Postgres; SQLite drops the
    # tzinfo on round-trip. Re-attach UTC if naive so the comparison is
    # well-defined.
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= horizon:
        return None
    return dict(row.payload)


async def set_(
    session: AsyncSession,
    cache_key: str,
    payload: dict[str, Any],
    *,
    ttl_days: int = DEFAULT_TTL_DAYS,
    now: datetime | None = None,
) -> None:
    """Upsert the cache row. Caller commits the surrounding transaction."""
    fetched_at = now or datetime.now(timezone.utc)
    expires_at = fetched_at + timedelta(days=ttl_days)
    # Prefer SQLite's ON CONFLICT path so a re-fetch with the same hash
    # bumps fetched_at/expires_at instead of erroring on the PK. Postgres
    # would use `pg_insert(...).on_conflict_do_update(...)`; today the
    # backing store is sqlite-only so we hard-code that dialect.
    stmt = (
        sqlite_insert(ResearchCache)
        .values(
            cache_key=cache_key,
            payload=payload,
            fetched_at=fetched_at,
            expires_at=expires_at,
        )
        .on_conflict_do_update(
            index_elements=[ResearchCache.cache_key],
            set_={
                "payload": payload,
                "fetched_at": fetched_at,
                "expires_at": expires_at,
            },
        )
    )
    await session.execute(stmt)


__all__ = ["DEFAULT_TTL_DAYS", "get", "set_"]
