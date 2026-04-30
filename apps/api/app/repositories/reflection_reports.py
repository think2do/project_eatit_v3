"""ReflectionReport repository — F-322 / V32.M3.2.2.

Implements ``ReflectionReportRepository`` Protocol declared in
``app.domain.reflection.service``. Backed by the ``reflection_reports``
table created by the 20260501_0001 migration.

Lifecycle methods mirror the Reflection trigger's state machine:
``running`` (LLM call in flight) → ``ok`` / ``failed``. Each method
opens a short-lived session via the supplied factory because the trigger
runs as a fire-and-forget ``asyncio.Task`` outside the request scope.
"""
from __future__ import annotations

from datetime import datetime, timezone

import uuid_utils as uuid7_utils
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.reflection.schemas import ReflectionReport, ReflectionStatus
from app.domain.reflection.service import ReflectionReportRepository
from app.models.reflection_report import ReflectionReportRow


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _row_to_payload(row: ReflectionReportRow) -> ReflectionReport | None:
    """Project a SQLAlchemy row back to the Pydantic schema clients see.

    Returns ``None`` when the JSON payload doesn't satisfy the schema —
    callers treat that the same as a missing row (re-run replaces).
    """
    payload = dict(row.payload or {})
    payload["report_id"] = str(row.id)
    payload["session_id"] = row.session_id
    payload["status"] = row.status
    payload["generated_at"] = row.generated_at.isoformat()
    try:
        return ReflectionReport.model_validate(payload)
    except Exception:
        return None


class SqlAlchemyReflectionReportRepository(ReflectionReportRepository):
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._factory = session_factory

    async def get_by_session(self, session_id: str) -> ReflectionReport | None:
        async with self._factory() as session:
            row = (
                await session.execute(
                    select(ReflectionReportRow).where(
                        ReflectionReportRow.session_id == session_id
                    )
                )
            ).scalar_one_or_none()
        if row is None:
            return None
        return _row_to_payload(row)

    async def _upsert(
        self,
        session_id: str,
        *,
        status: ReflectionStatus,
        payload: dict,
        generated_at: datetime | None = None,
    ) -> None:
        """Upsert by session_id (UNIQUE). Inserts a new uuid7 row when
        absent; otherwise overwrites in place. Caller commits."""
        async with self._factory() as session:
            row = (
                await session.execute(
                    select(ReflectionReportRow).where(
                        ReflectionReportRow.session_id == session_id
                    )
                )
            ).scalar_one_or_none()
            now = _now()
            if row is None:
                row = ReflectionReportRow(
                    id=str(uuid7_utils.uuid7()),
                    session_id=session_id,
                    payload=payload,
                    status=status,
                    generated_at=generated_at or now,
                )
                session.add(row)
            else:
                row.status = status
                row.payload = payload
                if generated_at is not None:
                    row.generated_at = generated_at
            await session.commit()

    async def upsert_running(self, session_id: str) -> None:
        # Placeholder copy used when no prior payload exists. Required so
        # the Pydantic shape round-trips through ``get_by_session`` while
        # the LLM call is in flight; consumers branch on ``status`` to
        # decide whether to render the placeholder text.
        running_placeholder = {
            "executive_summary": "(详细复盘正在生成,请稍后刷新...)",
            "per_question_coaching": [],
            "general_growth_advice": (
                "正在汇总本场对话与报告关键评价,几秒后再次访问即可查看完整复盘。"
            ),
            "mock_followup_dialogue": [],
        }
        async with self._factory() as session:
            row = (
                await session.execute(
                    select(ReflectionReportRow).where(
                        ReflectionReportRow.session_id == session_id
                    )
                )
            ).scalar_one_or_none()
            if row is None:
                row = ReflectionReportRow(
                    id=str(uuid7_utils.uuid7()),
                    session_id=session_id,
                    payload=running_placeholder,
                    status="running",
                    generated_at=_now(),
                )
                session.add(row)
            else:
                row.status = "running"
            await session.commit()

    async def upsert_ok(self, payload: ReflectionReport) -> None:
        # Strip the metadata fields from the payload blob — they live as
        # columns. Keeps the JSON forward-compatible with future schema
        # iterations that don't want to re-key on the metadata.
        json_payload = payload.model_dump(mode="json")
        for k in ("report_id", "session_id", "status", "generated_at"):
            json_payload.pop(k, None)
        await self._upsert(
            payload.session_id,
            status="ok",
            payload=json_payload,
            generated_at=payload.generated_at,
        )

    async def upsert_failed(self, session_id: str) -> None:
        failed_placeholder = {
            "executive_summary": "(本次详细复盘生成失败,稍后会自动重试)",
            "per_question_coaching": [],
            "general_growth_advice": (
                "复盘生成失败不影响报告查看;下次完成报告会自动重试。"
            ),
            "mock_followup_dialogue": [],
        }
        async with self._factory() as session:
            row = (
                await session.execute(
                    select(ReflectionReportRow).where(
                        ReflectionReportRow.session_id == session_id
                    )
                )
            ).scalar_one_or_none()
            if row is None:
                row = ReflectionReportRow(
                    id=str(uuid7_utils.uuid7()),
                    session_id=session_id,
                    payload=failed_placeholder,
                    status="failed",
                    generated_at=_now(),
                )
                session.add(row)
            else:
                row.status = "failed"
                # Keep the existing payload (running placeholder) — the
                # client renders the empty / retry CTA based on ``status``.
            await session.commit()


__all__ = ["SqlAlchemyReflectionReportRepository"]
