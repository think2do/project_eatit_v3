from __future__ import annotations

from io import BytesIO
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.research.schemas import ResearchAgentInput
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

        # F-320 V32.M2.3.4 — route through intake_graph so Parse + (opt-in)
        # Research run in parallel. The graph also has predict_questions_node,
        # but at parse-trigger time we don't know the InterviewConfig yet —
        # framework_config=None makes that node a no-op so SessionsService
        # can still drive Framework at session creation.
        research_input = await self._build_research_input(session, jd_text)

        graph = build_intake_graph(gateway)
        try:
            graph_result = await graph.ainvoke(
                IntakeState(
                    resume_text=resume_text,
                    jd_text=jd_text,
                    research_input=research_input,
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
        )

    async def _build_research_input(
        self, session: AsyncSession, jd_text: str
    ) -> ResearchAgentInput | None:
        """Return the ResearchAgentInput when (a) the user opted in AND
        (b) we can extract a company name + role from the JD.

        L0 A11: NEVER include resume content. The JD heuristics below
        only mine the JD itself for company/role/industry hints. If
        either is missing we return None and the graph's research_node
        becomes a no-op.
        """
        opt_in = await get_setting(session, "research_opt_in")
        if not bool(opt_in):
            return None

        company, role = _extract_company_and_role(jd_text)
        if not company or not role:
            return None

        hints = _extract_industry_hints(jd_text) or [role]
        # ResearchAgentInput.industry_hints requires min_length=1; cap to 5.
        hints = hints[:5]
        try:
            return ResearchAgentInput(
                company_name=company[:80],
                role_title=role[:80],
                industry_hints=hints,
            )
        except Exception:  # noqa: BLE001
            # If JD parsing produces something the schema rejects, fall
            # back to "no research" rather than blowing up the parse path.
            return None

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
# Module-level helpers: JD-only extraction for ResearchAgentInput (F-320 / M2.3.4)
# ---------------------------------------------------------------------------
#
# Why module-level: these are pure functions that only touch JD text and
# don't see resume content (L0 A11). Keeping them outside AssetsService
# makes them trivially unit-testable and removes any temptation to reach
# into instance state.
#
# Today's heuristic is intentionally conservative: company/role extraction
# from arbitrary JD text without an LLM is unreliable, so we return
# (None, None) when we're not confident. The caller treats that as
# "no research" — the intake_graph then runs research_node as a no-op,
# preserving the safe default. A future ticket can swap in a smarter
# extractor (e.g. a small dedicated agent) without touching the wiring.


def _extract_company_and_role(jd_text: str) -> tuple[str | None, str | None]:
    """Best-effort first-line extraction. Returns (None, None) on uncertainty."""
    if not jd_text or not jd_text.strip():
        return (None, None)
    # Without a JD parser, we cannot reliably split company vs role.
    # The conservative default avoids false-positive sends to the LLM.
    return (None, None)


def _extract_industry_hints(jd_text: str) -> list[str]:
    """Best-effort industry-keyword extraction. Returns [] on uncertainty."""
    if not jd_text or not jd_text.strip():
        return []
    return []
