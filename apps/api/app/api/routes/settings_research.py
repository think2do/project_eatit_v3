"""Research opt-in REST routes (F-320 / V32.M2.3.2).

Two endpoints, both fronting a single bool stored under
`app_settings["research_opt_in"]`:

  * `GET  /api/v1/settings/research-opt-in` — returns `{enabled: bool}`,
    defaulting to `false` when the row is missing (first run).
  * `PUT  /api/v1/settings/research-opt-in` — accepts `{enabled: bool}`
    and writes it. Any non-boolean payload is rejected at the Pydantic
    layer (FastAPI returns 422).

Why a dedicated router instead of `PUT /app-settings/research_opt_in`:
the value model is strictly bool here, while the generic app_settings
endpoint accepts `Any` JSON. A typed contract makes the desktop UI
simpler (no defensive isinstance checks) and gives us one obvious
place to gate the flip-on side effects when M2.3.4 wires intake_graph.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, StrictBool
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.settings.service import get_setting, set_setting
from app.infra.db import get_async_session


router = APIRouter(prefix="/settings", tags=["settings"])

_RESEARCH_OPT_IN_KEY = "research_opt_in"


class ResearchOptInResponse(BaseModel):
    enabled: bool


class ResearchOptInRequest(BaseModel):
    # StrictBool — Pydantic v2 otherwise coerces "yes" / "true" / 1 to
    # True. We want the desktop client to send actual booleans so an
    # accidental string flag doesn't silently flip the privacy switch.
    enabled: StrictBool


@router.get("/research-opt-in", response_model=ResearchOptInResponse)
async def get_research_opt_in(
    session: AsyncSession = Depends(get_async_session),
) -> ResearchOptInResponse:
    raw = await get_setting(session, _RESEARCH_OPT_IN_KEY)
    # Default-off semantics: the row is absent on first run, and we
    # also defensively coerce any legacy non-bool value.
    enabled = bool(raw) if raw is not None else False
    return ResearchOptInResponse(enabled=enabled)


@router.put("/research-opt-in", response_model=ResearchOptInResponse)
async def set_research_opt_in(
    body: ResearchOptInRequest,
    session: AsyncSession = Depends(get_async_session),
) -> ResearchOptInResponse:
    await set_setting(session, _RESEARCH_OPT_IN_KEY, body.enabled)
    return ResearchOptInResponse(enabled=body.enabled)
