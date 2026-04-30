"""Reflection agent package (F-322 / V32.M3.2.1).

Tenth agent — runs **after** Report finalises (parallel to Coach), takes
the entire Interview transcript + ParseResult + ResearchResult (when
available) and produces a teaching-tone reflection (per-question
coaching cards + a follow-up mock dialogue).

Three guardrail layers (mirrored by ``test_reflection_ethics.py`` +
``test_reflection_no_overlap.py``):

  * **L0 隐私**: ``ReflectionAgentInput`` is ``extra="forbid"``. Resume
    bodies and PII fields cannot reach the prompt.
  * **L0 教学语气护栏 (条款 12)**: ``diagnosis`` / ``mistakes_to_avoid``
    / ``general_growth_advice`` get scrubbed for the same 12 forbidden
    judgmental phrases that gate Coach output (M3.1.1 parity).
    ``mistakes_to_avoid`` items are additionally rewritten to the
    "建议下次" sentence pattern when they read like accusations.
  * **No-overlap with Report**: per-question ``diagnosis`` is regex-
    scanned against ``Report.ai_verdict`` core terms; collisions get
    coerced to a generic teaching prompt (the Report owns "评估", the
    Reflection owns "教学" — see PRD addendum §4).
"""
