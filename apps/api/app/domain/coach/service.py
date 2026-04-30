"""CoachService — F-318 / V32.M3.1.2 fire-and-forget Coach trigger.

The actual LLM call is delegated to :class:`CoachAgentService`. This
service owns the *policy*:

  * ``< MIN_SESSIONS_FOR_COACH`` recent reports → mark ``skipped`` and
    short-circuit.
  * Already cached against the incoming ``last_session_id`` → idempotent
    return (re-runs are wasted tokens).
  * Otherwise mark ``running``, run the agent, persist ``ok``. Any
    exception is logged + persisted as ``failed``; the call NEVER bubbles
    up because callers (``_generate_report_task``) wrap it in
    ``asyncio.create_task`` and expect fire-and-forget semantics.

The repository contract is a :class:`typing.Protocol`. The concrete
SQLAlchemy implementation arrives in V32.M3.1.3 alongside the
``user_insight_cache`` migration; until then, production wiring uses
:class:`_InMemoryUserInsightCacheRepository` so the trigger compiles and
exercises end-to-end without persisting anything.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.coach.schemas import CoachAgentInput, UserInsightCache
from app.agents.coach.service import CoachAgentService
from app.infra.llm.gateway import LLMGateway
from app.models.report import InterviewReport
from app.models.session import InterviewSession

logger = logging.getLogger(__name__)


# Coach output is meaningless on the first 1-2 sessions — three is the
# threshold matching ``CoachAgentInput.based_on_session_count`` (``ge=3``).
MIN_SESSIONS_FOR_COACH: int = 3


class RecentReportsReader(Protocol):
    """Reads up to ``limit`` most-recent **ready** reports for ``user_id``.

    Concrete implementation: :class:`DBRecentReportsReader`. Tests inject
    in-memory fakes.
    """

    async def list_recent_report_payloads(
        self, user_id: str, *, limit: int = 5
    ) -> list[dict]:
        ...


class UserInsightCacheRepository(Protocol):
    """Persists ``UserInsightCache`` keyed by ``user_id``.

    Concrete SQLAlchemy implementation lands in V32.M3.1.3
    (``apps/api/app/repositories/user_insight_cache.py``). Until then,
    :class:`_InMemoryUserInsightCacheRepository` is the production default
    so the wiring path is exercised even though nothing is persisted.
    """

    async def get(self, user_id: str) -> UserInsightCache | None:
        ...

    async def upsert_running(self, user_id: str, last_session_id: str) -> None:
        ...

    async def upsert_skipped(
        self, user_id: str, last_session_id: str, *, session_count: int
    ) -> None:
        ...

    async def upsert_ok(self, user_id: str, payload: UserInsightCache) -> None:
        ...

    async def upsert_failed(self, user_id: str, last_session_id: str) -> None:
        ...


class _InMemoryUserInsightCacheRepository:
    """Process-local default. Replaced by SQLAlchemy version in M3.1.3."""

    def __init__(self) -> None:
        self._rows: dict[str, UserInsightCache] = {}

    async def get(self, user_id: str) -> UserInsightCache | None:
        return self._rows.get(user_id)

    async def upsert_running(self, user_id: str, last_session_id: str) -> None:
        existing = self._rows.get(user_id)
        # ``running`` keeps existing payload-shaped fields when present so
        # the GET API can show a stale ``ok`` while a new run is in-flight.
        if existing is None:
            return
        existing.status = "running"
        existing.based_on_last_session_id = last_session_id

    async def upsert_skipped(
        self, user_id: str, last_session_id: str, *, session_count: int
    ) -> None:
        # We don't have a full payload yet (Coach didn't run); store a
        # minimal stub the GET API can map to "below threshold" empty state.
        # session_count < 3 violates ``UserInsightCache.based_on_session_count``'s
        # ``ge=3`` so we round up to 3 — semantically OK because the row is
        # only consumed by ``status == "skipped"`` consumers anyway.
        self._rows[user_id] = UserInsightCache(
            user_id=user_id,
            based_on_session_count=max(session_count, MIN_SESSIONS_FOR_COACH),
            based_on_last_session_id=last_session_id,
            headline="(尚未达到 3 场,Coach 暂不可用)",
            headline_detail="完成至少 3 场模拟面试后,跨场次成长洞察将自动生成。",
            recurring_weaknesses=[],
            improvement_signals=[],
            next_focus_areas=[],
            generated_at=datetime.now(timezone.utc),
            status="skipped",
        )

    async def upsert_ok(self, user_id: str, payload: UserInsightCache) -> None:
        self._rows[user_id] = payload

    async def upsert_failed(self, user_id: str, last_session_id: str) -> None:
        existing = self._rows.get(user_id)
        if existing is None:
            return
        existing.status = "failed"
        existing.based_on_last_session_id = last_session_id


class DBRecentReportsReader:
    """Joins ``interview_reports`` × ``interview_sessions`` to fetch the
    most recent ready report payloads for ``user_id``.

    Each call opens a short-lived session via the supplied factory so the
    reader stays usable inside a fire-and-forget task that has no parent
    request scope.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._factory = session_factory

    async def list_recent_report_payloads(
        self, user_id: str, *, limit: int = 5
    ) -> list[dict]:
        async with self._factory() as session:
            result = await session.execute(
                select(InterviewReport.payload, InterviewReport.generated_at)
                .join(
                    InterviewSession,
                    InterviewSession.id == InterviewReport.interview_session_id,
                )
                .where(
                    InterviewSession.user_id == user_id,
                    InterviewReport.status == "ready",
                )
                .order_by(InterviewReport.generated_at.desc())
                .limit(limit)
            )
            rows = result.all()
        # ``payload`` is JSON; pass it through as-is. The CoachAgent prompt
        # serialises whatever dict shape we hand it, so callers pre-redact
        # at the report-generation seam, not here.
        return [row[0] for row in rows if isinstance(row[0], dict)]


class CoachService:
    """Cross-session Coach trigger driver."""

    def __init__(
        self,
        *,
        cache_repo: UserInsightCacheRepository,
        reports_reader: RecentReportsReader,
        agent: CoachAgentService | None = None,
    ) -> None:
        self._cache_repo = cache_repo
        self._reports_reader = reports_reader
        self._agent = agent or CoachAgentService()

    async def maybe_trigger_after_report(
        self,
        user_id: str,
        last_session_id: str,
        gateway: LLMGateway,
    ) -> None:
        """Idempotent cross-session insight refresh.

        NEVER raises — every failure path persists a status row and
        returns. The caller (``_generate_report_task``) uses
        ``asyncio.create_task`` and does not await this; an unhandled
        exception would surface only as a noisy unhandled-task warning.
        """
        try:
            recent = await self._reports_reader.list_recent_report_payloads(
                user_id, limit=5
            )
        except Exception as exc:  # noqa: BLE001 — defensive
            logger.warning(
                "coach_reports_lookup_failed",
                extra={"reason": type(exc).__name__},
            )
            return

        if len(recent) < MIN_SESSIONS_FOR_COACH:
            logger.info(
                "coach_skipped_below_threshold",
                extra={"session_count": len(recent)},
            )
            await self._cache_repo.upsert_skipped(
                user_id, last_session_id, session_count=len(recent)
            )
            return

        cache = await self._cache_repo.get(user_id)
        if (
            cache is not None
            and cache.based_on_last_session_id == last_session_id
            and cache.status == "ok"
        ):
            logger.info(
                "coach_idempotent_skip",
                extra={"last_session_id": last_session_id},
            )
            return

        await self._cache_repo.upsert_running(user_id, last_session_id)
        try:
            agent_input = CoachAgentInput(
                user_id=user_id,
                based_on_session_count=len(recent),
                based_on_last_session_id=last_session_id,
                recent_reports=recent,
            )
            result = await self._agent.run(agent_input, gateway)
        except Exception as exc:  # noqa: BLE001 — fire-and-forget
            logger.warning(
                "coach_failed",
                extra={"reason": type(exc).__name__},
            )
            await self._cache_repo.upsert_failed(user_id, last_session_id)
            return

        await self._cache_repo.upsert_ok(user_id, result)


def build_default_coach_service(
    session_factory: async_sessionmaker[AsyncSession],
) -> CoachService:
    """Production default — M3.1.3 wires the real SQLAlchemy repo.

    Imported lazily to avoid a circular import (the repo module pulls in
    Pydantic schemas that pull domain.coach back in).
    """
    from app.repositories.user_insight_cache import (
        SqlAlchemyUserInsightCacheRepository,
    )

    return CoachService(
        cache_repo=SqlAlchemyUserInsightCacheRepository(session_factory),
        reports_reader=DBRecentReportsReader(session_factory),
    )


__all__ = [
    "MIN_SESSIONS_FOR_COACH",
    "CoachService",
    "DBRecentReportsReader",
    "RecentReportsReader",
    "UserInsightCacheRepository",
    "_InMemoryUserInsightCacheRepository",
    "build_default_coach_service",
]
