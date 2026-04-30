"""V32.M3.1.2 + V32.M3.2.2 — post_report_graph node-name lock test
(F-318 + F-322).

Mirrors the A7-style guard ``test_graph_contract.py`` /
``test_intake_graph_contract.py`` already enforce on the per-turn and
intake graphs. The post-report graph is the third independent LangGraph
in the system; M3.2.2 expanded the locked set from
``{coach_node}`` to ``{coach_node, reflection_node}``. Future additions
must update both this test AND the source constant in lock-step.

Drift here breaks CI immediately, which is exactly what we want — the
A7 red line says new agents must live on their own graph, not on
``turn_graph``.
"""
from __future__ import annotations

from typing import Any

import pytest

from app.agents.coach.schemas import UserInsightCache
from app.agents.reflection.schemas import ReflectionAgentInput, ReflectionReport
from app.domain.coach.service import (
    CoachService,
    _InMemoryUserInsightCacheRepository,
)
from app.domain.reflection.service import ReflectionService
from app.infra.llm.gateway import LLMGateway
from app.orchestrator.post_report_graph import (
    POST_REPORT_GRAPH_NODES,
    PostReportState,
    build_post_report_graph,
)


# A7-style lock. M3.2.2 expanded the set from ``{coach_node}`` to
# ``{coach_node, reflection_node}``. Update this constant AND the source
# constant in ``app.orchestrator.post_report_graph`` together when the
# graph grows again.
EXPECTED_POST_REPORT_NODES: frozenset[str] = frozenset(
    {"coach_node", "reflection_node"}
)


class _StubGateway(LLMGateway):
    async def complete(
        self, messages: list[dict[str, Any]], **_kwargs: Any
    ) -> Any:  # pragma: no cover — never invoked from contract tests
        raise AssertionError(
            "post_report_graph contract tests must not call the real gateway"
        )


class _StubReportsReader:
    """Returns a fixed list — contract tests shouldn't depend on DB state."""

    def __init__(self, payloads: list[dict] | None = None) -> None:
        self._payloads = payloads or []

    async def list_recent_report_payloads(
        self, user_id: str, *, limit: int = 5
    ) -> list[dict]:
        return list(self._payloads)


class _StubReflectionLoader:
    """No-op loader — contract tests focus on graph wiring, not the
    persisted reflection payload."""

    async def build_input(self, session_id: str) -> ReflectionAgentInput | None:
        return None


class _StubReflectionRepo:
    """In-memory reflection cache used by the graph contract tests.

    Tracks calls to upsert_running / upsert_ok / upsert_failed so tests
    can assert that the graph exercised the correct lifecycle path.
    """

    def __init__(self) -> None:
        self._row: ReflectionReport | None = None
        self.running_calls: list[str] = []
        self.ok_calls: list[ReflectionReport] = []
        self.failed_calls: list[str] = []

    async def get_by_session(self, session_id: str) -> ReflectionReport | None:
        return self._row

    async def upsert_running(self, session_id: str) -> None:
        self.running_calls.append(session_id)

    async def upsert_ok(self, payload: ReflectionReport) -> None:
        self._row = payload
        self.ok_calls.append(payload)

    async def upsert_failed(self, session_id: str) -> None:
        self.failed_calls.append(session_id)


@pytest.fixture
def gateway() -> _StubGateway:
    return _StubGateway()


@pytest.fixture
def reflection_service() -> ReflectionService:
    return ReflectionService(
        repo=_StubReflectionRepo(),
        loader=_StubReflectionLoader(),
    )


@pytest.fixture
def coach_service() -> CoachService:
    return CoachService(
        cache_repo=_InMemoryUserInsightCacheRepository(),
        reports_reader=_StubReportsReader(),
    )


def _user_nodes(graph: Any) -> set[str]:
    return {name for name in graph.nodes if not name.startswith("__")}


def test_post_report_graph_node_names_are_locked(
    coach_service: CoachService,
    reflection_service: ReflectionService,
    gateway: _StubGateway,
) -> None:
    """节点名集合锁:严禁重命名/合并/拆分."""
    graph = build_post_report_graph(coach_service, reflection_service, gateway)
    actual = _user_nodes(graph)
    assert actual == set(POST_REPORT_GRAPH_NODES) == set(EXPECTED_POST_REPORT_NODES), (
        "post_report_graph nodes drift: expected "
        f"{set(EXPECTED_POST_REPORT_NODES)}, got {actual}."
    )


def test_post_report_graph_node_count_is_two(
    coach_service: CoachService,
    reflection_service: ReflectionService,
    gateway: _StubGateway,
) -> None:
    """节点个数锁:M3.2.2 起 graph 含 coach_node + reflection_node 两节点."""
    graph = build_post_report_graph(coach_service, reflection_service, gateway)
    assert len(_user_nodes(graph)) == 2


async def test_post_report_graph_invokes_coach_below_threshold(
    reflection_service: ReflectionService,
    gateway: _StubGateway,
) -> None:
    """场次<3 走 skipped path,graph 终止干净。"""
    cache_repo = _InMemoryUserInsightCacheRepository()
    coach_service = CoachService(
        cache_repo=cache_repo,
        reports_reader=_StubReportsReader([{"r": 1}, {"r": 2}]),  # only 2
    )
    graph = build_post_report_graph(coach_service, reflection_service, gateway)

    state = PostReportState(user_id="u-1", last_session_id="s-2")
    result = await graph.ainvoke(state.model_dump())

    assert result["coach_error"] is None
    assert result["reflection_error"] is None
    cached = await cache_repo.get("u-1")
    assert cached is not None
    assert cached.status == "skipped"


async def test_post_report_graph_runs_coach_and_reflection_in_parallel(
    coach_service: CoachService, gateway: _StubGateway
) -> None:
    """Both nodes run; reflection_node consults its own service."""
    repo = _StubReflectionRepo()
    reflection_service = ReflectionService(
        repo=repo, loader=_StubReflectionLoader()
    )
    graph = build_post_report_graph(coach_service, reflection_service, gateway)

    state = PostReportState(user_id="u-1", last_session_id="s-3")
    result = await graph.ainvoke(state.model_dump())

    # Both nodes terminated cleanly. Reflection loader returned None
    # (no input) so trigger short-circuits without touching the repo.
    assert result["coach_error"] is None
    assert result["reflection_error"] is None
    assert repo.running_calls == []
    assert repo.ok_calls == []
    assert repo.failed_calls == []


def test_turn_graph_contract_unchanged() -> None:
    """L0 A7 — adding post_report_graph must not drift the per-turn graph."""
    from app.orchestrator.turn_graph import build_turn_graph

    gateway = _StubGateway()
    turn_graph = build_turn_graph(gateway)
    user_nodes = {name for name in turn_graph.nodes if not name.startswith("__")}
    assert user_nodes == {"turn_assessment", "compression", "next_question"}


def test_user_insight_cache_round_trip() -> None:
    """The graph hands ``UserInsightCache`` payloads to the cache repo;
    sanity-check the round-trip so contract drift on the schema side
    surfaces here too."""
    payload = UserInsightCache(
        user_id="u-1",
        based_on_session_count=3,
        based_on_last_session_id="s-3",
        headline="继续聚焦数据驱动方向",
        headline_detail="近三场表现稳定提升,建议针对业务直觉做 2 场专项",
        recurring_weaknesses=["指标拆解深度不足"],
        improvement_signals=["近三场结构化表达提升"],
        next_focus_areas=["data-driven"],
        generated_at="2026-04-30T12:00:00+00:00",  # type: ignore[arg-type]
        status="ok",
    )
    encoded = payload.model_dump_json()
    decoded = UserInsightCache.model_validate_json(encoded)
    assert decoded.based_on_last_session_id == "s-3"
    assert decoded.status == "ok"
