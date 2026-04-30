#!/usr/bin/env python3
"""F-308 InterviewerPersona name lock — pre-commit / CI hook.

Greps `apps/api/app/agents/interviewer/personas.py` for `name="..."`
patterns and exits non-zero if the captured set drifts away from the
locked four. Pairs with `tests/agents/test_persona_lock.py` (Pydantic-
level) and the `Literal[...]` type annotation in personas.py itself —
three independent layers, all must stay aligned.

Usage:
    python scripts/persona_name_guard.py        # exits 0 / 1
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


LOCKED_NAMES: frozenset[str] = frozenset(
    {"Sarah", "Marcus", "Lin", "Daniel"}
)


def main() -> int:
    persona_file = (
        Path(__file__).resolve().parent.parent
        / "apps"
        / "api"
        / "app"
        / "agents"
        / "interviewer"
        / "personas.py"
    )
    if not persona_file.exists():
        # In a clean checkout where M1.2 hasn't run yet, the file is
        # legitimately absent — skip rather than fail. Once it lands,
        # this branch never fires again.
        print(f"⚠️  {persona_file.relative_to(Path(__file__).resolve().parent.parent)} missing — skipping lock check")
        return 0

    text = persona_file.read_text(encoding="utf-8")
    # Match `name="Sarah"` and `name='Sarah'` patterns. The PERSONA_NAME
    # Literal declaration itself contains the four legal names — that's
    # by design (the guard catches drift in both the Literal *and* the
    # PERSONA_MAP construction sites).
    found = set(re.findall(r"name=[\"']([^\"']+)[\"']", text))
    if found != set(LOCKED_NAMES):
        missing = set(LOCKED_NAMES) - found
        extra = found - set(LOCKED_NAMES)
        print("❌ Persona name lock violated.")
        if missing:
            print(f"   Missing: {sorted(missing)}")
        if extra:
            print(f"   Unexpected: {sorted(extra)}")
        print(
            "   See .ralph/specs/v32-p0-constraints.md §A6 + "
            "AGENTS.md §6 + tests/agents/test_persona_lock.py."
        )
        return 1

    print("✅ Persona names locked.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
