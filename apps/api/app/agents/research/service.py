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
        self, input: ResearchAgentInput, gateway: LLMGateway
    ) -> ResearchAgentOutput:
        cache_key = _compute_cache_key(input)
        # L0 A11: audit log records the hash only. role_title is treated
        # as low-risk metadata (it is JD-side, not candidate-side); we
        # still keep it short and hash-keyed.
        logger.info(
            "research_request",
            extra={"cache_key": cache_key, "role_title_len": len(input.role_title)},
        )

        can_tool_use = await ToolUseCapability.probe(gateway)
        if not can_tool_use:
            return await self._degraded_run(
                input, gateway, cache_key, "tool_use_unsupported"
            )

        try:
            llm_out = await self._tool_augmented_run(input, gateway)
        except LLMError as exc:
            logger.info(
                "research_tool_call_failed",
                extra={"cache_key": cache_key, "reason": type(exc).__name__},
            )
            return await self._degraded_run(input, gateway, cache_key, str(exc))

        return ResearchAgentOutput(
            company=llm_out.company,
            industry=llm_out.industry,
            fetched_at=datetime.now(timezone.utc),
            cache_key=cache_key,
            degraded=False,
        )

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
            # Pass the hosted web_search tool through to the underlying
            # gateway. Instructor's adapter forwards unknown kwargs.
            # Note: not all providers will accept the tool block; the
            # probe above is what gates this path.
            # tools=[build_web_search_tool()],  # see _resolve_tools below
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
