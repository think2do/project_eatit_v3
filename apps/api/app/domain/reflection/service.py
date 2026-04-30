"""ReflectionService — F-322 / V32.M3.2.2 fire-and-forget Reflection trigger.

Mirrors ``CoachService`` (M3.1.2):

  * ``status == "ok"`` already on this session  → idempotent return.
  * Loader yields no input (no report yet, etc.) → log + skip.
  * Otherwise mark ``running``, run the agent, persist ``ok`` (or
    ``failed`` on exception). The trigger NEVER raises — callers
    (``post_report_graph.reflection_node``) treat it as fire-and-forget.

The repository + loader contracts are :class:`typing.Protocol`s so tests
inject scripted fakes; the SQLAlchemy implementations land in
``app.repositories.reflection_reports`` (M3.2.2 alongside this file).
"""
from __future__ import annotations

import logging
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.reflection.schemas import (
    ReflectionAgentInput,
    ReflectionReport,
)
from app.agents.reflection.service import ReflectionAgentService
from app.infra.llm.gateway import LLMGateway
from app.models.report import InterviewReport
from app.models.session import InterviewTurn

logger = logging.getLogger(__name__)


class ReflectionReportLoader(Protocol):
    """Builds a ``ReflectionAgentInput`` for the given session.

    Returns ``None`` when the session has no usable report yet (e.g.
    ``InterviewReport.status != ready``) — the trigger then skips
    quietly rather than upserting an empty placeholder.
    """

    async def build_input(self, session_id: str) -> ReflectionAgentInput | None:
        ...


class ReflectionReportRepository(Protocol):
    """Persists ``ReflectionReport`` keyed on ``session_id``."""

    async def get_by_session(self, session_id: str) -> ReflectionReport | None:
        ...

    async def upsert_running(self, session_id: str) -> None:
        ...

    async def upsert_ok(self, payload: ReflectionReport) -> None:
        ...

    async def upsert_failed(self, session_id: str) -> None:
        ...


# Cap turns sent to the LLM so a marathon session doesn't blow the prompt
# budget. Reflection focuses on warn-toned answers (covered in the first
# 30 turns; longer sessions hit Compression earlier in the pipeline).
MAX_TURNS_FOR_REFLECTION: int = 30


class DBReflectionReportLoader:
    """Reads ``interview_reports`` × ``interview_turns`` to build an
    audit-clean ``ReflectionAgentInput``.

    Each call opens a short-lived session via the supplied factory because
    the trigger runs in a fire-and-forget ``asyncio.Task`` outside the
    request scope.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._factory = session_factory

    async def build_input(self, session_id: str) -> ReflectionAgentInput | None:
        async with self._factory() as session:
            report_row = (
                await session.execute(
                    select(InterviewReport).where(
                        InterviewReport.interview_session_id == session_id
                    )
                )
            ).scalar_one_or_none()
            if report_row is None or not isinstance(report_row.payload, dict):
                return None
            if not report_row.payload:
                return None

            turn_rows = (
                await session.execute(
                    select(InterviewTurn)
                    .where(InterviewTurn.interview_session_id == session_id)
                    .order_by(InterviewTurn.turn_index.asc())
                    .limit(MAX_TURNS_FOR_REFLECTION)
                )
            ).scalars().all()

        turns: list[dict] = [
            {
                "turn_index": t.turn_index,
                "question": t.question_text,
                "answer": t.answer_text or "",
            }
            for t in turn_rows
        ]
        try:
            return ReflectionAgentInput(
                session_id=session_id,
                report_id=str(report_row.id),
                report_payload=dict(report_row.payload),
                turns=turns,
            )
        except Exception as exc:  # noqa: BLE001 — defensive
            logger.warning(
                "reflection_input_build_failed",
                extra={"session_id": session_id, "reason": type(exc).__name__},
            )
            return None


class ReflectionService:
    """Drives the post-report Reflection trigger."""

    def __init__(
        self,
        *,
        repo: ReflectionReportRepository,
        loader: ReflectionReportLoader,
        agent: ReflectionAgentService | None = None,
    ) -> None:
        self._repo = repo
        self._loader = loader
        self._agent = agent or ReflectionAgentService()

    async def trigger_after_report(
        self, session_id: str, gateway: LLMGateway
    ) -> None:
        """Fire-and-forget Reflection refresh. NEVER raises."""
        try:
            existing = await self._repo.get_by_session(session_id)
        except Exception as exc:  # noqa: BLE001 — defensive
            logger.warning(
                "reflection_repo_lookup_failed",
                extra={"session_id": session_id, "reason": type(exc).__name__},
            )
            return

        if existing is not None and existing.status == "ok":
            logger.info(
                "reflection_idempotent_skip",
                extra={"session_id": session_id},
            )
            return

        try:
            agent_input = await self._loader.build_input(session_id)
        except Exception as exc:  # noqa: BLE001 — defensive
            logger.warning(
                "reflection_loader_failed",
                extra={"session_id": session_id, "reason": type(exc).__name__},
            )
            return

        if agent_input is None:
            logger.info(
                "reflection_skipped_no_input",
                extra={"session_id": session_id},
            )
            return

        await self._repo.upsert_running(session_id)
        try:
            result = await self._agent.run(agent_input, gateway)
        except Exception as exc:  # noqa: BLE001 — fire-and-forget
            logger.warning(
                "reflection_failed",
                extra={"session_id": session_id, "reason": type(exc).__name__},
            )
            await self._repo.upsert_failed(session_id)
            return

        await self._repo.upsert_ok(result)


def build_default_reflection_service(
    session_factory: async_sessionmaker[AsyncSession],
) -> ReflectionService:
    """Production default. Lazy import on the repo side avoids the same
    circular-import shape the Coach factory dodged in M3.1.3."""
    from app.repositories.reflection_reports import (
        SqlAlchemyReflectionReportRepository,
    )

    return ReflectionService(
        repo=SqlAlchemyReflectionReportRepository(session_factory),
        loader=DBReflectionReportLoader(session_factory),
    )


__all__ = [
    "DBReflectionReportLoader",
    "MAX_TURNS_FOR_REFLECTION",
    "ReflectionReportLoader",
    "ReflectionReportRepository",
    "ReflectionService",
    "build_default_reflection_service",
]
