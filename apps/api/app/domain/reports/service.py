from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.report.schemas import ReportAgentInput, ReportAgentOutput
from app.agents.report.service import ReportAgentService
from app.api.dependencies.auth import AuthenticatedUser
from app.infra.db import AsyncSessionFactory
from app.infra.llm import LLMConfig, build_gateway
from app.infra.tasks import TaskQueueInterface
from app.models.enums import InterviewReportStatus, InterviewSessionStatus
from app.models.report import InterviewReport
from app.models.session import DirectionFramework, InterviewSession
from app.schemas.reports import (
    Chip,
    DimensionScore,
    InterviewReportPayload,
    InterviewReportResponse,
    PassLikelihood,
    ReportReason,
    ReportStatusResponse,
    TriggerReportRequest,
    TriggerReportResponse,
)


logger = logging.getLogger(__name__)


# F-314 L0 ethical guardrail. The user-facing "通过可能性" indicator is
# strictly one of three tiers — anything else (a number, "不建议", "不通过",
# any English negative, etc.) must be force-coerced to a tier here at the
# service boundary.
VALID_PASS_LIKELIHOOD: frozenset[str] = frozenset({"中上", "中", "中下"})


def derive_pass_likelihood(
    overall_score: int | None,
    match_score: int | None,
) -> Literal["中上", "中", "中下"]:
    """Compute pass_likelihood from overall_score + match_score.

    Never returns "不建议" or any non-3-tier value (L0 ethical guardrail).
    The thresholds intentionally bottom out at "中下" instead of dropping
    into a lower tier — the design system has no fourth option.
    """
    o = overall_score or 0
    m = match_score or 0
    if o >= 80 and m >= 75:
        return "中上"
    if o >= 65 and m >= 60:
        return "中"
    return "中下"


def coerce_pass_likelihood(
    raw: str | None,
    overall_score: int | None,
    match_score: int | None,
) -> Literal["中上", "中", "中下"]:
    """Validate LLM output; force-override illegal values to derive result.

    Logs a WARN on every override so production can monitor LLM drift
    against the L0 guardrail. Always returns one of the three legal tiers.
    """
    if raw in VALID_PASS_LIKELIHOOD:
        # mypy / Pyright can narrow to Literal once the membership check
        # has run, but the cast keeps the annotation explicit for callers.
        return raw  # type: ignore[return-value]
    derived = derive_pass_likelihood(overall_score, match_score)
    logger.warning(
        "pass_likelihood illegal value %r overridden to %r (overall=%s match=%s)",
        raw,
        derived,
        overall_score,
        match_score,
    )
    return derived


# F-312 V32.M1.3 — five-dimension scorecard. The names below are an
# A8 L0 red line and must stay in lock-step with `DIMENSION_NAMES`
# Literal in app.schemas.reports.
DEFAULT_DIMENSION_NAMES: tuple[str, ...] = (
    "专业深度",
    "结构化表达",
    "批判性思考",
    "业务直觉",
    "沟通节奏",
)


def normalize_dimensions(raw: list[DimensionScore]) -> list[DimensionScore]:
    """Pad an LLM-supplied dimension list to exactly 5 items in order.

    The LLM is instructed to emit all five dimensions, but Instructor
    occasionally returns < 5 (truncation, schema drift, etc.). Rather
    than silently dropping the report, we project whatever the LLM
    gave us into a fixed 5-slot list (canonical order) and fill the
    gaps with score=50, description="评分异常,默认中性",
    evidence_chips=[Chip(text="数据不足", good=False)]. A WARN log
    fires per missing dimension so production drift can be monitored.

    Returns 5 items unconditionally — callers are expected to guard
    `if not raw: payload.dimensions = []` upstream when they want
    the empty-state for v3.1 legacy reports.
    """
    by_name = {d.name: d for d in raw}
    out: list[DimensionScore] = []
    for name in DEFAULT_DIMENSION_NAMES:
        if name in by_name:
            out.append(by_name[name])
        else:
            logger.warning("Dimension %r missing, padding with 50", name)
            out.append(
                DimensionScore(
                    name=name,  # type: ignore[arg-type]  # checked at runtime
                    description="评分异常,默认中性",
                    score=50,
                    evidence_chips=[Chip(text="数据不足", good=False)],
                )
            )
    assert len(out) == 5
    return out


class ReportsService:
    async def trigger_report(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        task_queue: TaskQueueInterface,
        session_id: UUID,
        request: TriggerReportRequest,
        llm_config: LLMConfig,
    ) -> TriggerReportResponse:
        interview_session = await self._get_owned_session(session, current_user, str(session_id))
        # Capture the PK before any commit/rollback — after a rollback every
        # attribute on `interview_session` is expired, and async lazy-load
        # from a non-greenlet context would raise MissingGreenlet.
        interview_session_pk = interview_session.id
        now = datetime.now(UTC)

        result = await session.execute(
            select(InterviewReport).where(
                InterviewReport.interview_session_id == interview_session_pk
            )
        )
        report = result.scalar_one_or_none()
        if report is None:
            report = InterviewReport(
                interview_session_id=interview_session_pk,
                status=InterviewReportStatus.GENERATING,
                requested_at=now,
                generated_at=None,
                payload={},
            )
            session.add(report)
        elif request.force_regenerate or report.status != InterviewReportStatus.GENERATING:
            report.status = InterviewReportStatus.GENERATING
            report.requested_at = now
            report.generated_at = None
            report.payload = {}

        interview_session.status = InterviewSessionStatus.REPORT_GENERATING
        try:
            await session.commit()
        except IntegrityError:
            # Race: a concurrent POST /report for the same session inserted
            # first. Rollback expires every attribute of the in-session
            # objects, so we must re-select both rather than reuse the stale
            # references.
            await session.rollback()
            result = await session.execute(
                select(InterviewReport).where(
                    InterviewReport.interview_session_id == interview_session_pk
                )
            )
            report = result.scalar_one()
            session_result = await session.execute(
                select(InterviewSession).where(InterviewSession.id == interview_session_pk)
            )
            interview_session = session_result.scalar_one()
            if request.force_regenerate or report.status != InterviewReportStatus.GENERATING:
                report.status = InterviewReportStatus.GENERATING
                report.requested_at = now
                report.generated_at = None
                report.payload = {}
            interview_session.status = InterviewSessionStatus.REPORT_GENERATING
            await session.commit()
        await task_queue.enqueue(
            task_name=f"generate-report:{interview_session_pk}",
            task_factory=lambda: self._generate_report_task(
                interview_session_pk, llm_config
            ),
        )

        return TriggerReportResponse(
            session_id=interview_session_pk,
            status=InterviewReportStatus.GENERATING,
            requested_at=now,
        )

    async def get_report(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        session_id: UUID,
    ) -> InterviewReportResponse:
        interview_session = await self._get_owned_session(session, current_user, str(session_id))
        result = await session.execute(
            select(InterviewReport).where(InterviewReport.interview_session_id == interview_session.id)
        )
        report = result.scalar_one_or_none()
        if report is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
        if report.status != InterviewReportStatus.READY or not report.payload:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Report is still generating.",
            )

        return InterviewReportResponse(
            id=report.id,
            created_at=report.created_at,
            updated_at=report.updated_at,
            interview_session_id=report.interview_session_id,
            status=report.status,
            requested_at=report.requested_at,
            generated_at=report.generated_at,
            payload=InterviewReportPayload.model_validate(report.payload),
        )

    async def get_report_status(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        session_id: UUID,
    ) -> ReportStatusResponse:
        interview_session = await self._get_owned_session(session, current_user, str(session_id))
        result = await session.execute(
            select(InterviewReport).where(InterviewReport.interview_session_id == interview_session.id)
        )
        report = result.scalar_one_or_none()
        if report is None:
            return ReportStatusResponse(
                session_id=interview_session.id,
                status=InterviewReportStatus.PENDING,
                has_payload=False,
            )
        return ReportStatusResponse(
            session_id=interview_session.id,
            status=report.status,
            has_payload=bool(report.payload),
        )

    async def _get_owned_session(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        session_id: str,
    ) -> InterviewSession:
        result = await session.execute(
            select(InterviewSession)
            .options(selectinload(InterviewSession.report))
            .where(
                InterviewSession.id == session_id,
                InterviewSession.user_id == current_user.id,
            )
        )
        interview_session = result.scalar_one_or_none()
        if interview_session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
        return interview_session

    async def _generate_report_task(
        self, session_id: str, llm_config: LLMConfig
    ) -> None:
        async with AsyncSessionFactory() as session:
            result = await session.execute(
                select(InterviewSession).where(InterviewSession.id == session_id)
            )
            interview_session = result.scalar_one_or_none()
            if interview_session is None:
                return

            # Capture PK up front — after a rollback, attribute access on
            # `interview_session` triggers async lazy-load from a
            # non-greenlet context (MissingGreenlet).
            interview_session_pk = interview_session.id

            framework_json = await self._load_agent_framework_json(session, interview_session_pk)

            agent_output = await ReportAgentService().run(
                ReportAgentInput(
                    parse_payload_json="{}",
                    framework_json=framework_json,
                    turns=[],
                    long_term_summary=None,
                ),
                build_gateway(llm_config),
            )
            payload = self._agent_to_report_payload(agent_output)

            now = datetime.now(UTC)
            result = await session.execute(
                select(InterviewReport).where(
                    InterviewReport.interview_session_id == interview_session_pk
                )
            )
            report = result.scalar_one_or_none()
            if report is None:
                report = InterviewReport(
                    interview_session_id=interview_session_pk,
                    status=InterviewReportStatus.READY,
                    requested_at=now,
                    generated_at=now,
                    payload=payload.model_dump(mode="json"),
                )
                session.add(report)
            else:
                report.status = InterviewReportStatus.READY
                report.generated_at = now
                report.payload = payload.model_dump(mode="json")
                if report.requested_at is None:
                    report.requested_at = now

            interview_session.status = InterviewSessionStatus.REPORT_READY
            try:
                await session.commit()
            except IntegrityError:
                # Race: trigger_report's INSERT landed while we were preparing
                # ours. Re-fetch both rows (the expired proxies can't be
                # reused) and apply the READY payload we already generated.
                await session.rollback()
                result = await session.execute(
                    select(InterviewReport).where(
                        InterviewReport.interview_session_id == interview_session_pk
                    )
                )
                report = result.scalar_one()
                session_result = await session.execute(
                    select(InterviewSession).where(InterviewSession.id == interview_session_pk)
                )
                interview_session = session_result.scalar_one()
                report.status = InterviewReportStatus.READY
                report.generated_at = now
                report.payload = payload.model_dump(mode="json")
                if report.requested_at is None:
                    report.requested_at = now
                interview_session.status = InterviewSessionStatus.REPORT_READY
                await session.commit()

    @staticmethod
    async def _load_agent_framework_json(
        session: AsyncSession, interview_session_id: str
    ) -> str:
        result = await session.execute(
            select(DirectionFramework).where(
                DirectionFramework.interview_session_id == interview_session_id
            )
        )
        row = result.scalar_one_or_none()
        if row is None or not isinstance(row.payload, dict):
            return "{}"
        # Prefer the agent-shaped subtree when present; fall back to the
        # legacy payload for rows created before P3.5.
        import json as _json

        agent_payload = row.payload.get("agent") if "agent" in row.payload else row.payload
        return _json.dumps(agent_payload, ensure_ascii=False)

    @staticmethod
    def _agent_to_report_payload(agent_output: ReportAgentOutput) -> InterviewReportPayload:
        """Map the agent's report shape to the legacy REST envelope.

        `overall_summary` / `next_actions` map directly. `pass_probability`
        and `reasons` were added to the REST schema in P3.5 so callers
        can surface the evidence-linked verdicts. Strengths / improvements
        are synthesized from the reasons' verdicts so the existing UI
        pills keep rendering with useful content.
        """
        reasons = [
            ReportReason(
                aspect=r.aspect,
                verdict=r.verdict,
                evidence_turn_index=r.evidence_turn_index,
                quote=r.quote,
            )
            for r in agent_output.reasons
        ]
        strengths = [r.aspect for r in agent_output.reasons if r.verdict in ("strong", "solid")]
        improvements = [r.aspect for r in agent_output.reasons if r.verdict in ("mixed", "weak")]
        # F-314: derive pass_likelihood at the service boundary so we never
        # surface a raw number or a non-tiered string. match_score is not
        # yet wired through the parse agent (M1.x), so until then we use
        # overall_score (or pass_probability when overall_score is None)
        # as a proxy for both axes. Both fall to "中下" when LLM output is
        # blank, which is L0-compliant.
        overall = (
            agent_output.overall_score
            if agent_output.overall_score is not None
            else agent_output.pass_probability
        )
        match = overall
        pass_likelihood: PassLikelihood = coerce_pass_likelihood(
            agent_output.pass_likelihood, overall, match
        )
        # F-312 / F-313: pad dimensions to 5 when the LLM emitted any,
        # preserve [] for v3.1 legacy reports so the UI can show the
        # empty-state instead of a fake 5-row 50-score wall.
        dimensions = (
            normalize_dimensions(agent_output.dimensions)
            if agent_output.dimensions
            else []
        )
        return InterviewReportPayload(
            overall_summary=agent_output.summary,
            round_reviews=[],
            strengths=strengths,
            improvements=improvements,
            next_actions=list(agent_output.next_actions),
            pass_probability=agent_output.pass_probability,
            reasons=reasons,
            pass_likelihood=pass_likelihood,
            overall_score=agent_output.overall_score,
            ai_verdict=agent_output.ai_verdict,
            dimensions=dimensions,
            round_reviews_v2=list(agent_output.round_reviews_v2),
        )
