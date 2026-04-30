"""V32.M2.3.4 + M2.3.X audit-fix — intake_graph contract & wiring tests.

Six guarantees this file enforces (post-audit):

  1. **Node-name lock** — INTAKE_GRAPH_NODES must equal exactly
     {"parse_node", "research_node", "predict_questions_node"}.
     Mirrors the A7-style lock turn_graph already has.
  2. **turn_graph untouched** — run the existing turn_graph contract
     and confirm intake_graph's existence didn't drift it (defensive).
  3. **Sequential parse → research** (was parallel pre-audit) — Parse
     must commit `parse_payload` before research_node runs, because
     research_node now derives its input from `parse_payload.jd_*`.
  4. **opt_in path** — when `research_opt_in=True` AND parse_payload
     carries jd_company_name + jd_role_title, research_node runs and
     populates research_payload.
  5. **opt-out / no-signal short-circuit** — false opt_in OR missing JD
     signal yields `research_skipped=True` with `research_payload=None`
     and never invokes research_service.
  6. **Research timeout / LLMError soft-skip** — research_node never
     propagates a slow or failed Research call; parse_payload still
     lands and the graph reaches predict_questions_node.

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


def _make_parse_output(
    *,
    jd_company_name: str | None = "字节跳动",
    jd_role_title: str | None = "高级产品经理",
    jd_industry_hints: list[str] | None = None,
) -> ParseAgentOutput:
    """Default parse output now ships JD-derived signal so the new
    opt-in research path (M2.3.X) can derive a ResearchAgentInput.
    Tests that need to exercise the no-signal path pass jd_*=None.
    """
    return ParseAgentOutput(
        match_summary="候选人匹配度中上",
        jd_company_name=jd_company_name,
        jd_role_title=jd_role_title,
        jd_industry_hints=jd_industry_hints
        if jd_industry_hints is not None
        else ["短视频"],
    )


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
    sequential ordering vs. research_node."""

    def __init__(
        self,
        *,
        started: asyncio.Event | None = None,
        proceed: asyncio.Event | None = None,
        output: ParseAgentOutput | None = None,
    ) -> None:
        self._started = started
        self._proceed = proceed
        self._output = output
        self.calls = 0

    async def run(
        self, input: ParseAgentInput, gateway: LLMGateway
    ) -> ParseAgentOutput:
        self.calls += 1
        if self._started:
            self._started.set()
        if self._proceed:
            await self._proceed.wait()
        return self._output if self._output is not None else _make_parse_output()


class _ScriptedResearchService:
    def __init__(
        self,
        *,
        started: asyncio.Event | None = None,
        proceed: asyncio.Event | None = None,
        sleep_seconds: float | None = None,
        raise_exc: BaseException | None = None,
        observe_after: asyncio.Event | None = None,
    ) -> None:
        self._started = started
        self._proceed = proceed
        self._sleep_seconds = sleep_seconds
        self._raise_exc = raise_exc
        self._observe_after = observe_after
        self.calls = 0
        self.last_input: ResearchAgentInput | None = None

    async def run(
        self,
        input: ResearchAgentInput,
        gateway: LLMGateway,
        *,
        session: Any = None,
    ) -> ResearchAgentOutput:
        self.calls += 1
        self.last_input = input
        if self._started:
            self._started.set()
        # M2.3.X — used by the sequential test to assert parse_payload
        # was already committed by the time research_node fired.
        if self._observe_after is not None:
            assert self._observe_after.is_set(), (
                "research_node ran before parse_payload was committed; "
                "intake_graph regressed back to parallel scheduling"
            )
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


async def test_parse_runs_before_research_sequential() -> None:
    """M2.3.X — research_node MUST observe parse_payload, so parse runs first."""
    parse_committed = asyncio.Event()
    parse_service = _ScriptedParseService()
    research_service = _ScriptedResearchService(observe_after=parse_committed)

    # Wrap parse_service.run so we can flip the latch only after parse
    # returns (proxy for "parse_payload committed to state").
    real_parse_run = parse_service.run

    async def _run(input: ParseAgentInput, gateway: LLMGateway) -> ParseAgentOutput:
        out = await real_parse_run(input, gateway)
        parse_committed.set()
        return out

    parse_service.run = _run  # type: ignore[method-assign]

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
        research_opt_in=True,
        framework_config=None,  # skip predict_questions_node
    )

    result = await asyncio.wait_for(graph.ainvoke(state.model_dump()), timeout=2.0)
    assert parse_service.calls == 1
    assert research_service.calls == 1
    assert result["parse_payload"] is not None
    assert result["research_payload"] is not None


async def test_research_input_derived_from_parse_jd_fields() -> None:
    """opt_in=True + parse jd_* ⇒ research_node builds its own input."""
    parse_service = _ScriptedParseService(
        output=ParseAgentOutput(
            match_summary="ok",
            jd_company_name="OpenAI",
            jd_role_title="PM",
            jd_industry_hints=["LLM", "API"],
        )
    )
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
        research_opt_in=True,
        framework_config=None,
    )
    result = await graph.ainvoke(state.model_dump())

    assert result["research_payload"] is not None
    assert research_service.last_input is not None
    assert research_service.last_input.company_name == "OpenAI"
    assert research_service.last_input.role_title == "PM"
    assert research_service.last_input.industry_hints == ["LLM", "API"]


async def test_research_opt_out_short_circuits() -> None:
    """research_opt_in=False ⇒ research_node skips without raising."""
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
        research_opt_in=False,
        framework_config=None,
    )
    result = await graph.ainvoke(state.model_dump())

    assert result["parse_payload"] is not None
    assert result["research_payload"] is None
    assert result["research_skipped"] is True
    assert result["research_error"] is None
    assert research_service.calls == 0


async def test_research_skipped_when_jd_lacks_signal() -> None:
    """opt_in=True but parse jd_company_name=None ⇒ skip without LLM call."""
    parse_service = _ScriptedParseService(
        output=ParseAgentOutput(
            match_summary="anonymous JD",
            jd_company_name=None,
            jd_role_title=None,
            jd_industry_hints=[],
        )
    )
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
        research_opt_in=True,
        framework_config=None,
    )
    result = await graph.ainvoke(state.model_dump())

    assert result["research_payload"] is None
    assert result["research_skipped"] is True
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
        research_opt_in=True,
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
        research_opt_in=True,
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
        research_opt_in=False,
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
