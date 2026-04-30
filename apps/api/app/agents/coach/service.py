"""CoachAgentService — F-318 / V32.M3.1.1.

Three guardrail layers (mirrored by ``tests/agents/test_coach_ethics.py``):

  * **Schema (L0 A11)**: ``CoachAgentInput`` is ``extra="forbid"``; PII
    cannot reach the LLM by passing through this layer.
  * **Prompt (L0 条款 12)**: ``app/prompts/coach/system.j2`` lists the
    forbidden tone words and contrasts ✅/❌ examples. The model is told
    the headline must be constructive.
  * **Service post-scan (belt-and-braces)**: every user-visible text field
    in the LLM output is scanned for the same 12 forbidden tone words. A
    hit forces a coercion to a safe fallback and emits a WARN log keyed
    on ``coach_tone_violation`` (mirrors the F-314 ``coerce_pass_likelihood``
    pattern at ``apps/api/app/domain/reports/service.py``).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from app.agents.coach.schemas import (
    CoachAgentInput,
    CoachAgentOutput,
    _LLMCoachOutput,
)
from app.infra.llm.gateway import LLMGateway
from app.infra.llm.instructor_client import make_instructor, structured_completion
from app.prompts import render_prompt

logger = logging.getLogger(__name__)


# 12 禁止词,与 v32-p0-constraints.md §A5 + v32-p2-constraints.md §A "L0 条款 12"
# 对齐。任何命中都会被强制覆盖为建设性 fallback,并触发 WARN 日志。
FORBIDDEN_TONE_WORDS: tuple[str, ...] = (
    "不建议",
    "不推荐",
    "建议放弃",
    "不适合",
    "差距很大",
    "不合格",
    "淘汰",
    "无希望",
    "拒绝你",
    "失败者",
    "你不行",
    "太差",
)


_HEADLINE_FALLBACK = "继续围绕薄弱维度做专项训练,保持现有节奏稳步累积"
_HEADLINE_DETAIL_FALLBACK = (
    "近期面试展现出多个进步信号,建议在数据驱动与项目深度方向上巩固,"
    "针对易失分维度做 2-3 场专项训练。"
)
_WEAKNESS_FALLBACK = "可加强结构化表达"
_SIGNAL_FALLBACK = "保持目前的练习节奏"


def _scan_forbidden_tone(text: str) -> list[str]:
    """Return forbidden tone words present in ``text`` (empty list = clean)."""
    return [w for w in FORBIDDEN_TONE_WORDS if w in text]


def sanitize_tone(text: str, *, fallback: str, field: str) -> str:
    """Coerce judgmental phrasing to a constructive fallback.

    Mirrors ``coerce_pass_likelihood`` at
    ``apps/api/app/domain/reports/service.py`` — illegal values are
    overwritten and a WARN log is emitted with the offending hits so we
    can audit prompt drift over time.
    """
    hits = _scan_forbidden_tone(text)
    if not hits:
        return text
    logger.warning(
        "coach_tone_violation",
        extra={"field": field, "forbidden_hits": hits},
    )
    return fallback


def sanitize_output(llm_out: _LLMCoachOutput) -> _LLMCoachOutput:
    """Apply ``sanitize_tone`` to every user-visible text field."""
    return _LLMCoachOutput(
        headline=sanitize_tone(
            llm_out.headline, fallback=_HEADLINE_FALLBACK, field="headline"
        ),
        headline_detail=sanitize_tone(
            llm_out.headline_detail,
            fallback=_HEADLINE_DETAIL_FALLBACK,
            field="headline_detail",
        ),
        recurring_weaknesses=[
            sanitize_tone(
                w, fallback=_WEAKNESS_FALLBACK, field="recurring_weaknesses"
            )
            for w in llm_out.recurring_weaknesses
        ],
        improvement_signals=[
            sanitize_tone(s, fallback=_SIGNAL_FALLBACK, field="improvement_signals")
            for s in llm_out.improvement_signals
        ],
        next_focus_areas=llm_out.next_focus_areas,
    )


class CoachAgentService:
    """Aggregate recent reports into a cross-session insight payload."""

    async def run(
        self, input: CoachAgentInput, gateway: LLMGateway
    ) -> CoachAgentOutput:
        # L0 audit: log the run with scalar metadata only — never user_id
        # plaintext content of recent_reports / candidate_profile.
        logger.info(
            "coach_request",
            extra={
                "based_on_session_count": input.based_on_session_count,
                "has_candidate_profile": input.candidate_profile is not None,
            },
        )

        system = render_prompt("coach", "system")
        user = render_prompt(
            "coach",
            "user",
            recent_reports_json=json.dumps(
                input.recent_reports, ensure_ascii=False
            ),
            candidate_profile_json=(
                json.dumps(input.candidate_profile, ensure_ascii=False)
                if input.candidate_profile is not None
                else None
            ),
            based_on_session_count=input.based_on_session_count,
        )
        client = make_instructor(gateway)
        llm_out = await structured_completion(
            client,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_model=_LLMCoachOutput,
        )

        sanitized = sanitize_output(llm_out)

        return CoachAgentOutput(
            user_id=input.user_id,
            based_on_session_count=input.based_on_session_count,
            based_on_last_session_id=input.based_on_last_session_id,
            headline=sanitized.headline,
            headline_detail=sanitized.headline_detail,
            recurring_weaknesses=sanitized.recurring_weaknesses,
            improvement_signals=sanitized.improvement_signals,
            next_focus_areas=sanitized.next_focus_areas,
            generated_at=datetime.now(timezone.utc),
            status="ok",
        )


__all__ = [
    "CoachAgentService",
    "FORBIDDEN_TONE_WORDS",
    "sanitize_output",
    "sanitize_tone",
]
