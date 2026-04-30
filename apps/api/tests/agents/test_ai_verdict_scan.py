"""F-314 L0 ethical guardrail: ai_verdict negative-keyword scan.

This is a regex contract test. The same pattern is documented in
v32-p0-constraints.md §A5 and the report system prompt forbids these
words at generation time. CI runs this as a backstop so a regression
in the prompt or in the LLM output post-processing is caught at lint.

We deliberately do NOT call the LLM here — we test the regex against
known-clean and known-violating Chinese verdict strings so the
guardrail itself can be regressed safely.
"""

from __future__ import annotations

import re

import pytest

# Same regex used at runtime by the (forthcoming) ai_verdict screener
# in `app.domain.reports.service`. Keep the alternation in sync with
# the prompt's forbidden-word block in
# apps/api/app/prompts/report/system.j2.
NEGATIVE_KEYWORDS: re.Pattern[str] = re.compile(
    r"(不建议|不通过|不合格|淘汰|不适合|建议放弃|放弃|差距很大|不推荐)"
)


CLEAN_VERDICTS: list[str] = [
    "候选人在指标设计上展现出资深功力,后续可补强业务直觉。",
    "整体表现可控,跨团队协作有真实证据支撑。",
    "技术深度扎实,需要在结构化表达上再练几场。",
    "和岗位 bar 之间还有距离,可以重点练失败复盘的结构。",
    "",
]

VIOLATING_VERDICTS: list[str] = [
    "不建议进入下一轮",
    "建议放弃这位候选人",
    "技术能力不合格",
    "差距很大,建议另寻他人",
    "不通过本轮筛选",
    "不推荐继续推进",
    "整体不适合该岗位",
    "应当淘汰此候选人",
    "可以放弃,水平不到",
]


@pytest.mark.parametrize("verdict", CLEAN_VERDICTS)
def test_clean_ai_verdict_passes(verdict: str) -> None:
    """Known-clean verdicts must NOT be flagged."""
    matches = NEGATIVE_KEYWORDS.findall(verdict)
    assert not matches, (
        f"false positive on clean verdict {verdict!r}: matched {matches!r}"
    )


@pytest.mark.parametrize("verdict", VIOLATING_VERDICTS)
def test_violating_ai_verdict_caught(verdict: str) -> None:
    """Each forbidden phrase must be caught by the regex."""
    matches = NEGATIVE_KEYWORDS.findall(verdict)
    assert matches, (
        f"L0 leak: regex failed to catch forbidden verdict {verdict!r}"
    )


def test_regex_alternation_covers_all_constitution_keywords() -> None:
    """The regex must recognise every keyword listed in
    v32-p0-constraints.md §A5 (sample subset chosen to surface drift)."""
    expected_keywords = [
        "不建议",
        "不通过",
        "不合格",
        "淘汰",
        "不适合",
        "建议放弃",
        "放弃",
        "差距很大",
        "不推荐",
    ]
    for kw in expected_keywords:
        assert NEGATIVE_KEYWORDS.search(kw), (
            f"keyword {kw!r} from §A5 not covered by NEGATIVE_KEYWORDS regex"
        )
