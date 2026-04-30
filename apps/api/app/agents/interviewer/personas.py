"""F-308 InterviewerPersona — 4-name lock (V32.M1.2).

Each v3.2 InterviewStyleV32 maps to exactly one named virtual
interviewer. The names are an L0 red line (.ralph/specs/
v32-p0-constraints.md §A6 + PROMPT.md "Protected paths"):

    Sarah  ← structured
    Marcus ← pressure
    Lin    ← friendly
    Daniel ← expert

The constants below enforce the lock at three layers:
  1. `PERSONA_NAME = Literal[...]` — Pydantic refuses any other name
     during construction. Constructing the persona with an alien
     name raises ValidationError.
  2. `PERSONA_MAP: Final[...]` — typing.Final discourages reassignment
     in code review and gives type-checkers a hard signal.
  3. `tests/agents/test_persona_lock.py` — runtime contract test (5
     cases) + `scripts/persona_name_guard.py` regex sweep (CI hook).

Renaming any of the four to a different first name must therefore
trip CI in three different places. New agents (Coach / Reflection /
v3.3 etc.) are free to define their own personas in their own
modules — but the four below stay frozen.
"""

from __future__ import annotations

from typing import Final, Literal

from pydantic import BaseModel

from app.models.enums import InterviewStyleV32


PERSONA_NAME = Literal["Sarah", "Marcus", "Lin", "Daniel"]


class InterviewerPersona(BaseModel):
    """A virtual interviewer's identity packet.

    Carries enough metadata to be rendered into both the interviewer
    prompt (for first-person tone) and the report agent prompt (for
    third-person attribution in `ai_verdict`). The `keywords` triple
    is intentionally fixed-width so prompt templates can rely on
    three slots without conditional rendering.
    """

    name: PERSONA_NAME
    style: InterviewStyleV32
    keywords: tuple[str, str, str]


PERSONA_MAP: Final[dict[InterviewStyleV32, InterviewerPersona]] = {
    "structured": InterviewerPersona(
        name="Sarah",
        style="structured",
        keywords=("逻辑清晰", "节奏稳定", "客观中立"),
    ),
    "pressure": InterviewerPersona(
        name="Marcus",
        style="pressure",
        keywords=("直接犀利", "连续追问", "质疑判断"),
    ),
    "friendly": InterviewerPersona(
        name="Lin",
        style="friendly",
        keywords=("引导式", "协助展开", "适度肯定"),
    ),
    "expert": InterviewerPersona(
        name="Daniel",
        style="expert",
        keywords=("行业视角", "案例迁移", "商业本质"),
    ),
}


def get_persona(style: str) -> InterviewerPersona:
    """Return the persona for a v3.2 style id, falling back to Sarah.

    Defensive default: if the style string is unrecognised (legacy
    payload that slipped past the upgrade validator, garbage from
    the LLM, etc.), return the structured/Sarah persona rather than
    raising. Prompt rendering should never fail just because a stale
    style label survived.
    """
    if style in PERSONA_MAP:
        return PERSONA_MAP[style]
    return PERSONA_MAP["structured"]
