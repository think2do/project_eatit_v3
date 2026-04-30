"""F-309 V32.M2.1.1 — InterviewerAgentOutput.live_observation contract.

The Interviewer Agent produces a single ≤ 30-char observation each
turn (≥ 1) for the right-aside LiveObservationCard. Hard rules:

- Length cap is 30 chars (stricter than the 60-char ObserverAgent).
- `turn 0` has no prior turn → field must stay None. The runtime
  force-resets it to None at the call site (see `runtime.py`), so
  the schema only needs to accept `None`.
- The non-judgmental tone requirement is enforced by the prompt
  template (do/don't list); these tests pin the template's contract
  via a regex sweep instead of a runtime check (the LLM output is
  not inspected for tone after generation).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.agents.interviewer.schemas import InterviewerAgentOutput

# Mirrors the minimum legal payload used by test_followup_hints.py so
# every test only varies the field under test.
VALID_BASE: dict = {
    "question": "你最近一次主导上线是什么项目?",
    "intent": "深挖项目背景",
    "expected_depth": "tactical",
}


def test_live_observation_30_chars_ok() -> None:
    obs = "结构清晰但优先级判断一带而过缺补充示例数据支撑稍弱再补一句话"
    assert len(obs) == 30
    out = InterviewerAgentOutput(**VALID_BASE, live_observation=obs)
    assert out.live_observation == obs


def test_live_observation_31_chars_rejected() -> None:
    with pytest.raises(ValidationError) as ei:
        InterviewerAgentOutput(**VALID_BASE, live_observation="a" * 31)
    assert "at most 30" in str(ei.value) or "max_length" in str(ei.value)


def test_live_observation_default_is_none() -> None:
    out = InterviewerAgentOutput(**VALID_BASE)
    assert out.live_observation is None


def test_live_observation_explicit_none_for_turn_0() -> None:
    out = InterviewerAgentOutput(**VALID_BASE, live_observation=None)
    assert out.live_observation is None


def test_live_observation_short_compliant_sample_ok() -> None:
    out = InterviewerAgentOutput(
        **VALID_BASE, live_observation="举例具体,数据有支撑;可补判断维度"
    )
    assert out.live_observation is not None
    assert len(out.live_observation) <= 30


def test_prompt_template_carries_live_observation_contract() -> None:
    """Lock the do/don't list in the prompt — the only place tone gets
    enforced. Drift here means the LLM loses its guardrails."""
    template = (
        Path(__file__).resolve().parents[2]
        / "app"
        / "prompts"
        / "interviewer"
        / "system.j2"
    ).read_text(encoding="utf-8")
    assert "live_observation" in template
    assert "≤ 30 字" in template
    assert "教学语气" in template
    # Each violating sample is named in the prompt so the LLM has the
    # negative examples in-context.
    for bad in ("你回答得很差", "完全没有抓住要点", "缺乏深度"):
        assert bad in template, f"missing violating sample {bad!r} in prompt"


def test_prompt_template_violating_samples_match_judgmental_regex() -> None:
    """Cross-check: the violating examples in the prompt actually match
    the judgmental-tone regex documented in the spec, so the prompt's
    pedagogy stays consistent (do/don't pairs are genuinely opposite)."""
    judgmental = re.compile(r"(你.*差|完全没有|缺乏)")
    for sample in ("你回答得很差", "完全没有抓住要点", "缺乏深度"):
        assert judgmental.search(sample), sample
