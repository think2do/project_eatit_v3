"""GET /api/v1/sessions/{session_id}/reflection — F-322 / V32.M3.2.2.

Backed by the ``reflection_reports`` table. Returns the teaching-tone
Reflection payload (executive_summary + per_question_coaching +
general_growth_advice + mock_followup_dialogue) for the given session,
or ``204 No Content`` when no row exists yet (the trigger hasn't run /
the report isn't ready / etc.).

The endpoint is read-only; the row is produced asynchronously by
``post_report_graph.reflection_node`` (M3.2.2). The Report page's
"详细复盘" tab (M3.2.3) polls this endpoint while ``status`` is
``running`` and renders the payload at ``ok``.

Schema mirrors the Pydantic ``ReflectionReport`` exactly so the desktop
client can deserialise into the same shape declared in
``packages/shared-types/src/index.ts``.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.reflection.schemas import ReflectionReport
from app.api.dependencies.auth import AuthenticatedUser, get_current_user
from app.infra.db import get_async_session
from app.models.reflection_report import ReflectionReportRow
from app.models.session import InterviewSession

router = APIRouter(prefix="/sessions", tags=["reflection"])


@router.get(
    "/{session_id}/reflection",
    response_model=ReflectionReport,
    responses={
        204: {"description": "No reflection cached yet (trigger not run)."},
        404: {"description": "Session not found or not owned by current user."},
    },
)
async def get_reflection(
    session_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    # Authorise the request against the session's owning user. We don't
    # join through the cache row directly because then a 404 from a
    # never-triggered Reflection would mask cross-user lookups; safer to
    # 404 explicitly when the session doesn't belong to the caller.
    interview = (
        await session.execute(
            select(InterviewSession).where(
                InterviewSession.id == str(session_id),
                InterviewSession.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    row = (
        await session.execute(
            select(ReflectionReportRow).where(
                ReflectionReportRow.session_id == str(session_id)
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    payload = dict(row.payload or {})
    payload["report_id"] = str(row.id)
    payload["session_id"] = row.session_id
    payload["status"] = row.status
    payload["generated_at"] = row.generated_at.isoformat()
    reflection = ReflectionReport.model_validate(payload)
    return Response(
        status_code=status.HTTP_200_OK,
        content=reflection.model_dump_json(),
        media_type="application/json",
    )
