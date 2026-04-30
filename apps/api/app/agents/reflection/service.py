"""ReflectionAgentService — F-322 / V32.M3.2.1.

Three guardrail layers (mirrored by ``tests/agents/test_reflection_ethics.py``
+ ``tests/agents/test_reflection_no_overlap.py``):

  * **Schema (L0 A11)**: ``ReflectionAgentInput`` is ``extra="forbid"``.
    PII / resume_text raise ``ValidationError`` before prompt render.
  * **Tone (L0 条款 12)**: every user-visible text field is scanned for
    the same 12 forbidden judgmental phrases that gate the Coach Agent
    output (M3.1.1 parity). ``mistakes_to_avoid`` items get an extra
    sentence-pattern check — accusatory openings are rewritten to
    "建议下次" form.
  * **No-overlap with Report**: per-question ``diagnosis`` is scanned
    for the Report-side ``ai_verdict`` core terms. Collisions coerce to
    a generic teaching prompt — the Report owns "评估", Reflection owns
    "教学" (PRD addendum §4).
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from app.agents.reflection.schemas import (
    DialogueTurn,
    PerQuestionCoaching,
    ReflectionAgentInput,
    ReflectionAgentOutput,
    _LLMReflectionOutput,
)
from app.infra.llm.gateway import LLMGateway
from app.infra.llm.instructor_client import make_instructor, structured_completion
from app.prompts import render_prompt

logger = logging.getLogger(__name__)


# 12 禁止词,与 Coach Agent / F-314 pass_likelihood 严格对齐(L0 条款 12)。
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

# 四个常被 LLM 误用为责备 mistakes_to_avoid 开头的代词/短语。这些不是
# 单词级 ban list,而是"句首结构"的修正提示;命中即在前面接 "建议下次注意:"
# 重写,保证教学语气。
ACCUSATORY_PREFIXES: tuple[str, ...] = ("你犯", "你又", "你总", "你居然")


# Report.ai_verdict 是 P1/M1 引入的"核心评价词"字段(见 F-314)。
# Reflection.diagnosis 不应原样复述这些词;若命中则替换为通用教学提示。
# 这个集合是 v3.2 五维度报告里常用的负面/中性评价词,M3.2.1 收口。
AI_VERDICT_CORE_TERMS: tuple[str, ...] = (
    "结构不清晰",
    "缺乏逻辑",
    "偏离主题",
    "证据不足",
    "数据缺失",
    "表达冗长",
    "缺乏深度",
    "条理混乱",
)


_DIAGNOSIS_FALLBACK = "可加强 STAR 框架的"
_TEACHING_FALLBACK = "建议在下次回答中聚焦关键事实+一句结论"
_EXEC_SUMMARY_FALLBACK = (
    "建议围绕最薄弱的两个维度做一次专项练习,"
    "用 STAR 框架重做本场最得分项以巩固结构感。"
)
_GROWTH_ADVICE_FALLBACK = (
    "1) 用 STAR 框架重写本场最关键的 2 个回答;"
    "2) 针对薄弱维度找 3 道相似题做即兴练习;"
    "3) 在下次面试 24h 前再回看本份复盘。"
)


def _scan_forbidden_tone(text: str) -> list[str]:
    return [w for w in FORBIDDEN_TONE_WORDS if w in text]


def sanitize_tone(text: str, *, fallback: str, field: str) -> str:
    hits = _scan_forbidden_tone(text)
    if not hits:
        return text
    logger.warning(
        "reflection_tone_violation",
        extra={"field": field, "forbidden_hits": hits},
    )
    return fallback


def rewrite_accusatory_to_teaching(text: str) -> str:
    """Coerce "你犯了 X" / "你又 ..." openings to "建议下次注意:..." form.

    Belt-and-braces alongside ``sanitize_tone``: the prompt instructs the
    LLM to use teaching phrasing, but model drift on long completions can
    leak the accusatory shape. We rewrite at the service boundary so the
    persisted payload is always teaching-tone. A WARN log surfaces drift
    so prompt iterations can monitor.
    """
    for prefix in ACCUSATORY_PREFIXES:
        if text.startswith(prefix):
            logger.warning(
                "reflection_accusatory_rewrite",
                extra={"prefix": prefix, "len": len(text)},
            )
            return f"建议下次注意:{text[len(prefix):].lstrip(' ,。')}"
    return text


def _scan_overlap_with_verdict(text: str, *, ai_verdict: str | None) -> list[str]:
    """Return the AI_VERDICT_CORE_TERMS that show up verbatim in ``text``.

    When ``ai_verdict`` is provided we also scan it for additional core
    terms and reject collisions with the diagnosis. Empty list = clean.
    """
    hits = [t for t in AI_VERDICT_CORE_TERMS if t in text]
    if ai_verdict:
        for t in AI_VERDICT_CORE_TERMS:
            if t in ai_verdict and t in text and t not in hits:
                hits.append(t)
    return hits


def sanitize_diagnosis(
    text: str, *, ai_verdict: str | None, turn_index: int
) -> str:
    """Apply tone scan + no-overlap regex to a per-question diagnosis."""
    text = sanitize_tone(text, fallback=_DIAGNOSIS_FALLBACK + "结构表达", field="diagnosis")
    overlap = _scan_overlap_with_verdict(text, ai_verdict=ai_verdict)
    if overlap:
        logger.warning(
            "reflection_overlap_with_report_verdict",
            extra={"turn_index": turn_index, "overlap_terms": overlap},
        )
        return _DIAGNOSIS_FALLBACK + "STAR 收尾节奏"
    return text


_RESOURCE_URL_RE = re.compile(r"^(https?://|/)?[\w\-./?=&%#一-鿿,。:、;]+$")


def _normalize_resources(items: list[str]) -> list[str]:
    """Trim + de-duplicate while preserving the original order."""
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        s = item.strip()
        if not s:
            continue
        if not _RESOURCE_URL_RE.match(s):
            # Free-form Chinese is fine; this regex is permissive on
            # purpose. We just want to trim leading/trailing whitespace
            # and de-dupe — not to gate URLs strictly.
            pass
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def sanitize_per_question(
    item: PerQuestionCoaching, *, ai_verdict: str | None
) -> PerQuestionCoaching:
    return PerQuestionCoaching(
        turn_index=item.turn_index,
        question=item.question,
        your_answer_summary=item.your_answer_summary,
        diagnosis=sanitize_diagnosis(
            item.diagnosis, ai_verdict=ai_verdict, turn_index=item.turn_index
        ),
        model_answer_outline=[
            sanitize_tone(o, fallback=_TEACHING_FALLBACK, field="model_answer_outline")
            for o in item.model_answer_outline
        ],
        key_phrases_to_use=[
            sanitize_tone(p, fallback="STAR 框架收尾", field="key_phrases_to_use")
            for p in item.key_phrases_to_use
        ],
        mistakes_to_avoid=[
            rewrite_accusatory_to_teaching(
                sanitize_tone(m, fallback=_TEACHING_FALLBACK, field="mistakes_to_avoid")
            )
            for m in item.mistakes_to_avoid
        ],
        recommended_resources=_normalize_resources(item.recommended_resources),
    )


def sanitize_output(
    llm_out: _LLMReflectionOutput, *, ai_verdict: str | None
) -> _LLMReflectionOutput:
    return _LLMReflectionOutput(
        executive_summary=sanitize_tone(
            llm_out.executive_summary,
            fallback=_EXEC_SUMMARY_FALLBACK,
            field="executive_summary",
        ),
        per_question_coaching=[
            sanitize_per_question(c, ai_verdict=ai_verdict)
            for c in llm_out.per_question_coaching
        ],
        general_growth_advice=sanitize_tone(
            llm_out.general_growth_advice,
            fallback=_GROWTH_ADVICE_FALLBACK,
            field="general_growth_advice",
        ),
        mock_followup_dialogue=[
            DialogueTurn(
                role=t.role,
                text=sanitize_tone(
                    t.text,
                    fallback="(此句已根据教学语气护栏调整)",
                    field="mock_followup_dialogue",
                ),
            )
            for t in llm_out.mock_followup_dialogue
        ],
    )


class ReflectionAgentService:
    """Aggregate full Interview transcript into a teaching-tone reflection."""

    async def run(
        self, input: ReflectionAgentInput, gateway: LLMGateway
    ) -> ReflectionAgentOutput:
        ai_verdict = (
            input.report_payload.get("ai_verdict")
            if isinstance(input.report_payload, dict)
            else None
        )
        if not isinstance(ai_verdict, str):
            ai_verdict = None

        logger.info(
            "reflection_request",
            extra={
                "session_id": input.session_id,
                "turn_count": len(input.turns),
                "has_research": input.research_payload is not None,
            },
        )

        system = render_prompt("reflection", "system")
        user = render_prompt(
            "reflection",
            "user",
            report_payload_json=json.dumps(
                input.report_payload, ensure_ascii=False
            ),
            turns_json=json.dumps(input.turns, ensure_ascii=False),
            parse_payload_json=(
                json.dumps(input.parse_payload, ensure_ascii=False)
                if input.parse_payload is not None
                else None
            ),
            research_payload_json=(
                json.dumps(input.research_payload, ensure_ascii=False)
                if input.research_payload is not None
                else None
            ),
        )
        client = make_instructor(gateway)
        llm_out = await structured_completion(
            client,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_model=_LLMReflectionOutput,
        )

        sanitized = sanitize_output(llm_out, ai_verdict=ai_verdict)

        return ReflectionAgentOutput(
            report_id=input.report_id,
            session_id=input.session_id,
            executive_summary=sanitized.executive_summary,
            per_question_coaching=sanitized.per_question_coaching,
            general_growth_advice=sanitized.general_growth_advice,
            mock_followup_dialogue=sanitized.mock_followup_dialogue,
            generated_at=datetime.now(timezone.utc),
            status="ok",
        )


__all__ = [
    "ACCUSATORY_PREFIXES",
    "AI_VERDICT_CORE_TERMS",
    "FORBIDDEN_TONE_WORDS",
    "ReflectionAgentService",
    "rewrite_accusatory_to_teaching",
    "sanitize_diagnosis",
    "sanitize_output",
    "sanitize_per_question",
    "sanitize_tone",
]
