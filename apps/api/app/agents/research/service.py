"""ResearchAgentService — orchestrates the F-320 research pipeline.

Privacy guardrail responsibilities (L0 A11):

  * **Input layer**: ResearchAgentInput is `extra="forbid"`, so any caller
    that hands us resume_text or PII triggers ValidationError before we
    log or transmit anything.
  * **Audit layer**: every run() emits exactly one INFO log line whose
    `extra` carries `cache_key` (hash) only — never company_name in
    plaintext. Tests scan logs for the absence of resume-shaped fields.
  * **Prompt layer**: research/system.j2 reminds the LLM that the only
    inputs are company / role / industry, and forbids referencing or
    speculating about the candidate.

Degraded mode: if the BYOK key cannot use tools (probe fails) or the
tool-augmented call errors out, we fall back to a tools-free completion
and stamp `degraded=True` so the UI can warn the user about staleness.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.research.schemas import (
    CompanyProfile,
    IndustryProfile,
    ResearchAgentInput,
    ResearchAgentOutput,
)
from app.infra.llm.errors import LLMError
from app.infra.llm.gateway import LLMGateway
from app.infra.llm.instructor_client import make_instructor, structured_completion
from app.infra.llm.tools import ToolUseCapability, build_web_search_tool
from app.prompts import render_prompt
from app.repositories import research_cache as cache_repo

logger = logging.getLogger(__name__)


class _LLMResearchOutput(BaseModel):
    """The shape the LLM is asked to produce.

    The agent-level ResearchAgentOutput adds fetched_at / cache_key /
    degraded which we want stamped server-side, never trusted from
    model output. The LLM only fills the two profile blobs.
    """

    company: CompanyProfile
    industry: IndustryProfile


def _compute_cache_key(input: ResearchAgentInput) -> str:
    """Stable 16-char hash that avoids logging company_name in plaintext."""
    raw = f"{input.company_name}|{','.join(input.industry_hints)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


class ResearchAgentService:
    async def run(
        self,
        input: ResearchAgentInput,
        gateway: LLMGateway,
        *,
        session: AsyncSession | None = None,
    ) -> ResearchAgentOutput:
        cache_key = _compute_cache_key(input)
        # L0 A11: audit log records the hash only. role_title is treated
        # as low-risk metadata (it is JD-side, not candidate-side); we
        # still keep it short and hash-keyed.
        logger.info(
            "research_request",
            extra={"cache_key": cache_key, "role_title_len": len(input.role_title)},
        )

        # M2.3.X audit-fix (G4) — try the 30-day cache first when a
        # session is available. The cache is keyed on the sha256 hash
        # of (company|industry_hints), so a re-parse for the same JD
        # short-circuits without touching the LLM.
        if session is not None:
            cached_payload = await cache_repo.get(session, cache_key)
            if cached_payload is not None:
                logger.info("research_cache_hit", extra={"cache_key": cache_key})
                try:
                    return ResearchAgentOutput.model_validate(cached_payload)
                except ValueError:
                    # Stale schema in the cache — fall through to a fresh
                    # fetch. This shouldn't happen in practice but keeps
                    # the read-path defensive against migrations.
                    logger.info(
                        "research_cache_stale_schema",
                        extra={"cache_key": cache_key},
                    )

        can_tool_use = await ToolUseCapability.probe(gateway)
        if not can_tool_use:
            result = await self._degraded_run(
                input, gateway, cache_key, "tool_use_unsupported"
            )
            await self._write_cache(session, cache_key, result)
            return result

        try:
            llm_out = await self._tool_augmented_run(input, gateway)
        except LLMError as exc:
            logger.info(
                "research_tool_call_failed",
                extra={"cache_key": cache_key, "reason": type(exc).__name__},
            )
            result = await self._degraded_run(
                input, gateway, cache_key, str(exc)
            )
            await self._write_cache(session, cache_key, result)
            return result

        result = ResearchAgentOutput(
            company=llm_out.company,
            industry=llm_out.industry,
            fetched_at=datetime.now(timezone.utc),
            cache_key=cache_key,
            degraded=False,
        )
        await self._write_cache(session, cache_key, result)
        return result

    async def _write_cache(
        self,
        session: AsyncSession | None,
        cache_key: str,
        result: ResearchAgentOutput,
    ) -> None:
        """Best-effort cache write. Cache failure must NEVER fail a
        successful research run for the user."""
        if session is None:
            return
        try:
            await cache_repo.set_(
                session, cache_key, result.model_dump(mode="json")
            )
        except Exception as exc:  # noqa: BLE001 — defensive
            logger.info(
                "research_cache_write_failed",
                extra={"cache_key": cache_key, "reason": type(exc).__name__},
            )

    @staticmethod
    def _resolve_tools(can_tool_use: bool) -> list[dict] | None:
        """Return the provider tool block when the BYOK key supports it.

        M2.3.X audit-fix (G2) — pre-audit this was a comment-only stub
        and the `tools=` kwarg below was commented out, so no Research
        run ever sent a hosted web-search tool to the LLM. The probe
        result is the only gate on the tool-augmented path; we forward
        the provider schema through `structured_completion`'s
        `**completion_kwargs` to `gateway.complete`.
        """
        if can_tool_use:
            return [build_web_search_tool()]
        return None

    async def _tool_augmented_run(
        self, input: ResearchAgentInput, gateway: LLMGateway
    ) -> _LLMResearchOutput:
        system = render_prompt("research", "system")
        user = render_prompt(
            "research",
            "user",
            company_name=input.company_name,
            role_title=input.role_title,
            industry_hints=input.industry_hints,
        )
        client = make_instructor(gateway)
        return await structured_completion(
            client,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_model=_LLMResearchOutput,
            # M2.3.X audit-fix (G2) — actually inject the hosted
            # web_search tool. We only reach this path after
            # ToolUseCapability.probe returned True, so the provider
            # has confirmed it speaks tool use.
            tools=[build_web_search_tool()],
        )

    async def _degraded_run(
        self,
        input: ResearchAgentInput,
        gateway: LLMGateway,
        cache_key: str,
        reason: str,
    ) -> ResearchAgentOutput:
        """Fallback path: rely on model-internal knowledge, stamp degraded."""
        system = render_prompt("research", "system")
        user = render_prompt(
            "research",
            "user",
            company_name=input.company_name,
            role_title=input.role_title,
            industry_hints=input.industry_hints,
        )
        client = make_instructor(gateway)
        try:
            llm_out = await structured_completion(
                client,
                messages=[
                    {
                        "role": "system",
                        "content": system + "\n\n[degraded_mode=true]",
                    },
                    {"role": "user", "content": user},
                ],
                response_model=_LLMResearchOutput,
            )
            company = llm_out.company
            industry = llm_out.industry
        except LLMError:
            # If even the tool-less path fails, return a minimal stub so
            # the upstream graph keeps moving. UI shows the degraded
            # banner; user can retry.
            company = CompanyProfile(
                name=input.company_name,
                business_model="(信息暂不可用,请稍后重试)",
                stage="unknown",
                recent_signals=[],
                evidence_links=[],
                confidence="low",
            )
            industry = IndustryProfile(
                name=input.industry_hints[0] if input.industry_hints else "未知行业",
                landscape_summary="(信息暂不可用,请稍后重试)",
                key_metrics=["待补充指标 1", "待补充指标 2", "待补充指标 3"],
                typical_pain_points=["待补充痛点 1", "待补充痛点 2"],
                competitors_in_jd_ctx=[],
            )

        return ResearchAgentOutput(
            company=company,
            industry=industry,
            fetched_at=datetime.now(timezone.utc),
            cache_key=cache_key,
            degraded=True,
            degraded_reason=reason,
        )


__all__ = ["ResearchAgentService", "build_web_search_tool"]
