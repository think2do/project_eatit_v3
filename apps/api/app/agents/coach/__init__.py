"""Coach agent package (F-318).

Ninth agent. Runs **asynchronously** (`asyncio.create_task` fire-and-forget)
after a report is finalised, aggregating the user's recent reports into a
cross-session ``UserInsightCache``. The cache feeds the Dashboard's AI
recommendation card.

Three guardrails apply (see ``apps/api/app/agents/coach/service.py`` for the
implementation, mirrored against ``test_coach_ethics.py``):

  * **L0 隐私**: ``CoachAgentInput`` is ``extra="forbid"``. Resume bodies and
    PII fields cannot reach the prompt.
  * **L0 教学语气护栏 (条款 12)**: every user-visible text field is scanned
    for the 12 forbidden tone words; hits are coerced to a safe fallback and
    a WARN log is emitted.
  * **场次<3 跳过**: callers (the domain layer in M3.1.2) are responsible for
    skipping the agent when fewer than three reports exist; the schema's
    ``ge=3`` on ``based_on_session_count`` is the safety net.
"""
