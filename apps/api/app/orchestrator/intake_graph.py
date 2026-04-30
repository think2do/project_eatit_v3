"""Intake-phase LangGraph (V32.M2.3.4 / F-320 + F-321 + M2.3.X audit fix).

Independent graph from `turn_graph.py`. The two never interleave — turn_graph
runs per-turn during the live interview, this one runs once during intake
to chain Parse → Research → Framework predict so that downstream UI can
show the company / industry / predicted-question cards.

  START ──► parse_node ──► research_node ──► predict_questions_node ──► END

Sequential rationale (M2.3.X audit-fix):
  Research / Predict need company + role + industry-hint signals out of
  the JD. Pre-audit we tried to extract these via a regex hand-rolled
  inside the assets domain service, which silently always returned None
  — so research_node never had a real input and the Research Agent was
  never actually called in production. Parse Agent already reads the JD
  end-to-end; we now ask it to emit `jd_company_name / jd_role_title /
  jd_industry_hints` alongside the rest of its output. research_node
  consumes `state.parse_payload.jd_*` to construct its own input, which
  forces this to be sequential — research_node MUST run after parse_node
  has committed parse_payload.

  Trade-off: total parse-trigger latency rises ~30% (parse 8-15s +
  research 5-10s = 13-25s vs. the old "parallel but broken" 8-15s). We
  accept this because correctness > performance; the cache layer in
  ResearchAgentService keeps repeat parses snappy.

Soft-skip rules (unchanged):
  * `research_node` is "soft" — when the user has NOT opted in (or the
    Parse Agent could not extract a company/role/industry signal, or
    the Research call errors / times out) it sets `research_payload=None`
    and flips `research_skipped=True`. The error class lands in
    `research_error` for log triage.
  * `predict_questions_node` requires a parse_payload AND a
    `framework_config` to do anything useful. When either is missing we
    skip the FrameworkAgent call and leave `direction_framework=None`.

L0 A11 privacy is inherited from the agents' own schemas/prompts —
intake_graph itself never sees resume_text after parse_node populates
parse_payload. The ResearchAgentInput we build inside research_node is
strictly company/role/industry-hints sourced from the JD via Parse
Agent; the agent's `extra="forbid"` schema rejects anything else.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import ValidationError

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
    # M2.3.X audit-fix: opt-in is the new entry signal. When True,
    # research_node tries to derive a ResearchAgentInput from the
    # post-parse `parse_payload.jd_company_name / jd_role_title /
    # jd_industry_hints`. When False, research_node short-circuits to a
    # no-op regardless of what Parse Agent produced.
    research_opt_in: bool = False
    # Backward-compat hatch (used by a handful of contract tests that
    # pre-build a ResearchAgentInput directly to focus on graph wiring).
    # Production callers leave this None and rely on the opt-in path.
    # When set, it overrides the parse-derived path.
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
    session: AsyncSession | None = None,
    parse_service: ParseAgentService | None = None,
    research_service: ResearchAgentService | None = None,
    framework_service: FrameworkAgentService | None = None,
    research_timeout: float = RESEARCH_TIMEOUT_SECONDS,
):
    """Compile the 3-node intake StateGraph.

    `session` (M2.3.X audit-fix G4) is forwarded into research_node so
    ResearchAgentService can read/write the 30-day research_cache table.
    When None (most contract tests) the cache layer becomes a no-op.

    Service overrides are exposed for tests so they can inject scripted
    fakes (see test_intake_graph_contract.py). Production callers pass
    just the gateway + session and rely on default singletons.
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
        # M2.3.X audit-fix: derive ResearchAgentInput at this node, AFTER
        # parse_node has committed parse_payload. The legacy
        # `research_input` slot still wins if a caller pre-built one (a
        # few contract tests do this to isolate the graph wiring).
        research_input = state.research_input
        if research_input is None:
            research_input = _derive_research_input_from_parse(state)

        # Opt-out / no extractable signal ⇒ soft skip. NEVER block the
        # downstream predict_questions_node.
        if research_input is None:
            reason = (
                "opt_out"
                if not state.research_opt_in
                else "insufficient_jd_signal"
            )
            logger.info("research_node_skipped", extra={"reason": reason})
            return {
                "research_payload": None,
                "research_skipped": True,
                "research_error": None,
            }
        try:
            research_output = await asyncio.wait_for(
                research_service.run(
                    research_input, gateway, session=session
                ),
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

    # M2.3.X audit-fix — sequential chain. research_node now derives its
    # input from parse_payload, so it MUST run after parse_node has
    # committed. predict_questions_node still wants both.
    graph.add_edge(START, "parse_node")
    graph.add_edge("parse_node", "research_node")
    graph.add_edge("research_node", "predict_questions_node")
    graph.add_edge("predict_questions_node", END)

    return graph.compile()


def _derive_research_input_from_parse(
    state: "IntakeState",
) -> ResearchAgentInput | None:
    """Build a ResearchAgentInput from the parse_payload.jd_* fields.

    Returns None if (a) the user did not opt in, (b) parse_payload is
    missing (parse_node failed), or (c) the JD did not yield enough
    company/role signal for Research Agent to be useful. Industry hints
    fall back to the role title when the LLM didn't surface keywords —
    Research's `industry_hints` requires min_length=1.
    """
    if not state.research_opt_in:
        return None
    payload = state.parse_payload
    if payload is None:
        return None
    company = (payload.jd_company_name or "").strip()
    role = (payload.jd_role_title or "").strip()
    if not company or not role:
        return None
    hints = [h.strip() for h in (payload.jd_industry_hints or []) if h.strip()]
    if not hints:
        hints = [role]
    try:
        return ResearchAgentInput(
            company_name=company[:80],
            role_title=role[:80],
            industry_hints=hints[:5],
        )
    except ValidationError:
        # Schema rejected our trim; treat as "no signal" rather than
        # blowing up the whole intake graph.
        return None


__all__ = [
    "INTAKE_GRAPH_NODES",
    "RESEARCH_TIMEOUT_SECONDS",
    "IntakeState",
    "build_intake_graph",
]
