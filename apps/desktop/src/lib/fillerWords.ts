// L0 red line A9 — locked filler-word list (7 items, exact set).
// Mirrored on the backend in apps/api/app/agents/observer/constants.py.
// Editing this file (add / remove / rename a word) requires a coordinated
// L0 review and a corresponding edit on the backend in the same PR.
//
// `as const` freezes the tuple type so misuse like `.push()` fails at
// compile time. The L0 lock test (__tests__/fillerWords.test.ts) pins
// the literal set against drift even if the type guard is loosened.
export const FILLER_WORDS_CN = [
  "嗯",
  "呃",
  "那个",
  "就是",
  "这个",
  "反正",
  "然后然后",
] as const;

export const FILLER_WORDS_LENGTH = 7 as const;

export type FillerWord = (typeof FILLER_WORDS_CN)[number];
