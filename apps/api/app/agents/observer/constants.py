"""Filler words list — L0 red line A9.

This list MUST stay identical to apps/desktop/src/lib/fillerWords.ts.
Both ends are pinned to the exact 7-item Chinese set; either side
drifting on its own breaks the F-310 stat row's promise that the
front-end count and any future server-side analysis agree on what
counts as a filler.

The CI grep in the F-310 acceptance block validates the synchronization
across both files (one match per file).
"""

from __future__ import annotations

from typing import Final

FILLER_WORDS_CN: Final[tuple[str, ...]] = (
    "嗯",
    "呃",
    "那个",
    "就是",
    "这个",
    "反正",
    "然后然后",
)

FILLER_WORDS_LENGTH: Final[int] = 7
