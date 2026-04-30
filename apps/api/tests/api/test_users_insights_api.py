"""V32.M3.1.3 — GET /api/v1/users/me/insights tests (F-318).

Five cases:

  1. Fresh DB (no row) → 204 No Content. Frontend renders the empty
     state CTA ("Complete N more sessions to unlock AI insights").
  2. ``status == "skipped"`` row (< 3 reports) → 200 + payload with
     status=skipped. Frontend hides the AICoach card and shows the
     progress card.
  3. ``status == "ok"`` row (≥3 reports + Coach succeeded) → 200 +
     full payload renders.
  4. Idempotency probe — repository ``upsert_ok`` is a no-op when the
     row already exists with the same ``based_on_last_session_id``
     (the trigger catches this earlier; here we lock the repo behaviour).
  5. Status round-trip — failed/running rows persist their lifecycle so
     the Dashboard can decide whether to retry (M3.1.4 wiring).
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.agents.coach.schemas import UserInsightCache
from app.api.dependencies.auth import MOCK_USER_ID
from app.infra.db import get_async_session
from app.main import app
from app.models import Base
from app.repositories.user_insight_cache import (
    SqlAlchemyUserInsightCacheRepository,
)


@pytest_asyncio.fixture
async def sqlite_session_factory():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.fixture
def override_db(sqlite_session_factory):
    async def _override() -> AsyncIterator[AsyncSession]:
        async with sqlite_session_factory() as s:
            yield s

    app.dependency_overrides[get_async_session] = _override
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_async_session, None)


def _ok_payload(last_session_id: str = "s-3") -> UserInsightCache:
    return UserInsightCache(
        user_id=MOCK_USER_ID,
        based_on_session_count=3,
        based_on_last_session_id=last_session_id,
        headline="继续聚焦数据驱动方向",
        headline_detail="近三场表现稳定提升,建议针对业务直觉做 2 场专项",
        recurring_weaknesses=["指标拆解深度不足"],
        improvement_signals=["近三场结构化表达稳定提升"],
        next_focus_areas=["data-driven"],
        generated_at=datetime.now(timezone.utc),
        status="ok",
    )


# ---------------------------------------------------------------------------
# API contract
# ---------------------------------------------------------------------------


async def test_get_returns_204_when_no_row(override_db) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/users/me/insights")
    assert response.status_code == 204
    assert response.content == b""


async def test_get_returns_skipped_payload_below_threshold(
    override_db, sqlite_session_factory
) -> None:
    """场次<3 → trigger 写 skipped 行 → API 200 + status=skipped."""
    repo = SqlAlchemyUserInsightCacheRepository(sqlite_session_factory)
    await repo.upsert_skipped(MOCK_USER_ID, "s-1", session_count=1)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/users/me/insights")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "skipped"
    assert body["user_id"] == MOCK_USER_ID
    assert body["based_on_last_session_id"] == "s-1"
    # session_count is normalised to ≥3 to satisfy schema even though the
    # actual count was 1; clients render the empty state from `status`.
    assert body["based_on_session_count"] >= 3


async def test_get_returns_ok_payload_when_coach_succeeded(
    override_db, sqlite_session_factory
) -> None:
    """≥3 ready reports + Coach 跑成功 → API 200 + 完整 payload."""
    repo = SqlAlchemyUserInsightCacheRepository(sqlite_session_factory)
    await repo.upsert_ok(MOCK_USER_ID, _ok_payload("s-3"))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/users/me/insights")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["user_id"] == MOCK_USER_ID
    assert body["based_on_last_session_id"] == "s-3"
    assert body["headline"].startswith("继续")
    assert body["recurring_weaknesses"] == ["指标拆解深度不足"]
    assert body["next_focus_areas"] == ["data-driven"]


# ---------------------------------------------------------------------------
# Repository — idempotency / lifecycle round-trip
# ---------------------------------------------------------------------------


async def test_repo_upsert_ok_overwrites_existing_row(
    sqlite_session_factory,
) -> None:
    """Re-running Coach for the same user replaces the cache row in-place."""
    repo = SqlAlchemyUserInsightCacheRepository(sqlite_session_factory)
    await repo.upsert_ok(MOCK_USER_ID, _ok_payload("s-3"))

    fresh = _ok_payload("s-4")
    fresh.headline = "聚焦跨职能协作"
    await repo.upsert_ok(MOCK_USER_ID, fresh)

    got = await repo.get(MOCK_USER_ID)
    assert got is not None
    assert got.based_on_last_session_id == "s-4"
    assert got.headline == "聚焦跨职能协作"


async def test_repo_status_lifecycle_round_trips(
    sqlite_session_factory,
) -> None:
    """running → ok → failed all persist + read back through .get()."""
    repo = SqlAlchemyUserInsightCacheRepository(sqlite_session_factory)

    await repo.upsert_running(MOCK_USER_ID, "s-3")
    got = await repo.get(MOCK_USER_ID)
    assert got is not None
    assert got.status == "running"

    await repo.upsert_ok(MOCK_USER_ID, _ok_payload("s-3"))
    got = await repo.get(MOCK_USER_ID)
    assert got is not None
    assert got.status == "ok"

    await repo.upsert_failed(MOCK_USER_ID, "s-4")
    got = await repo.get(MOCK_USER_ID)
    assert got is not None
    assert got.status == "failed"
    assert got.based_on_last_session_id == "s-4"


async def test_repo_get_returns_none_for_unknown_user(
    sqlite_session_factory,
) -> None:
    repo = SqlAlchemyUserInsightCacheRepository(sqlite_session_factory)
    assert await repo.get("does-not-exist") is None
