"""LangGraph node-name lock test (V32.M0.5).

PRD L0 + AGENTS.md §6 + .ralph/specs/v32-p0-constraints.md §A7 forbid
renaming, merging, or splitting nodes in the per-turn graph
(`apps/api/app/orchestrator/turn_graph.py`). Until this guard existed,
the only protection was a verbal note in PROMPT.md — easy to violate
inadvertently.

The two assertions below run as unit tests on every CI invocation.
A drift in either node-name set or count breaks CI immediately.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.infra.llm.gateway import LLMGateway
from app.orchestrator.turn_graph import build_turn_graph


# A7 red line. The set is the intersection of three sources of truth:
#   - app/orchestrator/turn_graph.py: graph.add_node(...) calls
#   - tests/orchestrator/test_turn_graph.py: RoutingGateway dispatch
#   - The docstring at the top of turn_graph.py (ASCII art)
# Note: the constraint document briefly used "interviewer" for the
# third node; the actual long-standing graph node id is "next_question"
# (the agent that powers it is InterviewerAgent — agent name ≠ node id).
EXPECTED_TURN_GRAPH_NODES: frozenset[str] = frozenset(
    {"turn_assessment", "compression", "next_question"}
)


class _StubGateway(LLMGateway):
    """Minimal gateway stand-in.

    `build_turn_graph` only needs a gateway to close over for the node
    callbacks; the test never invokes the graph end-to-end, so the
    stub's `complete` raises if called.
    """

    async def complete(
        self, messages: list[dict[str, Any]], **_kwargs: Any
    ) -> Any:  # pragma: no cover - never called from contract tests
        raise AssertionError(
            "StubGateway.complete should not be invoked from graph contract tests"
        )


@pytest.fixture
def gateway() -> _StubGateway:
    return _StubGateway()


def _user_nodes(gateway: LLMGateway) -> set[str]:
    """Return the user-defined node id set, filtering LangGraph internals
    (`__start__`, `__end__`, etc.)."""
    graph = build_turn_graph(gateway)
    return {name for name in graph.nodes if not name.startswith("__")}


def test_turn_graph_node_names_are_locked(gateway: _StubGateway) -> None:
    """节点名集合锁:严禁重命名/合并/拆分."""
    actual = _user_nodes(gateway)
    assert actual == set(EXPECTED_TURN_GRAPH_NODES), (
        "turn_graph nodes drift: expected "
        f"{set(EXPECTED_TURN_GRAPH_NODES)}, got {actual}. "
        "See AGENTS.md §6 + v32-p0-constraints.md §A7. New agents "
        "(Coach / Reflection / etc.) must live on their own graph."
    )


def test_turn_graph_node_count_is_three(gateway: _StubGateway) -> None:
    """节点个数锁:严禁加节点(新 Agent 必须独立 graph)."""
    assert len(_user_nodes(gateway)) == 3
