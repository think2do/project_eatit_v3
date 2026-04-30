from fastapi import APIRouter

from app.api.routes.app_settings import router as app_settings_router
from app.api.routes.assets import router as assets_router
from app.api.routes.asr import router as asr_router
from app.api.routes.health import router as health_router
from app.api.routes.llm import router as llm_router
from app.api.routes.meta_reports import router as meta_reports_router
from app.api.routes.sessions import router as sessions_router
from app.api.routes.settings_research import router as settings_research_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(assets_router)
api_v1_router.include_router(sessions_router)
api_v1_router.include_router(llm_router)
api_v1_router.include_router(asr_router)
api_v1_router.include_router(app_settings_router)
api_v1_router.include_router(meta_reports_router)
api_v1_router.include_router(settings_research_router)

api_router.include_router(api_v1_router)
