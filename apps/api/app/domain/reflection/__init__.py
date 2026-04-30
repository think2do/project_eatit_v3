"""Reflection domain layer (F-322 / V32.M3.2.2).

Drives the post-report Reflection trigger. Same fire-and-forget shape
the Coach trigger uses (M3.1.2): the post_report_graph spawns
``coach_node`` and ``reflection_node`` in parallel, both call into a
domain service that owns idempotency / persistence / failure semantics,
and neither can flip the report status away from ``READY``.

Loader + repository are split into Protocols so:
  * Tests can inject scripted fakes for the LLM-side ``ReflectionAgentInput``
    build and the persistence layer separately.
  * Production wiring uses ``DBReflectionReportLoader`` (joins reports +
    turns out of SQLite) and ``SqlAlchemyReflectionReportRepository``.
"""
