"""GET /api/v1/users/me/insights — F-318 / V32.M3.1.3.

Backed by the ``user_insight_cache`` table. Returns the most recent
Coach insight for the authenticated user, or ``204 No Content`` when no
row exists yet (first-run / users with < 3 ready reports who haven't
been touched by the trigger yet).

The endpoint is read-only; the row is produced asynchronously by the
post-report Coach trigger (M3.1.2 ``post_report_graph``). The Dashboard
treats ``status == "ok"`` as a render condition and renders an empty-
state CTA otherwise (``skipped`` / ``running`` / ``failed`` / 204).

Schema mirrors the Pydantic ``UserInsightCache`` exactly so the desktop
client can deserialise into the same shape declared in
``packages/shared-types/src/index.ts``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.coach.schemas import UserInsightCache
from app.api.dependencies.auth import AuthenticatedUser, get_current_user
from app.infra.db import get_async_session
from app.models.user_insight_cache import UserInsightCacheRow
from sqlalchemy import select

router = APIRouter(prefix="/users/me", tags=["users"])


@router.get(
    "/insights",
    response_model=UserInsightCache,
    responses={204: {"description": "No insight cached yet (first run / below threshold)."}},
)
async def get_my_insights(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    result = await session.execute(
        select(UserInsightCacheRow).where(
            UserInsightCacheRow.user_id == current_user.id
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    payload = dict(row.payload or {})
    payload["user_id"] = row.user_id
    payload["based_on_session_count"] = row.based_on_session_count
    payload["based_on_last_session_id"] = row.based_on_last_session_id
    payload["status"] = row.status
    payload["generated_at"] = row.generated_at.isoformat()
    insight = UserInsightCache.model_validate(payload)
    return Response(
        status_code=status.HTTP_200_OK,
        content=insight.model_dump_json(),
        media_type="application/json",
    )
