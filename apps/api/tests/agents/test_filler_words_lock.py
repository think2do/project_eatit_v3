"""L0 A9 — backend FILLER_WORDS_CN lock + frontend mirror guard.

The filler-word list is an L0 red line: edits require coordinated
review on BOTH the frontend (apps/desktop/src/lib/fillerWords.ts) and
backend (apps/api/app/agents/observer/constants.py) sides. Drifting on
either side breaks F-310's promise that the live stat row count and
any future server-side analysis agree on what counts as a filler.

The frontend already has its own lock test
(apps/desktop/src/__tests__/fillerWords.test.ts). This test adds the
backend half AND a cross-file diff so silent one-sided edits fail
in CI rather than slip through unnoticed (G3 fix, 2026-04-30 audit).
"""

from __future__ import annotations

import re
from pathlib import Path

from app.agents.observer.constants import FILLER_WORDS_CN, FILLER_WORDS_LENGTH

EXPECTED: tuple[str, ...] = ("嗯", "呃", "那个", "就是", "这个", "反正", "然后然后")


def test_filler_words_length_is_seven() -> None:
    assert FILLER_WORDS_LENGTH == 7
    assert len(FILLER_WORDS_CN) == 7


def test_filler_words_exact_content_in_order() -> None:
    """Order matters too — the array index is part of the lock so a
    silent reordering also trips the test."""
    assert tuple(FILLER_WORDS_CN) == EXPECTED


def test_filler_words_no_duplicates() -> None:
    assert len(set(FILLER_WORDS_CN)) == 7


def test_filler_words_matches_frontend_mirror() -> None:
    """Cross-file lock: the frontend file must declare the exact same
    7 words in the exact same order. Either side editing alone fails."""
    fe_path = (
        Path(__file__).resolve().parents[3]
        / "desktop"
        / "src"
        / "lib"
        / "fillerWords.ts"
    )
    assert fe_path.exists(), f"frontend fillerWords.ts missing at {fe_path}"
    text = fe_path.read_text(encoding="utf-8")
    # The first 7 double-quoted string literals in the file are the
    # filler words (the file's leading comments use // and contain no
    # quoted strings; the export array is the only quoted region).
    found = tuple(re.findall(r'"([^"]+)"', text)[:7])
    assert found == EXPECTED, (
        f"frontend fillerWords drifted: {found!r} != {EXPECTED!r}; "
        "L0 A9 requires coordinated edits on both sides"
    )
