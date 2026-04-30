"""F-322 / V32.M3.2.1 — Reflection no-overlap with Report.ai_verdict.

Per PRD addendum §4 + v32-p2-constraints.md §A: Report owns "评估"
(scores + ai_verdict), Reflection owns "教学" (per-question coaching).
A diagnosis that simply repeats Report.ai_verdict's core terms is not
teaching — it is parroting the score back at the user.

The service-side ``sanitize_diagnosis`` runs a regex scan against
``AI_VERDICT_CORE_TERMS`` and against the actual ``ai_verdict`` text
the report produced for this session. Any verbatim hit gets coerced to
a generic teaching prompt, with a WARN log so prompt drift is visible
in production.
"""
from __future__ import annotations

import logging

import pytest

from app.agents.reflection.schemas import PerQuestionCoaching
from app.agents.reflection.service import (
    AI_VERDICT_CORE_TERMS,
    sanitize_diagnosis,
    sanitize_per_question,
)


# ---------------------------------------------------------------------------
# AI_VERDICT_CORE_TERMS regex — verbatim collisions get coerced
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("term", AI_VERDICT_CORE_TERMS)
def test_diagnosis_containing_core_term_coerces(
    term: str, caplog: pytest.LogCaptureFixture
) -> None:
    """Each core term, if present in diagnosis, must trigger coercion."""
    caplog.set_level(logging.WARNING, logger="app.agents.reflection.service")
    diagnosis = f"候选人在本题{term},因此建议回看 STAR"
    out = sanitize_diagnosis(diagnosis, ai_verdict=None, turn_index=2)
    # Coerced — the original term is gone.
    assert term not in out
    # WARN log surfaces the overlap for monitoring.
    assert any(
        r.getMessage() == "reflection_overlap_with_report_verdict"
        for r in caplog.records
    )


def test_clean_diagnosis_passes_through() -> None:
    """A teaching-tone diagnosis without core terms keeps its content."""
    diagnosis = "可加强 STAR 框架的 S 部分,补一句业务背景再进入 T"
    out = sanitize_diagnosis(diagnosis, ai_verdict=None, turn_index=0)
    assert out == diagnosis


def test_overlap_when_term_lives_only_in_ai_verdict() -> None:
    """If the diagnosis mirrors an ai_verdict term, it gets coerced."""
    diagnosis = "本题在结构不清晰这一点上很明显"
    ai_verdict = "整体表现稳定,但存在结构不清晰的情况"
    out = sanitize_diagnosis(diagnosis, ai_verdict=ai_verdict, turn_index=1)
    assert "结构不清晰" not in out


def test_no_overlap_when_neither_side_has_core_term() -> None:
    """ai_verdict containing other text but not a core term ⇒ no coercion."""
    diagnosis = "建议在追问环节先回到指标拆解的层级表达"
    ai_verdict = "整体表现稳定"
    out = sanitize_diagnosis(diagnosis, ai_verdict=ai_verdict, turn_index=0)
    assert out == diagnosis


def test_per_question_sanitise_propagates_ai_verdict_to_diagnosis() -> None:
    """sanitize_per_question forwards ai_verdict to diagnosis scan."""
    item = PerQuestionCoaching(
        turn_index=0,
        question="Q",
        your_answer_summary="A 简述",
        diagnosis="本题缺乏深度",  # 撞 core term
        model_answer_outline=["先讲背景", "再讲行动"],
        key_phrases_to_use=["STAR", "驱动指标"],
        mistakes_to_avoid=["建议下次注意 STAR 收尾"],
        recommended_resources=[],
    )
    out = sanitize_per_question(item, ai_verdict="整体表现尚可")
    assert "缺乏深度" not in out.diagnosis


def test_diagnosis_scan_is_case_sensitive_chinese_only() -> None:
    """The scan is verbatim — a paraphrase that avoids the core term passes."""
    paraphrase = "建议在 STAR 的 R(结果)部分补一句量化数据"
    out = sanitize_diagnosis(paraphrase, ai_verdict=None, turn_index=0)
    assert out == paraphrase


def test_ai_verdict_core_terms_set_size() -> None:
    """Lock the term set size so future drift in the constant lights up CI."""
    # 8 entries today (M3.2.1). Update both this assert + the constant
    # together when the v3.2 dimension wording shifts.
    assert len(AI_VERDICT_CORE_TERMS) == 8
