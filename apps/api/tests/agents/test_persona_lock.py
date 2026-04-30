"""F-308 InterviewerPersona name lock — A6 red-line contract test.

The 4 persona names (Sarah / Marcus / Lin / Daniel) are an L0
red line. These five tests run on every CI invocation and trip
on any rename / addition / removal. A separate
`scripts/persona_name_guard.py` regex hook also runs at commit /
CI time as a belt-and-braces check.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.agents.interviewer.personas import (
    PERSONA_MAP,
    InterviewerPersona,
    get_persona,
)


def test_persona_map_has_4_styles() -> None:
    """All four v3.2 styles must be keys in PERSONA_MAP."""
    assert set(PERSONA_MAP.keys()) == {
        "structured",
        "pressure",
        "friendly",
        "expert",
    }


def test_persona_names_are_locked() -> None:
    """A6: the four names are exactly Sarah / Marcus / Lin / Daniel.
    No aliases (Alice / Emma / Bob / etc.) are ever permitted."""
    names = {p.name for p in PERSONA_MAP.values()}
    assert names == {"Sarah", "Marcus", "Lin", "Daniel"}


def test_constructing_with_alien_name_fails() -> None:
    """Pydantic Literal must refuse names outside the set."""
    with pytest.raises(ValidationError):
        InterviewerPersona(
            name="Alice",  # type: ignore[arg-type]  # not in Literal
            style="structured",
            keywords=("a", "b", "c"),
        )


def test_get_persona_fallback_to_sarah() -> None:
    """Unknown style strings fall back to the structured/Sarah persona
    (defensive default — prompt rendering must never fail on stale
    style labels)."""
    p = get_persona("nonexistent_style")
    assert p.name == "Sarah"
    assert p.style == "structured"


def test_each_style_maps_to_correct_name() -> None:
    """The four style→name pairings are themselves frozen."""
    assert PERSONA_MAP["structured"].name == "Sarah"
    assert PERSONA_MAP["pressure"].name == "Marcus"
    assert PERSONA_MAP["friendly"].name == "Lin"
    assert PERSONA_MAP["expert"].name == "Daniel"
