from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class TurnAssessmentSnippet(BaseModel):
    summary: str


class TurnRecord(BaseModel):
    question: str
    answer: str
    assessment: TurnAssessmentSnippet | None = None


class InterviewerAgentInput(BaseModel):
    framework_json: str
    recent_turns: list[TurnRecord]
    long_term_summary: str | None = None
    remaining_minutes: int | None = None


# F-319 V32.M1.4 — per-question follow-up hint cap. The LLM is asked
# to emit 2–3 short ≤8-char "追问线索" chips; an empty list is also
# legal as a graceful-degradation path when the LLM fails to comply.
# Anything in between (1 hint, or any hint > 8 chars) is rejected so
# the UI can rely on the chip row being either empty or fully filled.
_HINT_MAX_CHARS = 8
_HINT_MIN_NON_EMPTY = 2
_HINT_MAX = 3


class InterviewerAgentOutput(BaseModel):
    question: str
    intent: str
    expected_depth: Literal["surface", "tactical", "strategic"]
    # v3.1 legacy single hint, kept for L0 back-compat (still surfaced
    # by `runtime.py` and the report fallback path).
    followup_hint: str | None = None
    should_end: bool = False
    # v3.2+ chip list. `default_factory=list` allows degraded empty
    # output; non-empty must be 2 or 3 items, each ≤ 8 chars.
    followup_hints: list[str] = Field(default_factory=list, max_length=_HINT_MAX)
    # F-309 V32.M2.1.1 — lightweight observation about the previous turn,
    # surfaced in InterviewPage's right aside (LiveObservationCard). Hard
    # cap at 30 chars (stricter than ObserverAgent's 60). Must stay None
    # for `turn 0` (no prior turn to observe). The Interviewer prompt
    # also enforces a non-judgmental tone — not enforceable in code, so
    # the prompt template carries the do-/don't list.
    live_observation: str | None = Field(
        default=None,
        max_length=30,
        description=(
            "≤30 字的轻量观察(对上一轮回答),教学语气非评判式;"
            "turn 0 时为 None"
        ),
    )

    @field_validator("followup_hints")
    @classmethod
    def _validate_each_hint_length(cls, v: list[str]) -> list[str]:
        if 0 < len(v) < _HINT_MIN_NON_EMPTY:
            raise ValueError(
                "followup_hints must be empty (degraded) or "
                f"{_HINT_MIN_NON_EMPTY}-{_HINT_MAX} items, got {len(v)}"
            )
        for hint in v:
            if len(hint) > _HINT_MAX_CHARS:
                raise ValueError(
                    f"hint '{hint}' exceeds {_HINT_MAX_CHARS} chars "
                    f"(length={len(hint)})"
                )
        return v
