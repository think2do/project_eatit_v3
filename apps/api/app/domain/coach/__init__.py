"""Coach domain layer (F-318 / V32.M3.1.2).

Drives the post-report Coach trigger:

  * Counts the user's recent reports; ``< 3`` → upsert ``skipped`` and
    return without invoking the LLM.
  * Idempotency check: if the cached insight was already based on the
    incoming ``last_session_id``, skip — re-running a Coach for the same
    session would just burn tokens.
  * Otherwise mark ``running``, call ``CoachAgentService``, persist
    ``ok`` (or ``failed`` on exception). Coach failures are caught and
    logged — they MUST NOT bubble up into ``_generate_report_task`` and
    flip the report status away from ``READY`` (PRD §0.4 + AGENTS.md
    §6 红线第 3 条).

The repository abstraction is a Pydantic-side ``Protocol`` so the
SQLAlchemy backing (``user_insight_cache`` table) can land in the next
node (V32.M3.1.3) without rewiring the trigger here.
"""
