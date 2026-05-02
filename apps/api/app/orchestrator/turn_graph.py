"""Per-turn LangGraph.

⚠️  DO NOT RENAME NODES — see AGENTS.md §6 +
    tests/orchestrator/test_graph_contract.py +
    .ralph/specs/v32-p0-constraints.md §A7.
    Node-name set {"turn_assessment", "compression", "next_question"}
    is an L0 red line. Any new agent (Coach / Reflection / etc.) must
    live on its own graph (see post_report_graph for the pattern) so
    this 3-node turn graph stays frozen.

  START ──► turn_assessment ──┐
       │                      ├──► next_question ──► END
       └──► compression ──────┘

- `turn_assessment` scores the just-finished turn via Instructor (no
  dedicated agent; the prompt is intentionally short because it runs on
  the critical path before the next question is generated).
- `compression` delegates to `CompressionAgentService`, which already
  wraps its LLM call in `asyncio.wait_for(..., 3.0)` and falls back to a
  degraded summary. The graph treats that fallback as a valid result.
- `next_question` calls `InterviewerAgentService` with the fresh
  assessment + updated long-term summary.
"""

from __future__ import annotations

import json
import logging

from langgraph.graph import END, START, StateGraph

from app.agents.compression.schemas import CompressionAgentInput, CompressionTurn
from app.agents.compression.service import CompressionAgentService
from app.agents.interviewer.schemas import (
    InterviewerAgentInput,
    TurnAssessmentSnippet,
    TurnRecord,
)
from app.agents.interviewer.service import InterviewerAgentService
from app.infra.llm import LLMGateway
from app.infra.llm.instructor_client import make_instructor, structured_completion
from app.orchestrator.state import TurnAssessment, TurnState

_logger = logging.getLogger(__name__)


def _total_question_budget(framework_json: str) -> int | None:
    """Sum the framework's planned question count across either schema.

    Two shapes flow through this code path:

    1. Legacy `DirectionFramework`:
         {"stages": [{"name": ..., "question_budget": int, ...}, ...]}
       Sum is straightforward — `sum(stage.question_budget)`.

    2. v3.2 `FrameworkAgentOutput` (what `_load_framework_json` actually
       returns to keep `predicted_questions` in scope for the
       Interviewer Agent):
         {"pace_plan": {"segments": [{"rough_minutes": int, ...}], ...}}
       The legacy mapping in `SessionsService._agent_to_legacy_framework`
       converts each segment's rough_minutes via `max(1, rough_minutes
       // 3)` to produce the question_budget — mirror that exactly so
       the guard ends the interview at the same turn count the
       FrameworkAgent's UI surfaces (X / total) advertises.

    Returns None when the framework is missing / malformed so the
    caller can fall through to the LLM's own `should_end` decision
    instead of cutting the interview short on a parse glitch.
    """
    try:
        framework = json.loads(framework_json)
    except (TypeError, ValueError):
        return None
    if not isinstance(framework, dict):
        return None
    # Shape 1: legacy DirectionFramework with explicit `stages`.
    stages = framework.get("stages")
    if isinstance(stages, list) and stages:
        total = 0
        for stage in stages:
            budget = stage.get("question_budget") if isinstance(stage, dict) else None
            if isinstance(budget, int) and budget > 0:
                total += budget
        if total > 0:
            return total
    # Shape 2: agent output with `pace_plan.segments[*].rough_minutes`.
    pace_plan = framework.get("pace_plan")
    if isinstance(pace_plan, dict):
        segments = pace_plan.get("segments")
        if isinstance(segments, list) and segments:
            total = 0
            for seg in segments:
                rough = seg.get("rough_minutes") if isinstance(seg, dict) else None
                if isinstance(rough, int) and rough > 0:
                    total += max(1, rough // 3)
            if total > 0:
                return total
    return None

_TURN_ASSESSMENT_SYSTEM = (
    "你是面试复盘助理。对候选人在单轮问答里的表现做简短打点:"
    "用一句 30 字以内的 summary,再各列 1~3 条 strengths 与 weaknesses。"
    "只输出 JSON,不要解释。"
)


def _turn_assessment_user(question: str, answer: str) -> str:
    return f"问题:{question}\n候选人作答:{answer}"


def build_turn_graph(gateway: LLMGateway):
    """Compile the three-node StateGraph bound to a concrete gateway.

    Binding the gateway at compile time keeps every node closed over the
    same credentials for the duration of a turn; rebuilding per turn is
    cheap because the gateway itself is just a thin wrapper around an
    LLMConfig reference.
    """
    compression_service = CompressionAgentService()
    interviewer_service = InterviewerAgentService()

    async def turn_assessment_node(state: TurnState) -> dict[str, TurnAssessment]:
        client = make_instructor(gateway)
        assessment = await structured_completion(
            client,
            messages=[
                {"role": "system", "content": _TURN_ASSESSMENT_SYSTEM},
                {
                    "role": "user",
                    "content": _turn_assessment_user(state.question, state.answer),
                },
            ],
            response_model=TurnAssessment,
        )
        return {"assessment": assessment}

    async def compression_node(state: TurnState) -> dict:
        turns = [
            CompressionTurn(question=t.question, answer=t.answer) for t in state.recent_turns
        ]
        turns.append(CompressionTurn(question=state.question, answer=state.answer))
        compressed = await compression_service.run(
            CompressionAgentInput(
                previous_summary=state.previous_summary,
                turns=turns,
            ),
            gateway,
        )
        return {"compressed": compressed}

    async def next_question_node(state: TurnState) -> dict:
        # Stitch the just-assessed turn onto the history so the interviewer
        # can see the assessment summary alongside the raw Q/A.
        assessment_snippet = (
            TurnAssessmentSnippet(summary=state.assessment.summary) if state.assessment else None
        )
        current_turn = TurnRecord(
            question=state.question,
            answer=state.answer,
            assessment=assessment_snippet,
        )
        long_term = state.compressed.summary if state.compressed is not None else state.previous_summary

        next_q = await interviewer_service.run(
            InterviewerAgentInput(
                framework_json=state.framework_json,
                recent_turns=[*state.recent_turns, current_turn],
                long_term_summary=long_term,
                remaining_minutes=state.remaining_minutes,
            ),
            gateway,
        )
        # Hard budget guard: the LLM is supposed to set `should_end=true`
        # once the framework's planned `sum(question_budget)` is reached,
        # but in practice it sometimes drifts past the limit (observed:
        # 5/5 progress with a 7th question still being asked). The budget
        # comes off the framework JSON so it stays honest about whatever
        # the FrameworkAgent actually planned for THIS session.
        #
        # `state.turn_index` is 0-based and points at the turn that just
        # finished. After this node fires we'd advance to turn N+2 (the
        # response is the *next* question). So we end as soon as we've
        # already covered the budget — i.e. (turn_index + 1) >= budget.
        budget = _total_question_budget(state.framework_json)
        if budget is not None and not next_q.should_end:
            answered = state.turn_index + 1
            if answered >= budget:
                _logger.info(
                    "interviewer.budget_guard: forcing should_end=true "
                    "(answered=%d, budget=%d)",
                    answered,
                    budget,
                )
                next_q = next_q.model_copy(update={"should_end": True})
        return {"next_question": next_q}

    graph = StateGraph(TurnState)
    graph.add_node("turn_assessment", turn_assessment_node)
    graph.add_node("compression", compression_node)
    graph.add_node("next_question", next_question_node)
    graph.add_edge(START, "turn_assessment")
    graph.add_edge(START, "compression")
    graph.add_edge("turn_assessment", "next_question")
    graph.add_edge("compression", "next_question")
    graph.add_edge("next_question", END)
    return graph.compile()
