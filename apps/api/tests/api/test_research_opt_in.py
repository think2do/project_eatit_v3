"""V32.M2.3.2 — research opt-in REST contract (F-320).

Six cases:

  1. GET on a fresh DB returns `{enabled: false}` (default-off).
  2. PUT true round-trips back through GET.
  3. PUT false after PUT true correctly toggles back off.
  4. PUT with a non-bool body (string "yes") is 422.
  5. PUT with a missing `enabled` key is 422.
  6. The new whitelist entry is the ONLY thing that changed in
     ALLOWED_KEYS — the existing key set still passes (regression).
"""
from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.domain.settings.service import ALLOWED_KEYS
from app.infra.db import get_async_session
from app.main import app
from app.models import Base


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


async def test_get_defaults_to_false_on_fresh_db(override_db) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/settings/research-opt-in")

    assert response.status_code == 200
    assert response.json() == {"enabled": False}


async def test_put_true_then_get_returns_true(override_db) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        put_response = await client.put(
            "/api/v1/settings/research-opt-in", json={"enabled": True}
        )
        get_response = await client.get("/api/v1/settings/research-opt-in")

    assert put_response.status_code == 200
    assert put_response.json() == {"enabled": True}
    assert get_response.status_code == 200
    assert get_response.json() == {"enabled": True}


async def test_put_false_after_true_toggles_back_off(override_db) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        await client.put(
            "/api/v1/settings/research-opt-in", json={"enabled": True}
        )
        toggle_off = await client.put(
            "/api/v1/settings/research-opt-in", json={"enabled": False}
        )
        get_response = await client.get("/api/v1/settings/research-opt-in")

    assert toggle_off.json() == {"enabled": False}
    assert get_response.json() == {"enabled": False}


async def test_put_rejects_non_bool_payload(override_db) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.put(
            "/api/v1/settings/research-opt-in", json={"enabled": "yes"}
        )

    # FastAPI rejects bad bools at the Pydantic layer with 422.
    # ("yes" coerces to True in plain Python but Pydantic v2 does NOT
    # coerce strings to bool — that's the contract we want.)
    assert response.status_code == 422


async def test_put_rejects_missing_enabled_key(override_db) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.put(
            "/api/v1/settings/research-opt-in", json={}
        )

    assert response.status_code == 422


def test_research_opt_in_is_whitelisted() -> None:
    """Regression guard: M2.3.2 added 'research_opt_in' without removing other keys."""
    assert "research_opt_in" in ALLOWED_KEYS
    # Existing keys still present (M2.3.2 only added one).
    expected_pre_m2_3_2 = {
        "onboarding_completed_at",
        "ui_theme",
        "last_selected_provider_hint",
        "observer_panel_enabled",
        "interview_input_mode",
        "interviewer_tts_enabled",
    }
    assert expected_pre_m2_3_2.issubset(ALLOWED_KEYS)
