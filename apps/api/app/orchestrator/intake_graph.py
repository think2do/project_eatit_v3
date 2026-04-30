"""Intake-phase LangGraph (V32.M2.3.4 / F-320 + F-321).

Independent graph from `turn_graph.py`. The two never interleave — turn_graph
runs per-turn during the live interview, this one runs once during intake
to fan out Parse + Research in parallel and (optionally) hand the merged
inputs to Framework Agent for predicted-question generation.

  START ──► parse_node    ───┐
       │                     ├──► predict_questions_node ──► END
       └──► research_node ───┘

Parallelism rules:
  * `parse_node` and `research_node` are siblings off START. LangGraph runs
    them concurrently and the merge into `predict_questions_node` waits for
    both to commit their state slice.
  * `research_node` is "soft" — when the user has NOT opted in (or the
    Research call errors / times out) it sets `research_payload=None` and
    flips `research_skipped=True`. This NEVER blocks parse_node; it's a
    no-op write into state.
  * `predict_questions_node` requires a parse_payload to do anything
    useful. When parse_payload is missing or framework_config is None we
    skip the FrameworkAgent call and leave `direction_framework=None`.

L0 A11 privacy is inherited from the agents' own schemas/prompts —
intake_graph itself never sees resume_text after the parse_node populates
parse_payload. The research_input is built by the caller (assets domain
service) using ONLY company / role / industry hints from the JD.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel

from app.agents.framework.schemas import FrameworkAgentInput, FrameworkAgentOutput, FrameworkConfigInput
from app.agents.framework.service import FrameworkAgentService
from app.agents.parse.schemas import ParseAgentInput
from app.agents.parse.service import ParseAgentService
from app.agents.research.schemas import ResearchAgentInput, ResearchAgentOutput
from app.agents.research.service import ResearchAgentService
from app.infra.llm import LLMGateway
from app.infra.llm.errors import LLMError
from app.schemas.parse import ParseResultPayload

logger = logging.getLogger(__name__)


# Spec A7-style lock: any rename / add / remove drift here must be
# matched by the test_intake_graph_contract.py assertion.
INTAKE_GRAPH_NODES: frozenset[str] = frozenset(
    {"parse_node", "research_node", "predict_questions_node"}
)

# Soft cap so a hung Research call cannot block parse + framework forever.
RESEARCH_TIMEOUT_SECONDS: float = 15.0


class IntakeState(BaseModel):
    """State threaded through intake_graph. Mirrors TurnState style."""

    # ===== Inputs (set before graph.ainvoke) =====
    resume_text: str
    jd_text: str
    # research_input None ⇒ user has NOT opted in (or the caller could
    # not derive company/role/industry hints). research_node short-
    # circuits to a no-op.
    research_input: ResearchAgentInput | None = None
    # framework_config None ⇒ predict_questions_node is a no-op. The
    # session-creation flow supplies a config; the parse-trigger flow
    # leaves it None and just gets parse + research back.
    framework_config: FrameworkConfigInput | None = None

    # ===== Outputs (filled by nodes) =====
    parse_payload: ParseResultPayload | None = None
    research_payload: ResearchAgentOutput | None = None
    research_skipped: bool = False
    research_error: str | None = None
    direction_framework: FrameworkAgentOutput | None = None


def build_intake_graph(
    gateway: LLMGateway,
    *,
    parse_service: ParseAgentService | None = None,
    research_service: ResearchAgentService | None = None,
    framework_service: FrameworkAgentService | None = None,
    research_timeout: float = RESEARCH_TIMEOUT_SECONDS,
):
    """Compile the 3-node intake StateGraph.

    Service overrides are exposed for tests so they can inject scripted
    fakes (see test_intake_graph_contract.py). Production callers pass
    just the gateway and rely on default singletons.
    """
    parse_service = parse_service or ParseAgentService()
    research_service = research_service or ResearchAgentService()
    framework_service = framework_service or FrameworkAgentService()

    async def parse_node(state: IntakeState) -> dict[str, Any]:
        agent_output = await parse_service.run(
            ParseAgentInput(resume_text=state.resume_text, jd_text=state.jd_text),
            gateway,
        )
        # The parse agent's output IS-A ParseResultPayload (subclass);
        # we project it onto the parent type so downstream consumers
        # can serialize without dragging the agent module in.
        payload = ParseResultPayload.model_validate(agent_output.model_dump())
        return {"parse_payload": payload}

    async def research_node(state: IntakeState) -> dict[str, Any]:
        # Opt-out / no input ⇒ soft skip. NEVER block parse_node.
        if state.research_input is None:
            logger.info("research_node_skipped", extra={"reason": "no_input"})
            return {
                "research_payload": None,
                "research_skipped": True,
                "research_error": None,
            }
        try:
            research_output = await asyncio.wait_for(
                research_service.run(state.research_input, gateway),
                timeout=research_timeout,
            )
        except asyncio.TimeoutError:
            logger.info("research_node_timeout")
            return {
                "research_payload": None,
                "research_skipped": True,
                "research_error": "timeout",
            }
        except LLMError as exc:
            logger.info(
                "research_node_llm_error",
                extra={"reason": type(exc).__name__},
            )
            return {
                "research_payload": None,
                "research_skipped": True,
                "research_error": type(exc).__name__,
            }
        return {
            "research_payload": research_output,
            "research_skipped": False,
            "research_error": None,
        }

    async def predict_questions_node(state: IntakeState) -> dict[str, Any]:
        # Skip when we lack either the framework config (parse-trigger
        # path, not session creation) or a parse payload (parse failed
        # before this node ran). Either case leaves direction_framework
        # at None so the upstream session-creation step can run Framework
        # later with full config.
        if state.framework_config is None or state.parse_payload is None:
            return {"direction_framework": None}

        research_json: str | None = None
        if state.research_payload is not None:
            research_json = state.research_payload.model_dump_json()

        framework_input = FrameworkAgentInput(
            parse_payload_json=state.parse_payload.model_dump_json(),
            config=state.framework_config,
            research_payload_json=research_json,
        )
        try:
            framework_output = await framework_service.run(framework_input, gateway)
        except LLMError as exc:
            # Framework failure is upstream-recoverable: session creation
            # already has its own retry+fallback (see SessionsService).
            # We surface None so the caller can re-run Framework directly.
            logger.info(
                "predict_questions_node_framework_error",
                extra={"reason": type(exc).__name__},
            )
            return {"direction_framework": None}
        return {"direction_framework": framework_output}

    graph = StateGraph(IntakeState)
    graph.add_node("parse_node", parse_node)
    graph.add_node("research_node", research_node)
    graph.add_node("predict_questions_node", predict_questions_node)

    # Parallel fan-out from START.
    graph.add_edge(START, "parse_node")
    graph.add_edge(START, "research_node")
    # Both must commit before predict_questions_node fires.
    graph.add_edge("parse_node", "predict_questions_node")
    graph.add_edge("research_node", "predict_questions_node")
    graph.add_edge("predict_questions_node", END)

    return graph.compile()


__all__ = [
    "INTAKE_GRAPH_NODES",
    "RESEARCH_TIMEOUT_SECONDS",
    "IntakeState",
    "build_intake_graph",
]
