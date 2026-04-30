"""UserInsightCache repository — F-318 / V32.M3.1.3.

Implements ``UserInsightCacheRepository`` Protocol declared in
``app.domain.coach.service``. Backed by the ``user_insight_cache`` table
created by the 20260430_0003 migration.

Lifecycle methods mirror the Coach trigger's state machine:
``running`` (LLM call in flight) → ``ok`` / ``failed``; ``skipped`` is
written when the user has < 3 ready reports and the trigger short-
circuits without invoking the agent.

Each method opens a short-lived session via the supplied factory because
the trigger runs as a fire-and-forget ``asyncio.Task`` outside the
request scope.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.coach.schemas import UserInsightCache, UserInsightStatus
from app.domain.coach.service import (
    MIN_SESSIONS_FOR_COACH,
    UserInsightCacheRepository,
)
from app.models.user_insight_cache import UserInsightCacheRow


def _row_to_payload(row: UserInsightCacheRow) -> UserInsightCache:
    """Project a SQLAlchemy row back to the Pydantic schema clients see.

    The row's ``status`` column wins over any ``status`` field embedded
    in the JSON payload — clients should always trust the column for
    rendering decisions.
    """
    payload = dict(row.payload or {})
    payload["user_id"] = row.user_id
    payload["based_on_session_count"] = row.based_on_session_count
    payload["based_on_last_session_id"] = row.based_on_last_session_id
    payload["status"] = row.status
    payload["generated_at"] = row.generated_at.isoformat()
    return UserInsightCache.model_validate(payload)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _upsert(
    session: AsyncSession,
    *,
    user_id: str,
    based_on_session_count: int,
    based_on_last_session_id: str,
    payload: dict,
    status: UserInsightStatus,
    generated_at: datetime,
) -> None:
    """ON CONFLICT upsert keyed on ``user_id`` (PK). SQLite-only dialect."""
    stmt = (
        sqlite_insert(UserInsightCacheRow)
        .values(
            user_id=user_id,
            based_on_session_count=based_on_session_count,
            based_on_last_session_id=based_on_last_session_id,
            payload=payload,
            status=status,
            generated_at=generated_at,
        )
        .on_conflict_do_update(
            index_elements=[UserInsightCacheRow.user_id],
            set_={
                "based_on_session_count": based_on_session_count,
                "based_on_last_session_id": based_on_last_session_id,
                "payload": payload,
                "status": status,
                "generated_at": generated_at,
            },
        )
    )
    await session.execute(stmt)


class SqlAlchemyUserInsightCacheRepository(UserInsightCacheRepository):
    """SQLAlchemy backing for ``UserInsightCacheRepository``.

    Each call manages its own session because the Coach trigger fires
    after the request scope has closed. Writes commit immediately; the
    fire-and-forget caller has no surrounding transaction to bundle into.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._factory = session_factory

    async def get(self, user_id: str) -> UserInsightCache | None:
        async with self._factory() as session:
            result = await session.execute(
                select(UserInsightCacheRow).where(
                    UserInsightCacheRow.user_id == user_id
                )
            )
            row = result.scalar_one_or_none()
        if row is None:
            return None
        try:
            return _row_to_payload(row)
        except Exception:
            # Stale schema in the cache (very early-skipped row, etc.) —
            # treat as absent so the trigger re-runs into a fresh row.
            return None

    async def upsert_running(self, user_id: str, last_session_id: str) -> None:
        # Placeholder copy used when no prior payload exists. The Pydantic
        # ``UserInsightCache`` schema requires headline / headline_detail
        # to be non-empty strings; consumers branch on ``status`` to decide
        # whether to render the placeholder text or fall back to a tip card.
        running_placeholder = {
            "headline": "(Coach 正在生成跨场次成长洞察...)",
            "headline_detail": "正在汇总你近场次表现,几秒后再次刷新即可看到结果。",
            "recurring_weaknesses": [],
            "improvement_signals": [],
            "next_focus_areas": [],
        }
        async with self._factory() as session:
            existing = await session.execute(
                select(UserInsightCacheRow).where(
                    UserInsightCacheRow.user_id == user_id
                )
            )
            row = existing.scalar_one_or_none()
            if row is None:
                await _upsert(
                    session,
                    user_id=user_id,
                    based_on_session_count=MIN_SESSIONS_FOR_COACH,
                    based_on_last_session_id=last_session_id,
                    payload=running_placeholder,
                    status="running",
                    generated_at=_now(),
                )
            else:
                await _upsert(
                    session,
                    user_id=user_id,
                    based_on_session_count=row.based_on_session_count,
                    based_on_last_session_id=last_session_id,
                    payload=dict(row.payload or running_placeholder),
                    status="running",
                    generated_at=row.generated_at,
                )
            await session.commit()

    async def upsert_skipped(
        self, user_id: str, last_session_id: str, *, session_count: int
    ) -> None:
        # Schema requires based_on_session_count ≥ 3; round up so the row
        # round-trips through the Pydantic validator on read. Consumers
        # of "skipped" only render the empty state anyway.
        normalized_count = max(session_count, MIN_SESSIONS_FOR_COACH)
        skipped_payload = {
            "headline": "(尚未达到 3 场,Coach 暂不可用)",
            "headline_detail": "完成至少 3 场模拟面试后,跨场次成长洞察将自动生成。",
            "recurring_weaknesses": [],
            "improvement_signals": [],
            "next_focus_areas": [],
        }
        async with self._factory() as session:
            await _upsert(
                session,
                user_id=user_id,
                based_on_session_count=normalized_count,
                based_on_last_session_id=last_session_id,
                payload=skipped_payload,
                status="skipped",
                generated_at=_now(),
            )
            await session.commit()

    async def upsert_ok(self, user_id: str, payload: UserInsightCache) -> None:
        # Strip the metadata fields from the payload blob — they live as
        # columns. Keeping them out of the JSON keeps the row consistent
        # if a future migration wants to index any of them.
        json_payload = payload.model_dump(mode="json")
        for k in (
            "user_id",
            "based_on_session_count",
            "based_on_last_session_id",
            "status",
            "generated_at",
        ):
            json_payload.pop(k, None)
        async with self._factory() as session:
            await _upsert(
                session,
                user_id=user_id,
                based_on_session_count=payload.based_on_session_count,
                based_on_last_session_id=payload.based_on_last_session_id,
                payload=json_payload,
                status="ok",
                generated_at=payload.generated_at,
            )
            await session.commit()

    async def upsert_failed(self, user_id: str, last_session_id: str) -> None:
        failed_placeholder = {
            "headline": "(本次成长洞察生成失败,稍后会自动重试)",
            "headline_detail": "近场次报告已就绪,但 Coach 调用失败;可在下一次完成报告后再触发。",
            "recurring_weaknesses": [],
            "improvement_signals": [],
            "next_focus_areas": [],
        }
        async with self._factory() as session:
            existing = await session.execute(
                select(UserInsightCacheRow).where(
                    UserInsightCacheRow.user_id == user_id
                )
            )
            row = existing.scalar_one_or_none()
            if row is None:
                await _upsert(
                    session,
                    user_id=user_id,
                    based_on_session_count=MIN_SESSIONS_FOR_COACH,
                    based_on_last_session_id=last_session_id,
                    payload=failed_placeholder,
                    status="failed",
                    generated_at=_now(),
                )
            else:
                await _upsert(
                    session,
                    user_id=user_id,
                    based_on_session_count=row.based_on_session_count,
                    based_on_last_session_id=last_session_id,
                    payload=dict(row.payload or failed_placeholder),
                    status="failed",
                    generated_at=row.generated_at,
                )
            await session.commit()


__all__ = ["SqlAlchemyUserInsightCacheRepository"]
