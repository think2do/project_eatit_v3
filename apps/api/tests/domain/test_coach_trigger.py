"""V32.M3.1.2 — CoachService.maybe_trigger_after_report tests (F-318).

Three guarantees this file enforces:

  1. **Below threshold (<3 ready reports)** → ``upsert_skipped`` and
     short-circuit. Coach Agent is NOT invoked. Token spend = 0.
  2. **Idempotent** — when the cache row's ``based_on_last_session_id``
     already matches the incoming session id (and ``status == "ok"``),
     re-running is a no-op.
  3. **Failure non-fatal** — when the agent raises (LLM timeout, key
     refused, etc.) the trigger persists ``failed`` but does NOT bubble
     up. The fire-and-forget caller in ``_generate_report_task`` will
     never see the report status flip away from ``READY``.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

from app.agents.coach.schemas import UserInsightCache
from app.domain.coach.service import (
    CoachService,
    MIN_SESSIONS_FOR_COACH,
    _InMemoryUserInsightCacheRepository,
)
from app.infra.llm.gateway import LLMGateway


class _StubGateway(LLMGateway):
    async def complete(
        self, messages: list[dict[str, Any]], **_kwargs: Any
    ) -> Any:
        raise AssertionError(
            "trigger tests inject the agent directly; gateway must not be hit"
        )


class _ListReader:
    def __init__(self, payloads: list[dict]) -> None:
        self._payloads = payloads
        self.calls = 0

    async def list_recent_report_payloads(
        self, user_id: str, *, limit: int = 5
    ) -> list[dict]:
        self.calls += 1
        return list(self._payloads)


class _RaisingReader:
    async def list_recent_report_payloads(
        self, user_id: str, *, limit: int = 5
    ) -> list[dict]:
        raise RuntimeError("DB exploded")


class _StubAgent:
    """Stand-in for ``CoachAgentService``. Captures invocations and
    returns a fixed payload (or raises a programmed exception)."""

    def __init__(
        self,
        *,
        result: UserInsightCache | None = None,
        raises: BaseException | None = None,
    ) -> None:
        self._result = result
        self._raises = raises
        self.calls = 0

    async def run(self, agent_input: Any, gateway: Any) -> UserInsightCache:
        self.calls += 1
        if self._raises is not None:
            raise self._raises
        if self._result is None:
            raise AssertionError("StubAgent has no scripted result")
        return self._result


def _ok_payload(user_id: str = "u-1", last_session_id: str = "s-3") -> UserInsightCache:
    return UserInsightCache(
        user_id=user_id,
        based_on_session_count=3,
        based_on_last_session_id=last_session_id,
        headline="继续围绕数据驱动方向做专项训练",
        headline_detail="近三场表现稳定提升,建议针对业务直觉与跨职能协作题做 2-3 场",
        recurring_weaknesses=["指标拆解深度不足"],
        improvement_signals=["近三场结构化表达稳定提升"],
        next_focus_areas=["data-driven"],
        generated_at=datetime.now(timezone.utc),
        status="ok",
    )


# ---------------------------------------------------------------------------
# Below-threshold path
# ---------------------------------------------------------------------------


async def test_below_threshold_skips_without_calling_agent() -> None:
    """场次<3 → upsert_skipped + 不调用 agent。"""
    cache_repo = _InMemoryUserInsightCacheRepository()
    reader = _ListReader([{"r": 1}, {"r": 2}])  # only 2
    agent = _StubAgent()  # no result; should never be called
    service = CoachService(
        cache_repo=cache_repo, reports_reader=reader, agent=agent  # type: ignore[arg-type]
    )

    await service.maybe_trigger_after_report(
        "u-1", "s-2", _StubGateway()
    )

    assert agent.calls == 0
    assert reader.calls == 1
    cached = await cache_repo.get("u-1")
    assert cached is not None
    assert cached.status == "skipped"
    assert cached.based_on_last_session_id == "s-2"


async def test_below_threshold_session_count_floor() -> None:
    """skipped row 仍然满足 schema ge=3 约束(implementation 取 max)."""
    cache_repo = _InMemoryUserInsightCacheRepository()
    reader = _ListReader([])  # 0 reports
    service = CoachService(
        cache_repo=cache_repo,
        reports_reader=reader,
        agent=_StubAgent(),  # type: ignore[arg-type]
    )
    await service.maybe_trigger_after_report("u-1", "s-0", _StubGateway())
    cached = await cache_repo.get("u-1")
    assert cached is not None
    assert cached.based_on_session_count >= MIN_SESSIONS_FOR_COACH


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


async def test_idempotent_returns_when_cache_already_keyed_to_session() -> None:
    """缓存已经基于 last_session_id ok 过 → 直接 return,不再调 agent。"""
    cache_repo = _InMemoryUserInsightCacheRepository()
    await cache_repo.upsert_ok("u-1", _ok_payload("u-1", "s-3"))
    reader = _ListReader([{"r": i} for i in range(5)])
    agent = _StubAgent(result=_ok_payload("u-1", "s-3"))
    service = CoachService(
        cache_repo=cache_repo, reports_reader=reader, agent=agent  # type: ignore[arg-type]
    )

    await service.maybe_trigger_after_report("u-1", "s-3", _StubGateway())

    assert agent.calls == 0  # idempotent skip
    cached = await cache_repo.get("u-1")
    assert cached is not None
    assert cached.status == "ok"


async def test_new_session_id_breaks_idempotency_and_runs_agent() -> None:
    """新 session_id ≠ 缓存 last_session_id → 重新跑 Coach。"""
    cache_repo = _InMemoryUserInsightCacheRepository()
    await cache_repo.upsert_ok("u-1", _ok_payload("u-1", "s-3"))
    reader = _ListReader([{"r": i} for i in range(5)])
    fresh_payload = _ok_payload("u-1", "s-4")
    agent = _StubAgent(result=fresh_payload)
    service = CoachService(
        cache_repo=cache_repo, reports_reader=reader, agent=agent  # type: ignore[arg-type]
    )

    await service.maybe_trigger_after_report("u-1", "s-4", _StubGateway())

    assert agent.calls == 1
    cached = await cache_repo.get("u-1")
    assert cached is not None
    assert cached.based_on_last_session_id == "s-4"
    assert cached.status == "ok"


# ---------------------------------------------------------------------------
# Failure non-fatal
# ---------------------------------------------------------------------------


async def test_agent_failure_persists_failed_and_returns_quietly() -> None:
    """Agent 抛异常 → upsert_failed + 不上抛(fire-and-forget 语义)."""
    cache_repo = _InMemoryUserInsightCacheRepository()
    # Seed an existing ok row so upsert_failed has something to mutate.
    await cache_repo.upsert_ok("u-1", _ok_payload("u-1", "s-3"))
    reader = _ListReader([{"r": i} for i in range(5)])
    agent = _StubAgent(raises=RuntimeError("LLM timeout"))
    service = CoachService(
        cache_repo=cache_repo, reports_reader=reader, agent=agent  # type: ignore[arg-type]
    )

    # MUST NOT raise.
    await service.maybe_trigger_after_report("u-1", "s-4", _StubGateway())

    assert agent.calls == 1
    cached = await cache_repo.get("u-1")
    assert cached is not None
    assert cached.status == "failed"
    assert cached.based_on_last_session_id == "s-4"


async def test_reports_lookup_failure_does_not_raise() -> None:
    """Reader 抛异常 → 静默吞掉,不让 fire-and-forget caller 看到 unhandled."""
    cache_repo = _InMemoryUserInsightCacheRepository()
    service = CoachService(
        cache_repo=cache_repo,
        reports_reader=_RaisingReader(),
        agent=_StubAgent(),  # type: ignore[arg-type]
    )

    # MUST NOT raise — bubbling up here would surface as an asyncio
    # "Task exception was never retrieved" warning in production logs.
    await service.maybe_trigger_after_report("u-1", "s-3", _StubGateway())


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_happy_path_persists_ok_and_calls_agent_once() -> None:
    """≥3 reports + 缓存空 → 跑 agent + upsert_ok."""
    cache_repo = _InMemoryUserInsightCacheRepository()
    reader = _ListReader([{"r": i} for i in range(3)])
    payload = _ok_payload("u-1", "s-3")
    agent = _StubAgent(result=payload)
    service = CoachService(
        cache_repo=cache_repo, reports_reader=reader, agent=agent  # type: ignore[arg-type]
    )

    await service.maybe_trigger_after_report("u-1", "s-3", _StubGateway())

    assert agent.calls == 1
    cached = await cache_repo.get("u-1")
    assert cached is not None
    assert cached.status == "ok"
    assert cached.based_on_last_session_id == "s-3"
    assert cached.headline.startswith("继续")
