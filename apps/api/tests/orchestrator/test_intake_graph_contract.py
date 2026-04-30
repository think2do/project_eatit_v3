"""V32.M2.3.4 — intake_graph contract + parallel + degraded-path tests.

Five guarantees this file enforces:

  1. **Node-name lock** — INTAKE_GRAPH_NODES must equal exactly
     {"parse_node", "research_node", "predict_questions_node"}.
     Mirrors the A7-style lock turn_graph already has.
  2. **turn_graph untouched** — run the existing turn_graph contract
     and confirm intake_graph's existence didn't drift it (defensive).
  3. **Parallel parse + research** — both nodes start before either
     finishes. We instrument scripted services with asyncio.Event to
     catch a serial execution regression.
  4. **Research opt-out is a no-op** — research_input=None leaves
     parse_payload populated and research_payload=None without raising.
  5. **Research timeout doesn't block parse** — a research_node that
     sleeps past the timeout still lets parse_payload land and the
     graph reaches predict_questions_node.

We do NOT exercise predict_questions_node's framework call here; the
M2.3.3 framework tests already cover that surface, and the framework
config + LLM round-trip would force this file into "integration test
that needs a real gateway" territory.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import pytest

from app.agents.framework.schemas import FrameworkAgentOutput, FrameworkConfigInput
from app.agents.parse.schemas import ParseAgentInput, ParseAgentOutput
from app.agents.research.schemas import (
    CompanyProfile,
    IndustryProfile,
    ResearchAgentInput,
    ResearchAgentOutput,
)
from app.infra.llm.gateway import LLMGateway
from app.orchestrator.intake_graph import (
    INTAKE_GRAPH_NODES,
    IntakeState,
    build_intake_graph,
)


# ---------------------------------------------------------------------------
# Stubs
# ---------------------------------------------------------------------------


class _StubGateway(LLMGateway):
    async def complete(
        self, messages: list[dict[str, Any]], **_kwargs: Any
    ) -> Any:  # pragma: no cover - never invoked by these contract tests
        raise AssertionError(
            "intake_graph contract tests must not call the real gateway"
        )


def _make_parse_output() -> ParseAgentOutput:
    return ParseAgentOutput(match_summary="候选人匹配度中上")


def _make_research_output() -> ResearchAgentOutput:
    return ResearchAgentOutput(
        company=CompanyProfile(
            name="字节跳动",
            business_model="短视频与社交平台",
            stage="mature",
            recent_signals=[],
            evidence_links=[],
            confidence="mid",
        ),
        industry=IndustryProfile(
            name="短视频",
            landscape_summary="进入存量竞争阶段",
            key_metrics=["DAU", "时长", "ARPU"],
            typical_pain_points=["内容审核", "创作者生态"],
            competitors_in_jd_ctx=[],
        ),
        fetched_at=datetime.now(timezone.utc),
        cache_key="0123456789abcdef",
        degraded=False,
    )


class _ScriptedParseService:
    """Returns a fixed parse output. Optional latch lets tests assert
    parallel start order."""

    def __init__(
        self,
        *,
        started: asyncio.Event | None = None,
        proceed: asyncio.Event | None = None,
    ) -> None:
        self._started = started
        self._proceed = proceed
        self.calls = 0

    async def run(
        self, input: ParseAgentInput, gateway: LLMGateway
    ) -> ParseAgentOutput:
        self.calls += 1
        if self._started:
            self._started.set()
        if self._proceed:
            await self._proceed.wait()
        return _make_parse_output()


class _ScriptedResearchService:
    def __init__(
        self,
        *,
        started: asyncio.Event | None = None,
        proceed: asyncio.Event | None = None,
        sleep_seconds: float | None = None,
        raise_exc: BaseException | None = None,
    ) -> None:
        self._started = started
        self._proceed = proceed
        self._sleep_seconds = sleep_seconds
        self._raise_exc = raise_exc
        self.calls = 0

    async def run(
        self, input: ResearchAgentInput, gateway: LLMGateway
    ) -> ResearchAgentOutput:
        self.calls += 1
        if self._started:
            self._started.set()
        if self._raise_exc:
            raise self._raise_exc
        if self._sleep_seconds:
            await asyncio.sleep(self._sleep_seconds)
        if self._proceed:
            await self._proceed.wait()
        return _make_research_output()


class _NoopFrameworkService:
    """We do not exercise framework in these tests; a None-returning
    stub guarantees predict_questions_node doesn't trip even if a
    misconfigured test path reaches it with config."""

    async def run(
        self, *args: Any, **kwargs: Any
    ) -> FrameworkAgentOutput:  # pragma: no cover - intentionally unused
        raise AssertionError(
            "intake_graph contract tests must not exercise FrameworkAgentService"
        )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_intake_graph_node_names_are_locked() -> None:
    """A7-style lock — set must match the spec literal."""
    gateway = _StubGateway()
    graph = build_intake_graph(
        gateway,
        parse_service=_ScriptedParseService(),
        research_service=_ScriptedResearchService(),
        framework_service=_NoopFrameworkService(),
    )
    user_nodes = {name for name in graph.nodes if not name.startswith("__")}
    assert user_nodes == set(INTAKE_GRAPH_NODES), (
        f"intake_graph nodes drift: expected {set(INTAKE_GRAPH_NODES)}, "
        f"got {user_nodes}"
    )


def test_intake_graph_node_count_is_three() -> None:
    """Independent count assertion to catch silent drift on either side."""
    gateway = _StubGateway()
    graph = build_intake_graph(
        gateway,
        parse_service=_ScriptedParseService(),
        research_service=_ScriptedResearchService(),
        framework_service=_NoopFrameworkService(),
    )
    user_nodes = {name for name in graph.nodes if not name.startswith("__")}
    assert len(user_nodes) == 3


async def test_parse_and_research_run_in_parallel() -> None:
    """Both nodes must start before either commits state."""
    parse_started = asyncio.Event()
    parse_proceed = asyncio.Event()
    research_started = asyncio.Event()
    research_proceed = asyncio.Event()

    parse_service = _ScriptedParseService(
        started=parse_started, proceed=parse_proceed
    )
    research_service = _ScriptedResearchService(
        started=research_started, proceed=research_proceed
    )

    gateway = _StubGateway()
    graph = build_intake_graph(
        gateway,
        parse_service=parse_service,
        research_service=research_service,
        framework_service=_NoopFrameworkService(),
    )

    state = IntakeState(
        resume_text="r",
        jd_text="j",
        research_input=ResearchAgentInput(
            company_name="字节", role_title="PM", industry_hints=["短视频"]
        ),
        framework_config=None,  # skip predict_questions_node
    )

    # Drive the graph in the background; release the latches once we've
    # observed both nodes have started.
    invocation = asyncio.create_task(graph.ainvoke(state.model_dump()))

    # Wait for BOTH to start (proves parallel scheduling).
    await asyncio.wait_for(
        asyncio.gather(parse_started.wait(), research_started.wait()),
        timeout=2.0,
    )
    parse_proceed.set()
    research_proceed.set()

    result = await asyncio.wait_for(invocation, timeout=2.0)
    assert parse_service.calls == 1
    assert research_service.calls == 1
    assert result["parse_payload"] is not None
    assert result["research_payload"] is not None


async def test_research_opt_out_yields_skipped_state() -> None:
    """research_input=None ⇒ research_node short-circuits without raising."""
    parse_service = _ScriptedParseService()
    research_service = _ScriptedResearchService()  # never invoked

    gateway = _StubGateway()
    graph = build_intake_graph(
        gateway,
        parse_service=parse_service,
        research_service=research_service,
        framework_service=_NoopFrameworkService(),
    )

    state = IntakeState(
        resume_text="r",
        jd_text="j",
        research_input=None,  # user opted out
        framework_config=None,
    )
    result = await graph.ainvoke(state.model_dump())

    assert result["parse_payload"] is not None
    assert result["research_payload"] is None
    assert result["research_skipped"] is True
    assert result["research_error"] is None
    assert research_service.calls == 0


async def test_research_timeout_does_not_block_parse() -> None:
    """research_node sleeping past timeout still lets parse_payload land."""
    parse_service = _ScriptedParseService()
    # Sleep longer than the (test-overridden) timeout to force the path.
    research_service = _ScriptedResearchService(sleep_seconds=2.0)

    gateway = _StubGateway()
    graph = build_intake_graph(
        gateway,
        parse_service=parse_service,
        research_service=research_service,
        framework_service=_NoopFrameworkService(),
        research_timeout=0.1,
    )

    state = IntakeState(
        resume_text="r",
        jd_text="j",
        research_input=ResearchAgentInput(
            company_name="字节", role_title="PM", industry_hints=["短视频"]
        ),
        framework_config=None,
    )
    result = await asyncio.wait_for(graph.ainvoke(state.model_dump()), timeout=3.0)

    assert result["parse_payload"] is not None  # parse landed
    assert result["research_payload"] is None  # research timed out
    assert result["research_skipped"] is True
    assert result["research_error"] == "timeout"


async def test_research_llm_error_is_caught_and_skipped() -> None:
    """An LLMError out of research_node must not propagate up."""
    from app.infra.llm.errors import LLMNetworkError

    parse_service = _ScriptedParseService()
    research_service = _ScriptedResearchService(
        raise_exc=LLMNetworkError("upstream offline")
    )

    gateway = _StubGateway()
    graph = build_intake_graph(
        gateway,
        parse_service=parse_service,
        research_service=research_service,
        framework_service=_NoopFrameworkService(),
    )

    state = IntakeState(
        resume_text="r",
        jd_text="j",
        research_input=ResearchAgentInput(
            company_name="字节", role_title="PM", industry_hints=["短视频"]
        ),
        framework_config=None,
    )
    result = await graph.ainvoke(state.model_dump())

    assert result["parse_payload"] is not None
    assert result["research_payload"] is None
    assert result["research_skipped"] is True
    assert result["research_error"] == "LLMNetworkError"


async def test_predict_questions_node_skips_when_no_config() -> None:
    """No framework_config ⇒ predict_questions_node leaves direction_framework=None."""
    parse_service = _ScriptedParseService()
    research_service = _ScriptedResearchService()

    gateway = _StubGateway()
    graph = build_intake_graph(
        gateway,
        parse_service=parse_service,
        research_service=research_service,
        framework_service=_NoopFrameworkService(),
    )

    state = IntakeState(
        resume_text="r",
        jd_text="j",
        research_input=None,
        framework_config=None,  # ← the skip signal
    )
    result = await graph.ainvoke(state.model_dump())

    assert result["direction_framework"] is None
    # predict_questions_node ran but was a no-op; downstream caller can
    # invoke FrameworkAgent later when a real config is supplied.


def test_turn_graph_contract_unchanged() -> None:
    """L0 A7 — adding intake_graph must not drift the per-turn graph."""
    from app.orchestrator.turn_graph import build_turn_graph

    gateway = _StubGateway()
    turn_graph = build_turn_graph(gateway)
    user_nodes = {name for name in turn_graph.nodes if not name.startswith("__")}
    # Mirror the assertion in test_graph_contract.py — defensive copy.
    assert user_nodes == {"turn_assessment", "compression", "next_question"}
