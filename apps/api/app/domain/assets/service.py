from __future__ import annotations

from io import BytesIO
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.framework.schemas import FrameworkAgentOutput
from app.agents.research.schemas import ResearchAgentOutput
from app.api.dependencies.auth import AuthenticatedUser
from app.domain.settings.service import get_setting
from app.infra.llm import LLMGateway
from app.infra.llm.errors import LLMError
from app.infra.storage import StorageInterface
from app.models.asset import CandidateAsset, ParseResult
from app.models.enums import CandidateAssetStatus, ParseResultStatus
from app.orchestrator.intake_graph import IntakeState, build_intake_graph
from app.schemas.assets import AssetUploadResponse
from app.schemas.parse import (
    ParseRequestResponse,
    ParseResultPayload,
    ParseResultPreview,
    ParseResultResponse,
)


class AssetsService:
    async def upload_resume(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        storage: StorageInterface,
        file: UploadFile,
        asset_bundle_id: UUID | None,
    ) -> AssetUploadResponse:
        asset = await self._get_or_create_asset(session, current_user, asset_bundle_id)
        file_ref = await storage.upload(
            self._build_storage_key("resume", asset.id, file.filename),
            await file.read(),
        )
        asset.resume_filename = file.filename
        asset.resume_content_type = file.content_type
        asset.resume_file_ref = file_ref
        asset.status = self._derive_asset_status(asset)
        await session.commit()
        await session.refresh(asset)
        return AssetUploadResponse.model_validate(
            {
                **asset.__dict__,
                "asset_bundle_id": asset.id,
                "uploaded_kind": "resume",
            }
        )

    async def upload_jd(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        storage: StorageInterface,
        file: UploadFile,
        asset_bundle_id: UUID | None,
    ) -> AssetUploadResponse:
        asset = await self._get_or_create_asset(session, current_user, asset_bundle_id)
        file_ref = await storage.upload(
            self._build_storage_key("jd", asset.id, file.filename),
            await file.read(),
        )
        asset.jd_filename = file.filename
        asset.jd_content_type = file.content_type
        asset.jd_file_ref = file_ref
        asset.status = self._derive_asset_status(asset)
        await session.commit()
        await session.refresh(asset)
        return AssetUploadResponse.model_validate(
            {
                **asset.__dict__,
                "asset_bundle_id": asset.id,
                "uploaded_kind": "jd",
            }
        )

    async def trigger_parse(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        asset_bundle_id: UUID,
        gateway: LLMGateway,
        storage: StorageInterface,
    ) -> ParseRequestResponse:
        asset = await self._get_owned_asset(session, current_user, str(asset_bundle_id))
        if not asset.resume_file_ref or not asset.jd_file_ref:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Both resume and JD must be uploaded before parsing.",
            )

        resume_text = await self._download_as_text(storage, asset.resume_file_ref)
        jd_text = await self._download_as_text(storage, asset.jd_file_ref)

        # F-320 V32.M2.3.X — route through intake_graph so Parse →
        # Research → predict_questions_node run sequentially. Research is
        # gated by the user's `research_opt_in` setting; predict_questions
        # only fires at session creation when a real InterviewConfig
        # exists, so we leave framework_config=None here and the
        # node is a no-op (SessionsService runs Framework later).
        opt_in = await get_setting(session, "research_opt_in")
        graph = build_intake_graph(gateway, session=session)
        try:
            graph_result = await graph.ainvoke(
                IntakeState(
                    resume_text=resume_text,
                    jd_text=jd_text,
                    research_opt_in=bool(opt_in),
                    framework_config=None,
                ).model_dump()
            )
        except LLMError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LLM 调用失败:{exc}",
            ) from exc

        parse_payload_obj = graph_result.get("parse_payload")
        if parse_payload_obj is None:
            # parse_node failed without raising LLMError (graph swallowed it).
            # Surface a 502 like the legacy direct-call path would.
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LLM 调用失败:Parse Agent did not produce a payload",
            )
        payload = ParseResultPayload.model_validate(
            parse_payload_obj
            if isinstance(parse_payload_obj, dict)
            else parse_payload_obj.model_dump()
        )

        research_payload = _coerce_research_payload(
            graph_result.get("research_payload")
        )
        predicted_questions = _coerce_predicted_questions(
            graph_result.get("direction_framework")
        )

        result = await session.execute(
            select(ParseResult).where(ParseResult.candidate_asset_id == asset.id)
        )
        parse_result = result.scalar_one_or_none()

        if parse_result is None:
            parse_result = ParseResult(
                candidate_asset_id=asset.id,
                status=ParseResultStatus.SUCCEEDED,
                payload=payload.model_dump(mode="json"),
                match_summary=payload.match_summary,
            )
            session.add(parse_result)
        else:
            parse_result.status = ParseResultStatus.SUCCEEDED
            parse_result.payload = payload.model_dump(mode="json")
            parse_result.match_summary = payload.match_summary

        asset.status = CandidateAssetStatus.ANALYSIS_READY
        await session.commit()

        return ParseRequestResponse(
            asset_bundle_id=asset.id,
            status=parse_result.status,
            payload=payload,
            research_payload=research_payload,
            predicted_questions=predicted_questions,
        )

    @staticmethod
    async def _download_as_text(storage: StorageInterface, file_ref: str) -> str:
        data = await storage.download(file_ref)
        # Sniff content: PDF has a %PDF- magic prefix; everything else we
        # treat as utf-8 text with replacement decoding. docx/doc extraction
        # is a later concern (users can export to PDF or paste plain text).
        if data[:5] == b"%PDF-":
            try:
                reader = PdfReader(BytesIO(data))
                parts: list[str] = []
                for page in reader.pages:
                    text = page.extract_text() or ""
                    if text:
                        parts.append(text)
                # Return on success even when extraction is empty (blank /
                # scan-only PDF). Falling through to utf-8 decode here
                # would leak raw PDF structure to the LLM — precisely the
                # bug that blew the first end-to-end walkthrough.
                return "\n\n".join(parts).strip()
            except PdfReadError:
                # Only for malformed PDFs: best-effort utf-8 decode so the
                # caller sees *something* rather than silence.
                pass
        return data.decode("utf-8", errors="replace")

    async def get_parse_result(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        asset_bundle_id: UUID,
    ) -> ParseResultResponse:
        asset = await self._get_owned_asset(session, current_user, str(asset_bundle_id))
        result = await session.execute(
            select(ParseResult).where(ParseResult.candidate_asset_id == asset.id)
        )
        parse_result = result.scalar_one_or_none()

        if parse_result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parse result not found.",
            )

        return ParseResultResponse(
            id=parse_result.id,
            created_at=parse_result.created_at,
            updated_at=parse_result.updated_at,
            candidate_asset_id=parse_result.candidate_asset_id,
            status=parse_result.status,
            payload=ParseResultPayload.model_validate(parse_result.payload),
        )

    async def get_asset_preview(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        asset_bundle_id: UUID,
    ) -> ParseResultPreview | None:
        asset = await self._get_owned_asset(session, current_user, str(asset_bundle_id))
        result = await session.execute(
            select(ParseResult).where(ParseResult.candidate_asset_id == asset.id)
        )
        parse_result = result.scalar_one_or_none()
        if parse_result is None:
            return None
        payload = ParseResultPayload.model_validate(parse_result.payload)
        return ParseResultPreview(
            match_summary=payload.match_summary,
            candidate_risk_count=len(payload.candidate_risks),
            project_hook_count=len(payload.project_hooks),
        )

    async def _get_owned_asset(
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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset bundle not found.",
            )
        return asset

    async def _get_or_create_asset(
        self,
        session: AsyncSession,
        current_user: AuthenticatedUser,
        asset_bundle_id: UUID | None,
    ) -> CandidateAsset:
        if asset_bundle_id is not None:
            return await self._get_owned_asset(session, current_user, str(asset_bundle_id))

        asset = CandidateAsset(user_id=current_user.id, status=CandidateAssetStatus.DRAFT)
        session.add(asset)
        await session.flush()
        return asset

    @staticmethod
    def _derive_asset_status(asset: CandidateAsset) -> CandidateAssetStatus:
        if asset.resume_file_ref and asset.jd_file_ref:
            return CandidateAssetStatus.READY_FOR_PARSE
        return CandidateAssetStatus.DRAFT

    @staticmethod
    def _build_storage_key(kind: str, asset_id: UUID, filename: str | None) -> str:
        safe_name = Path(filename or f"{kind}.txt").name
        return f"assets/{kind}/{asset_id}/{safe_name}"


# ---------------------------------------------------------------------------
# Module-level helpers: parse-driven extraction for ResearchAgentInput
# (F-320 / V32.M2.3.X audit-fix)
# ---------------------------------------------------------------------------
#
# Pre-audit these were regex stubs over `jd_text` that always returned
# `(None, None)`, so research_node never had a real input. The audit-fix
# moves the JD mining work into Parse Agent itself (which already reads
# the whole JD), exposing `jd_company_name / jd_role_title /
# jd_industry_hints` on ParseResultPayload. These helpers now just
# project those fields out for callers that already hold the payload —
# they exist so consumer code can stay terse and so the grep guard in
# the audit-fix Acceptance step has something to land on.
#
# L0 A11: the helpers never see resume_text — they only read JD-derived
# fields that Parse Agent has already filtered through its own prompt.


def _extract_company_and_role(
    parse_payload: ParseResultPayload | None,
) -> tuple[str | None, str | None, list[str]]:
    """Project (company, role, industry_hints) out of parse_payload.

    Returns the bare projections so the caller can decide what counts
    as "enough signal" (Research Agent's schema enforces min lengths).
    """
    if parse_payload is None:
        return (None, None, [])
    return (
        parse_payload.jd_company_name,
        parse_payload.jd_role_title,
        list(parse_payload.jd_industry_hints or []),
    )


def _coerce_research_payload(raw: object) -> ResearchAgentOutput | None:
    """LangGraph returns either the model instance or its model_dump().
    Normalise to ResearchAgentOutput | None for the response builder.
    """
    if raw is None:
        return None
    if isinstance(raw, ResearchAgentOutput):
        return raw
    if isinstance(raw, dict):
        try:
            return ResearchAgentOutput.model_validate(raw)
        except ValueError:
            return None
    return None


def _coerce_predicted_questions(raw: object):
    """Pull predicted_questions out of FrameworkAgentOutput, if any.

    `direction_framework` is None when predict_questions_node was a
    no-op (parse-trigger path), and even when present its
    `predicted_questions` field is itself optional (Framework declined
    to predict). We surface None in either case.
    """
    if raw is None:
        return None
    framework_output: FrameworkAgentOutput | None = None
    if isinstance(raw, FrameworkAgentOutput):
        framework_output = raw
    elif isinstance(raw, dict):
        try:
            framework_output = FrameworkAgentOutput.model_validate(raw)
        except ValueError:
            return None
    if framework_output is None:
        return None
    return framework_output.predicted_questions
