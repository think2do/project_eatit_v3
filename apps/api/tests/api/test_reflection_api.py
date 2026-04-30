"""V32.M3.2.2 — GET /api/v1/sessions/{id}/reflection tests (F-322).

Six cases:

  1. No row in DB                       → 204 No Content.
  2. ``status == "running"`` row        → 200 + placeholder payload.
  3. ``status == "ok"`` row             → 200 + full payload (round-trips
                                           through the Pydantic schema).
  4. ``status == "failed"`` row         → 200 + failure placeholder + the
                                           lifecycle is observable (the
                                           desktop client renders a retry
                                           CTA).
  5. Cross-user 404                     → owner check returns 404 even
                                           when a row exists for another
                                           user's session.
  6. Repository idempotency             → upsert_ok overwrites in place
                                           (re-running Reflection produces
                                           one row, not many).
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.agents.reflection.schemas import (
    DialogueTurn,
    PerQuestionCoaching,
    ReflectionReport,
)
from app.api.dependencies.auth import MOCK_USER_ID
from app.infra.db import get_async_session
from app.main import app
from app.models import Base
from app.models.session import InterviewSession
from app.models.user import User
from app.repositories.reflection_reports import (
    SqlAlchemyReflectionReportRepository,
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


async def _seed_session_for_mock_user(
    factory: async_sessionmaker[AsyncSession], session_id: str
) -> None:
    """Insert the mock user + an interview_session row owned by them."""
    async with factory() as s:
        s.add(User(id=MOCK_USER_ID, email="mock-user@eatit.local"))
        s.add(
            InterviewSession(
                id=session_id,
                user_id=MOCK_USER_ID,
                candidate_asset_id=str(uuid4()),
                status="report_ready",
                turn_count=2,
                config_snapshot={},
            )
        )
        await s.commit()


async def _seed_session_for_other_user(
    factory: async_sessionmaker[AsyncSession], session_id: str
) -> None:
    other_user_id = str(uuid4())
    async with factory() as s:
        s.add(User(id=other_user_id, email="other@eatit.local"))
        s.add(
            InterviewSession(
                id=session_id,
                user_id=other_user_id,
                candidate_asset_id=str(uuid4()),
                status="report_ready",
                turn_count=2,
                config_snapshot={},
            )
        )
        await s.commit()


def _ok_payload(session_id: str) -> ReflectionReport:
    return ReflectionReport(
        report_id=str(uuid4()),
        session_id=session_id,
        executive_summary=(
            "本场表现整体稳定;建议针对指标拆解 + 跨职能协作做一次专项练习。"
        ),
        per_question_coaching=[
            PerQuestionCoaching(
                turn_index=0,
                question="如何拆解一个新业务的北极星指标",
                your_answer_summary="只列了 DAU 没分层",
                diagnosis="可加强指标拆解的层级表达,补充驱动指标",
                model_answer_outline=["先讲北极星", "再讲驱动指标"],
                key_phrases_to_use=["北极星", "驱动指标"],
                mistakes_to_avoid=["建议下次注意指标分层"],
                recommended_resources=["《精益数据分析》"],
            )
        ],
        general_growth_advice=(
            "1) STAR 重写最关键的回答;2) 找 3 道相似题做即兴练习;"
            "3) 24h 前再回看本份复盘。"
        ),
        mock_followup_dialogue=[
            DialogueTurn(role="interviewer", text="驱动指标怎么拆?"),
            DialogueTurn(role="candidate", text="按用户行为漏斗 5 步拆解。"),
        ],
        generated_at=datetime.now(timezone.utc),
        status="ok",
    )


# ---------------------------------------------------------------------------
# API contract — 204 / 200 lifecycle states
# ---------------------------------------------------------------------------


async def test_get_returns_204_when_no_row(
    override_db, sqlite_session_factory
) -> None:
    session_id = str(uuid4())
    await _seed_session_for_mock_user(sqlite_session_factory, session_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(f"/api/v1/sessions/{session_id}/reflection")
    assert response.status_code == 204
    assert response.content == b""


async def test_get_returns_200_for_running_row(
    override_db, sqlite_session_factory
) -> None:
    session_id = str(uuid4())
    await _seed_session_for_mock_user(sqlite_session_factory, session_id)
    repo = SqlAlchemyReflectionReportRepository(sqlite_session_factory)
    await repo.upsert_running(session_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(f"/api/v1/sessions/{session_id}/reflection")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "running"
    assert body["session_id"] == session_id
    assert body["per_question_coaching"] == []


async def test_get_returns_200_with_full_payload_for_ok_row(
    override_db, sqlite_session_factory
) -> None:
    session_id = str(uuid4())
    await _seed_session_for_mock_user(sqlite_session_factory, session_id)
    repo = SqlAlchemyReflectionReportRepository(sqlite_session_factory)
    await repo.upsert_ok(_ok_payload(session_id))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(f"/api/v1/sessions/{session_id}/reflection")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["session_id"] == session_id
    assert body["executive_summary"].startswith("本场")
    assert len(body["per_question_coaching"]) == 1
    assert len(body["mock_followup_dialogue"]) == 2


async def test_get_returns_200_for_failed_row(
    override_db, sqlite_session_factory
) -> None:
    session_id = str(uuid4())
    await _seed_session_for_mock_user(sqlite_session_factory, session_id)
    repo = SqlAlchemyReflectionReportRepository(sqlite_session_factory)
    await repo.upsert_failed(session_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(f"/api/v1/sessions/{session_id}/reflection")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    # Failed rows still satisfy the schema — placeholder payload + status
    # tells the desktop client to render the retry CTA.
    assert body["session_id"] == session_id


async def test_get_404_when_session_owned_by_other_user(
    override_db, sqlite_session_factory
) -> None:
    """Cross-user 404 even if a reflection row happens to exist."""
    session_id = str(uuid4())
    await _seed_session_for_other_user(sqlite_session_factory, session_id)
    repo = SqlAlchemyReflectionReportRepository(sqlite_session_factory)
    await repo.upsert_ok(_ok_payload(session_id))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(f"/api/v1/sessions/{session_id}/reflection")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Repository idempotency — upsert_ok overwrites in place
# ---------------------------------------------------------------------------


async def test_repo_upsert_ok_overwrites_existing_row(
    sqlite_session_factory,
) -> None:
    session_id = str(uuid4())
    repo = SqlAlchemyReflectionReportRepository(sqlite_session_factory)
    await repo.upsert_running(session_id)
    await repo.upsert_ok(_ok_payload(session_id))

    fresh = _ok_payload(session_id)
    fresh.executive_summary = "重新生成后的总结"
    await repo.upsert_ok(fresh)

    got = await repo.get_by_session(session_id)
    assert got is not None
    assert got.status == "ok"
    assert got.executive_summary == "重新生成后的总结"


async def test_repo_status_lifecycle_round_trips(
    sqlite_session_factory,
) -> None:
    session_id = str(uuid4())
    repo = SqlAlchemyReflectionReportRepository(sqlite_session_factory)

    await repo.upsert_running(session_id)
    got = await repo.get_by_session(session_id)
    assert got is not None and got.status == "running"

    await repo.upsert_ok(_ok_payload(session_id))
    got = await repo.get_by_session(session_id)
    assert got is not None and got.status == "ok"

    await repo.upsert_failed(session_id)
    got = await repo.get_by_session(session_id)
    assert got is not None and got.status == "failed"


async def test_repo_get_returns_none_for_unknown_session(
    sqlite_session_factory,
) -> None:
    repo = SqlAlchemyReflectionReportRepository(sqlite_session_factory)
    assert await repo.get_by_session("does-not-exist") is None
