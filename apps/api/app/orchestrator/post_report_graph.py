"""Post-report LangGraph (V32.M3.1.2 + V32.M3.2.2 / F-318 + F-322).

Independent of ``turn_graph`` (per L0 A7) and of ``intake_graph``. Runs
**after** ``InterviewReport.status`` reaches ``ready`` to fan out
post-report agents that don't belong on the critical interview path:

  M3.2.2 (current):
      START ──┬─► coach_node ─────────┬──► END
              └─► reflection_node ────┘

The two nodes are independent — Coach is keyed on user, Reflection is
keyed on session — so LangGraph schedules them concurrently. Each node
delegates to a domain service that owns retries, persistence, and
idempotency; failures inside one never starve the other.

Node-name set is locked by ``tests/orchestrator/test_post_report_graph_contract.py``
(A7-style guard, mirroring ``test_graph_contract`` /
``test_intake_graph_contract``). Drift here breaks CI immediately.
"""
from __future__ import annotations

import logging
from typing import Any

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel

from app.domain.coach.service import CoachService
from app.domain.reflection.service import ReflectionService
from app.infra.llm.gateway import LLMGateway

logger = logging.getLogger(__name__)


# A7-style node-name lock. M3.2.2 expanded the set from ``{coach_node}``
# to ``{coach_node, reflection_node}``. Future additions must update both
# the constant AND the contract test in lock-step.
POST_REPORT_GRAPH_NODES: frozenset[str] = frozenset({"coach_node", "reflection_node"})


class PostReportState(BaseModel):
    """Inputs to ``ainvoke``. Outputs are captured per-node so callers
    can log triage signals after fire-and-forget."""

    user_id: str
    last_session_id: str

    coach_skipped: bool = False
    coach_error: str | None = None
    reflection_error: str | None = None


def build_post_report_graph(
    coach_service: CoachService,
    reflection_service: ReflectionService,
    gateway: LLMGateway,
):
    """Compile the post-report ``StateGraph`` bound to coach + reflection
    services + a gateway.

    The gateway is captured at compile time (same pattern as
    ``turn_graph`` and ``intake_graph``). Both services are injected so
    production wiring can swap repos / loaders without touching this
    module.
    """

    async def coach_node(state: PostReportState) -> dict[str, Any]:
        # ``maybe_trigger_after_report`` never raises (it logs + persists
        # a ``failed`` row instead). The try/except here is belt-and-braces
        # for the case where Protocol drift causes some unforeseen surface
        # to bubble up — we still want the graph itself to terminate
        # cleanly so the parallel reflection_node isn't starved.
        try:
            await coach_service.maybe_trigger_after_report(
                state.user_id, state.last_session_id, gateway
            )
            return {"coach_skipped": False, "coach_error": None}
        except Exception as exc:  # noqa: BLE001 — defensive
            logger.warning(
                "post_report_coach_node_unhandled",
                extra={"reason": type(exc).__name__},
            )
            return {"coach_skipped": False, "coach_error": type(exc).__name__}

    async def reflection_node(state: PostReportState) -> dict[str, Any]:
        try:
            await reflection_service.trigger_after_report(
                state.last_session_id, gateway
            )
            return {"reflection_error": None}
        except Exception as exc:  # noqa: BLE001 — defensive
            logger.warning(
                "post_report_reflection_node_unhandled",
                extra={"reason": type(exc).__name__},
            )
            return {"reflection_error": type(exc).__name__}

    graph = StateGraph(PostReportState)
    graph.add_node("coach_node", coach_node)
    graph.add_node("reflection_node", reflection_node)
    # Parallel fan-out from START. LangGraph schedules both nodes
    # concurrently when neither depends on the other's output.
    graph.add_edge(START, "coach_node")
    graph.add_edge(START, "reflection_node")
    graph.add_edge("coach_node", END)
    graph.add_edge("reflection_node", END)
    return graph.compile()


__all__ = [
    "POST_REPORT_GRAPH_NODES",
    "PostReportState",
    "build_post_report_graph",
]
