"""F-309 V32.M2.1.1 — InterviewerAgentOutput.live_observation contract.

The Interviewer Agent produces a single ≤ 30-char observation each
turn (≥ 1) for the right-aside LiveObservationCard. Hard rules:

- Length cap is 30 chars (stricter than the 60-char ObserverAgent).
- `turn 0` has no prior turn → field must stay None. The runtime
  force-resets it to None at the call site (see `runtime.py`), so
  the schema only needs to accept `None`.
- The non-judgmental tone requirement is **prompt-only**: the LLM is
  shown a do / don't list in the system prompt, but runtime does NOT
  regex-scan the output. This is a deliberate trade-off — false
  positives on legitimate tactical phrases ("可补判断维度") would do
  more harm than rare LLM tone slips. These tests pin the prompt
  template (the only enforcement surface) but make no claim about
  what the runtime will do with a tone-violating LLM output.
"""

from __future__ import annotations

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


def test_prompt_template_contains_donts() -> None:
    """A12 教学语气护栏 (G2 fix, 2026-04-30 audit).

    The original test in this slot regex-matched the don't-examples
    against a judgmental regex — but the regex was constructed *from*
    those exact strings, so it was a self-fulfilling tautology and
    proved nothing. Replaced with a literal-text check that the
    prompt actually carries both do- and don't-examples for the LLM
    to learn from in-context.

    Important: runtime does NOT scan LLM outputs for these patterns.
    Tone enforcement is prompt-only; an LLM tone slip will pass the
    Pydantic schema (it only caps length). This is a documented
    trade-off (see module docstring)."""
    template = (
        Path(__file__).resolve().parents[2]
        / "app"
        / "prompts"
        / "interviewer"
        / "system.j2"
    ).read_text(encoding="utf-8")
    # don't examples: the prompt must explicitly show the LLM the
    # judgmental phrasing it should avoid.
    for bad in ("你回答得很差", "完全没有抓住要点", "缺乏深度"):
        assert bad in template, f"prompt missing don't sample {bad!r}"
    # do examples: pedagogical samples the LLM can mimic.
    assert "结构清晰" in template, "prompt missing 'do' sample (结构清晰…)"
    assert "举例具体" in template, "prompt missing 'do' sample (举例具体…)"
