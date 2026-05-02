from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.framework.schemas import (
    FrameworkAgentInput,
    FrameworkAgentOutput,
    FrameworkConfigInput,
)
from app.agents.framework.service import FrameworkAgentService
from app.api.dependencies.auth import AuthenticatedUser
from app.infra.llm import LLMGateway
from app.models.asset import CandidateAsset, ParseResult
from app.models.enums import (
    CandidateAssetStatus,
    InterviewSessionStatus,
)
from app.models.session import DirectionFramework, InterviewConfig, InterviewSession
from app.schemas.frameworks import DirectionFramework as DirectionFrameworkSchema
from app.schemas.frameworks import FrameworkStage
from app.schemas.parse import ParseResultPayload
from app.schemas.sessions import (
    CreateSessionRequest,
    CreateSessionResponse,
    EndSessionResponse,
    InterviewConfigResponse,
    SessionDetailResponse,
    SessionListRequest,
    SessionListResponse,
    SessionSummary,
)


class SessionsService:
    async def create_session(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        request: CreateSessionRequest,
        gateway: LLMGateway,
    ) -> CreateSessionResponse:
        asset = await self._get_ready_asset(session, current_user, str(request.asset_bundle_id))
        parse_payload = await self._get_parse_payload(session, asset.id)

        agent_output = await FrameworkAgentService().run(
            FrameworkAgentInput(
                parse_payload_json=parse_payload.model_dump_json(),
                config=FrameworkConfigInput(
                    level="senior",
                    style=str(request.config.style),
                    duration_minutes=request.config.duration_minutes,
                ),
            ),
            gateway,
        )
        framework = self._agent_to_legacy_framework(request, parse_payload, agent_output)

        interview_session = InterviewSession(
            user_id=current_user.id,
            candidate_asset_id=asset.id,
            status=InterviewSessionStatus.CREATED,
            config_snapshot=request.config.model_dump(mode="json"),
        )
        session.add(interview_session)
        await session.flush()

        # v3.2 clients send only `directions: list`. The legacy
        # `InterviewConfig.direction` column is `nullable=False`, so
        # writing None triggers an IntegrityError → 409. Mirror the
        # `_agent_to_legacy_framework` shim: prefer the first v3.2
        # direction, fall back to the legacy field.
        primary_direction = (
            request.config.directions[0]
            if request.config.directions
            else request.config.direction
        )
        session.add(
            InterviewConfig(
                interview_session_id=interview_session.id,
                style=request.config.style,
                direction=primary_direction,
                duration_minutes=request.config.duration_minutes,
            )
        )
        session.add(
            DirectionFramework(
                interview_session_id=interview_session.id,
                payload={
                    "legacy": framework.model_dump(mode="json"),
                    "agent": agent_output.model_dump(mode="json"),
                },
            )
        )
        await session.commit()

        return CreateSessionResponse(
            session_id=interview_session.id,
            status=interview_session.status,
            direction_framework=framework,
        )

    async def get_session(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        session_id: UUID,
    ) -> SessionDetailResponse:
        interview_session = await self._get_owned_session(session, current_user, str(session_id))
        return self._serialize_session_detail(interview_session)

    async def list_sessions(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        query: SessionListRequest,
    ) -> SessionListResponse:
        filters = [InterviewSession.user_id == current_user.id]
        if query.status is not None:
            filters.append(InterviewSession.status == query.status)

        total = await session.scalar(select(func.count()).select_from(InterviewSession).where(*filters))
        result = await session.execute(
            select(InterviewSession)
            .where(*filters)
            .order_by(InterviewSession.created_at.desc())
            .offset((query.page - 1) * query.page_size)
            .limit(query.page_size)
            # Eager-load the joined report so _serialize_session_summary
            # can read overall_score + improvements without an N+1 lazy
            # fetch (which would also fail under the async session).
            .options(selectinload(InterviewSession.report))
        )
        items = [self._serialize_session_summary(item) for item in result.scalars().all()]
        return SessionListResponse(
            items=items,
            page=query.page,
            page_size=query.page_size,
            total=total or 0,
        )

    async def end_session(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        session_id: UUID,
    ) -> EndSessionResponse:
        interview_session = await self._get_owned_session(session, current_user, str(session_id))
        interview_session.status = InterviewSessionStatus.ENDED
        interview_session.ended_at = datetime.now(UTC)
        await session.commit()
        return EndSessionResponse(
            session_id=interview_session.id,
            status=interview_session.status,
            ended_at=interview_session.ended_at,
        )

    async def _get_ready_asset(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        asset_bundle_id: str,
    ) -> CandidateAsset:
        result = await session.execute(
            select(CandidateAsset).where(
                CandidateAsset.id == asset_bundle_id,
                CandidateAsset.user_id == current_user.id,
            )
        )
        asset = result.scalar_one_or_none()
        if asset is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset bundle not found.")
        if asset.status != CandidateAssetStatus.ANALYSIS_READY:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Asset bundle must be parsed before creating a session.",
            )
        return asset

    async def _get_parse_payload(self, session: AsyncSession, asset_bundle_id: str) -> ParseResultPayload:
        result = await session.execute(
            select(ParseResult).where(ParseResult.candidate_asset_id == asset_bundle_id)
        )
        parse_result = result.scalar_one_or_none()
        if parse_result is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parse result not found.")
        return ParseResultPayload.model_validate(parse_result.payload)

    async def _get_owned_session(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        session_id: str,
    ) -> InterviewSession:
        result = await session.execute(
            select(InterviewSession)
            .options(
                selectinload(InterviewSession.config),
                selectinload(InterviewSession.direction_framework),
                # Joining the report here means
                # `_serialize_session_summary(detail)` populates the M4
                # latest_overall_score / latest_weaknesses without a
                # lazy-load round-trip on the async session.
                selectinload(InterviewSession.report),
            )
            .where(
                InterviewSession.id == session_id,
                InterviewSession.user_id == current_user.id,
            )
        )
        interview_session = result.scalar_one_or_none()
        if interview_session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
        return interview_session

    @staticmethod
    def _agent_to_legacy_framework(
        request: CreateSessionRequest,
        parse_payload: ParseResultPayload,
        agent_output: FrameworkAgentOutput,
    ) -> DirectionFrameworkSchema:
        """Map the agent's output onto the legacy REST-facing shape.

        Phase 2 shipped a fixed-structure `DirectionFramework` that the
        frontend binds to. The agent's richer shape (focus_competencies,
        deep_dive_anchors, pace_plan) is stored alongside under the
        "agent" key on the DB row so the interviewer node can read it
        later; the REST response keeps the legacy fields populated with
        derived values so the UI doesn't break.
        """
        stages = [
            FrameworkStage(
                name=seg.name,
                goal=seg.goal,
                question_budget=max(1, seg.rough_minutes // 3),
            )
            for seg in agent_output.pace_plan.segments
        ] or [
            FrameworkStage(name="opening", goal="自我介绍与岗位匹配", question_budget=2),
            FrameworkStage(name="core_project", goal="主项目深挖", question_budget=7),
            FrameworkStage(name="closing", goal="候选人提问与总结", question_budget=1),
        ]
        focus_points = [c.title for c in agent_output.focus_competencies] or ["岗位理解"]
        risk_points = [r.title for r in parse_payload.candidate_risks] or [
            "回答跑偏",
            "数据不具体",
        ]
        # v3.2 clients send `directions: list` (1-3) and leave the legacy
        # singular `direction` as None. The legacy `DirectionFramework`
        # schema still requires a non-None `direction`. Prefer the first
        # v3.2 direction (always present per `min_length=1` validator);
        # fall back to the legacy field for v3.1 clients.
        primary_direction = (
            request.config.directions[0]
            if request.config.directions
            else request.config.direction
        )
        return DirectionFrameworkSchema(
            style=request.config.style,
            direction=primary_direction,
            duration_minutes=request.config.duration_minutes,
            stages=stages,
            focus_points=focus_points,
            risk_points=risk_points,
        )

    @staticmethod
    def _serialize_session_summary(interview_session: InterviewSession) -> SessionSummary:
        # M4-late: pluck overall_score + weakness titles from the joined
        # InterviewReport.payload so the History dashboard can render the
        # 评分 / 弱项 columns instead of "—" placeholders. Defensive about
        # payload shape — old reports may lack v3.2 keys.
        latest_overall_score: int | None = None
        latest_weaknesses: list[str] = []
        report = interview_session.report
        if report is not None and isinstance(report.payload, dict):
            score = report.payload.get("overall_score")
            if isinstance(score, int):
                latest_overall_score = score
            elif isinstance(score, float):
                latest_overall_score = int(score)
            improvements = report.payload.get("improvements")
            if isinstance(improvements, list):
                for item in improvements:
                    title = item.get("title") if isinstance(item, dict) else None
                    if isinstance(title, str) and title:
                        latest_weaknesses.append(title)
                    if len(latest_weaknesses) >= 2:
                        break
        return SessionSummary(
            id=interview_session.id,
            created_at=interview_session.created_at,
            updated_at=interview_session.updated_at,
            user_id=interview_session.user_id,
            candidate_asset_id=interview_session.candidate_asset_id,
            status=interview_session.status,
            started_at=interview_session.started_at,
            ended_at=interview_session.ended_at,
            turn_count=interview_session.turn_count,
            config_snapshot=interview_session.config_snapshot,
            latest_overall_score=latest_overall_score,
            latest_weaknesses=latest_weaknesses,
        )

    def _serialize_session_detail(self, interview_session: InterviewSession) -> SessionDetailResponse:
        config = None
        if interview_session.config is not None:
            # The legacy InterviewConfig table only carries the singular
            # `direction` column. The v3.2 multi-select lives in the
            # session's `config_snapshot` JSON (mirrored from the create
            # request payload). Echo it back so clients reading the
            # detail endpoint see the same shape they posted.
            snapshot = interview_session.config_snapshot or {}
            snapshot_directions = snapshot.get("directions")
            directions: list[str] = (
                [d for d in snapshot_directions if isinstance(d, str)]
                if isinstance(snapshot_directions, list)
                else []
            )
            config = InterviewConfigResponse(
                id=interview_session.config.id,
                created_at=interview_session.config.created_at,
                updated_at=interview_session.config.updated_at,
                interview_session_id=interview_session.config.interview_session_id,
                style=interview_session.config.style,
                directions=directions,
                direction=interview_session.config.direction,
                duration_minutes=interview_session.config.duration_minutes,
            )

        framework = None
        if interview_session.direction_framework is not None:
            raw = interview_session.direction_framework.payload
            legacy_payload = raw.get("legacy", raw) if isinstance(raw, dict) else raw
            framework = DirectionFrameworkSchema.model_validate(legacy_payload)

        return SessionDetailResponse(
            **self._serialize_session_summary(interview_session).model_dump(),
            config=config,
            direction_framework=framework,
        )
