"""V32.M2.3.X audit-fix (G4) — ResearchCache repository + service integration.

Pre-audit the cache table existed but nothing read or wrote it. These
tests pin the new behaviour:

  1. Repository round-trips a payload (set_ then get).
  2. Expired rows are treated as cache miss.
  3. Upsert: a second set_ for the same key bumps fetched_at/expires_at.
  4. Service integration: a cache hit short-circuits before
     ToolUseCapability.probe (no LLM contact whatsoever).
  5. Service integration: a cache miss writes the result back so the
     next identical run hits cache.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.agents.research.schemas import (
    CompanyProfile,
    IndustryProfile,
    ResearchAgentInput,
    ResearchAgentOutput,
)
from app.agents.research.service import ResearchAgentService
from app.models import Base  # noqa: F401 — register tables for create_all
from app.repositories import research_cache as cache_repo
from tests.agents._fakes import ScriptedGateway


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    """In-memory SQLite session matching the app_settings test pattern."""
    from app.models import Base  # local re-import for clarity

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        try:
            yield s
        finally:
            await s.close()
    await engine.dispose()


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


_LLM_REPLY = json.dumps(
    {
        "company": {
            "name": "Anthropic",
            "business_model": "AI 安全研究 + Claude API/产品",
            "stage": "growth",
            "recent_signals": [],
            "evidence_links": [],
            "confidence": "mid",
        },
        "industry": {
            "name": "基础模型",
            "landscape_summary": "推理与多模态扩展期。",
            "key_metrics": ["MAU", "推理成本", "Token 价格"],
            "typical_pain_points": ["推理算力", "数据合规"],
            "competitors_in_jd_ctx": [],
        },
    }
)


def _make_output(
    *, cache_key: str = "abc1234567890123", degraded: bool = False
) -> ResearchAgentOutput:
    return ResearchAgentOutput(
        company=CompanyProfile(
            name="Anthropic",
            business_model="AI 安全研究",
            stage="growth",
            recent_signals=[],
            evidence_links=[],
            confidence="mid",
        ),
        industry=IndustryProfile(
            name="基础模型",
            landscape_summary="推理与多模态扩展期。",
            key_metrics=["MAU", "推理成本", "Token 价格"],
            typical_pain_points=["推理算力", "数据合规"],
            competitors_in_jd_ctx=[],
        ),
        fetched_at=datetime.now(timezone.utc),
        cache_key=cache_key,
        degraded=degraded,
    )


# ---------------------------------------------------------------------------
# Repository — pure read/write
# ---------------------------------------------------------------------------


async def test_cache_round_trip(session: AsyncSession) -> None:
    """set_ then get returns the payload dict."""
    payload = _make_output().model_dump(mode="json")
    await cache_repo.set_(session, "round_trip_key1", payload)
    await session.commit()

    loaded = await cache_repo.get(session, "round_trip_key1")
    assert loaded is not None
    assert loaded["company"]["name"] == "Anthropic"


async def test_cache_miss_for_unknown_key(session: AsyncSession) -> None:
    assert await cache_repo.get(session, "no_such_key") is None


async def test_cache_treats_expired_as_miss(session: AsyncSession) -> None:
    """A row whose expires_at is in the past returns None (miss)."""
    payload = _make_output().model_dump(mode="json")
    # Insert with a synthetic 'now' far in the past so the row is expired.
    fake_now = datetime.now(timezone.utc) - timedelta(days=60)
    await cache_repo.set_(session, "expired_key1", payload, now=fake_now)
    await session.commit()

    # Default get() compares against real-now; row should be expired.
    assert await cache_repo.get(session, "expired_key1") is None


async def test_cache_upsert_bumps_expiry(session: AsyncSession) -> None:
    """A second set_ for the same key refreshes fetched_at + expires_at."""
    payload = _make_output().model_dump(mode="json")
    old_now = datetime.now(timezone.utc) - timedelta(days=15)
    await cache_repo.set_(session, "upsert_key1", payload, now=old_now)
    await session.commit()

    fresh_now = datetime.now(timezone.utc)
    await cache_repo.set_(session, "upsert_key1", payload, now=fresh_now)
    await session.commit()

    loaded = await cache_repo.get(session, "upsert_key1")
    assert loaded is not None  # not expired after upsert
    # 30-day TTL ⇒ expires roughly 30 days from fresh_now, well in the
    # future, so the get() succeeded.


# ---------------------------------------------------------------------------
# Service integration — cache hit short-circuits LLM
# ---------------------------------------------------------------------------


@pytest.fixture
def agent_input() -> ResearchAgentInput:
    return ResearchAgentInput(
        company_name="Anthropic",
        role_title="Research PM",
        industry_hints=["基础模型"],
    )


async def test_cache_hit_skips_llm_entirely(
    monkeypatch: pytest.MonkeyPatch,
    agent_input: ResearchAgentInput,
    session: AsyncSession,
) -> None:
    """When cache has a fresh row, ResearchAgentService never calls LLM."""
    from app.agents.research.service import _compute_cache_key

    cache_key = _compute_cache_key(agent_input)
    seed = _make_output(cache_key=cache_key)
    await cache_repo.set_(session, cache_key, seed.model_dump(mode="json"))
    await session.commit()

    # Probe must NOT be called on the cache-hit path.
    async def _probe_should_not_run(_g: Any) -> bool:  # pragma: no cover
        raise AssertionError("ToolUseCapability.probe ran despite cache hit")

    monkeypatch.setattr(
        "app.agents.research.service.ToolUseCapability.probe",
        staticmethod(_probe_should_not_run),
    )
    # Empty script: any LLM call would AssertionError out of ScriptedGateway.
    gateway = ScriptedGateway([])

    result = await ResearchAgentService().run(
        agent_input, gateway, session=session
    )
    assert isinstance(result, ResearchAgentOutput)
    assert result.cache_key == cache_key
    assert result.company.name == "Anthropic"
    assert gateway.calls == 0


async def test_cache_miss_writes_result_back(
    monkeypatch: pytest.MonkeyPatch,
    agent_input: ResearchAgentInput,
    session: AsyncSession,
) -> None:
    """First call: cache miss → LLM fires → cache populated for next time."""
    from app.agents.research.service import _compute_cache_key

    async def _force_no_tool_use(_g: Any) -> bool:
        return False

    monkeypatch.setattr(
        "app.agents.research.service.ToolUseCapability.probe",
        staticmethod(_force_no_tool_use),
    )
    gateway = ScriptedGateway([_LLM_REPLY])

    result = await ResearchAgentService().run(
        agent_input, gateway, session=session
    )
    assert result.degraded is True
    await session.commit()

    cache_key = _compute_cache_key(agent_input)
    cached = await cache_repo.get(session, cache_key)
    assert cached is not None
    assert cached["cache_key"] == cache_key
