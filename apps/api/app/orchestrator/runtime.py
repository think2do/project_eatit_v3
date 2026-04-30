"""Session-scoped runtime for the orchestrator.

`SessionRuntime` owns everything that lives for the duration of one
WebSocket connection: the BYOK gateway, the compiled turn graph, the
outbound event queue, and the set of in-flight reference-answer tasks.

Key invariants (phase3-constraints.md §A3):
- `on_session_end()` must nil the held `LLMConfig` *and* every container
  that transitively references it (the gateway, the compiled graph).
  A test holds a weakref to the config and asserts it dies after
  `on_session_end() + gc.collect()`.
- All in-flight work is trackable and cancellable. Reference answers are
  fire-and-forget by design but registered in `_ref_answer_tasks` so
  `on_session_end()` can cancel them rather than leave them dangling.
- `on_session_end()` is invoked from WS close, explicit
  `client.session.end`, AND uncaught exceptions — it must therefore be
  idempotent.

`asyncio.TaskGroup` scopes the per-turn work so that a mid-turn
exception cancels sibling tasks without leaking.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Callable

from app.agents.interviewer.schemas import InterviewerAgentInput
from app.agents.interviewer.service import InterviewerAgentService
from app.agents.observer.schemas import ObserverAgentInput
from app.agents.observer.service import ObserverAgentService
from app.agents.reference.schemas import ReferenceAgentInput
from app.agents.reference.service import ReferenceAgentService
from app.infra.asr import ASRBackend
from app.infra.llm import LLMGateway, build_gateway
from app.infra.llm.config import LLMConfig
from app.infra.logging import get_logger
from app.orchestrator.events import (
    ObserverObservationEvent,
    QuestionGeneratedEvent,
    ReferenceAnswerReadyEvent,
    TranscriptFinalEvent,
    TranscriptPartialEvent,
    TurnAssessedEvent,
    TurnCompressedEvent,
)
from app.orchestrator.state import TurnState
from app.orchestrator.turn_graph import build_turn_graph


_OBSERVER_TIMEOUT_SECONDS = 4.0


class SessionClosedError(RuntimeError):
    """Raised when `run_turn` is called after `on_session_end`."""


class AudioNotStartedError(RuntimeError):
    """Raised when `push_audio` fires without an active ASR stream."""


class SessionRuntime:
    def __init__(self, session_id: str, llm_config: LLMConfig) -> None:
        self.session_id = session_id
        self._llm_config: LLMConfig | None = llm_config
        self._gateway: LLMGateway | None = build_gateway(llm_config)
        self._graph: Any | None = None
        self._task_group: asyncio.TaskGroup | None = None
        self._event_queue: asyncio.Queue = asyncio.Queue()
        self._ref_answer_tasks: set[asyncio.Task] = set()
        self._observer_tasks: set[asyncio.Task] = set()
        self._observed_turns: set[int] = set()
        self._asr_backend: ASRBackend | None = None
        self._current_audio_turn: int | None = None
        self._last_final_by_turn: dict[int, str] = {}
        self._pending_final_events: dict[int, asyncio.Event] = {}
        self._closed = False

    async def __aenter__(self) -> "SessionRuntime":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.on_session_end()

    @property
    def event_queue(self) -> asyncio.Queue:
        return self._event_queue

    async def bootstrap_first_question(self, *, framework_json: str) -> None:
        """Emit a turn-0 question so the candidate has something to answer.

        The turn_graph is built around assessing the previous turn, but there
        is no previous turn at session start. We short-circuit straight to
        the InterviewerAgent with empty `recent_turns`, publish the result
        as `QuestionGeneratedEvent(turn_index=0)`, and let the normal
        `run_turn` path take over from turn 1 onwards.
        """
        if self._closed or self._gateway is None:
            raise SessionClosedError("SessionRuntime has been closed")

        output = await InterviewerAgentService().run(
            InterviewerAgentInput(
                framework_json=framework_json,
                recent_turns=[],
                long_term_summary=None,
                remaining_minutes=None,
            ),
            self._gateway,
        )
        await self._event_queue.put(
            QuestionGeneratedEvent(
                turn_index=0,
                question=output.question,
                intent=output.intent,
                expected_depth=output.expected_depth,
                followup_hint=output.followup_hint,
                should_end=output.should_end,
                followup_hints=tuple(output.followup_hints),
            )
        )
        self._kick_reference(0, output.question)

    async def run_turn(
        self,
        *,
        turn_index: int,
        question: str,
        answer: str,
        framework_json: str,
        recent_turns: list | None = None,
        previous_summary: str | None = None,
        remaining_minutes: int | None = None,
    ) -> TurnState:
        if self._closed or self._gateway is None:
            raise SessionClosedError("SessionRuntime has been closed")

        if self._graph is None:
            self._graph = build_turn_graph(self._gateway)

        state = TurnState(
            turn_index=turn_index,
            question=question,
            answer=answer,
            framework_json=framework_json,
            recent_turns=recent_turns or [],
            previous_summary=previous_summary,
            remaining_minutes=remaining_minutes,
        )

        # Wrap the per-turn work in a TaskGroup so a failure inside the
        # graph propagates cleanly without orphaning parallel work.
        async with asyncio.TaskGroup() as tg:
            self._task_group = tg
            graph_task = tg.create_task(self._graph.ainvoke(state))
        self._task_group = None

        final_dict = graph_task.result()
        final_state = TurnState.model_validate(final_dict)

        await self._emit_turn_events(final_state)

        # Observer coaching is also fire-and-forget and must never delay the
        # turn loop. At most one observation per turn_index — a client that
        # re-sends `turn.end` for the same index shouldn't trigger a duplicate.
        if turn_index not in self._observed_turns:
            self._observed_turns.add(turn_index)
            observer_task = asyncio.create_task(
                self._run_observer(
                    turn_index=turn_index,
                    question=question,
                    answer=answer,
                    remaining_minutes=remaining_minutes,
                    long_term_summary=previous_summary,
                )
            )
            self._observer_tasks.add(observer_task)
            observer_task.add_done_callback(self._observer_tasks.discard)

        return final_state

    async def start_audio_turn(
        self,
        turn_index: int,
        backend_factory: Callable[[], ASRBackend],
    ) -> None:
        """Open an ASR stream for this turn. Partial/final transcripts land on
        `event_queue` as `TranscriptPartialEvent` / `TranscriptFinalEvent`."""
        if self._closed:
            raise SessionClosedError("SessionRuntime has been closed")
        if self._asr_backend is not None:
            # Defensive: the WS layer enforces this and emits the typed error
            # first; runtime-level guard is just belt-and-braces.
            raise AudioNotStartedError("an audio turn is already active")

        backend = backend_factory()
        loop = asyncio.get_running_loop()
        final_event = asyncio.Event()
        self._pending_final_events[turn_index] = final_event

        def _on_partial(text: str) -> None:
            loop.call_soon_threadsafe(
                self._event_queue.put_nowait,
                TranscriptPartialEvent(turn_index=turn_index, text=text),
            )

        def _on_final(text: str) -> None:
            # Marshal state mutation + event-queue write onto the loop thread
            # so the Azure SDK callback (which fires on a worker thread) is
            # safe. For the sync mock used in tests this is a no-op detour
            # but still correct.
            def _dispatch() -> None:
                self._last_final_by_turn[turn_index] = text
                self._event_queue.put_nowait(
                    TranscriptFinalEvent(turn_index=turn_index, text=text)
                )
                pending = self._pending_final_events.get(turn_index)
                if pending is not None:
                    pending.set()

            loop.call_soon_threadsafe(_dispatch)

        backend.on_partial(_on_partial)
        backend.on_final(_on_final)
        await backend.start_stream()

        self._asr_backend = backend
        self._current_audio_turn = turn_index

    async def push_audio(self, chunk: bytes) -> None:
        if self._asr_backend is None:
            raise AudioNotStartedError("push_audio requires an active ASR stream")
        await self._asr_backend.push_audio(chunk)

    async def stop_audio_turn(self, *, trailing_final_timeout: float = 2.0) -> str:
        """Close the current ASR stream and return the final transcript text
        (empty string if no final landed within `trailing_final_timeout`).
        Always safe to call."""
        backend = self._asr_backend
        turn_index = self._current_audio_turn
        self._asr_backend = None
        self._current_audio_turn = None
        if backend is None:
            return ""

        pending = (
            self._pending_final_events.get(turn_index) if turn_index is not None else None
        )

        try:
            await backend.stop_stream()
        finally:
            # Yield once so any `call_soon_threadsafe`-scheduled callback
            # from a synchronously-firing mock backend lands before we
            # check the state below.
            await asyncio.sleep(0)

        if pending is not None and not pending.is_set():
            try:
                await asyncio.wait_for(pending.wait(), timeout=trailing_final_timeout)
            except asyncio.TimeoutError:
                pass

        if turn_index is not None:
            self._pending_final_events.pop(turn_index, None)
            return self._last_final_by_turn.get(turn_index, "")
        return ""

    def get_audio_answer(self, turn_index: int) -> str | None:
        return self._last_final_by_turn.get(turn_index)

    async def _run_observer(
        self,
        *,
        turn_index: int,
        question: str,
        answer: str,
        remaining_minutes: int | None,
        long_term_summary: str | None,
    ) -> None:
        if self._gateway is None:
            return
        log = get_logger(__name__)
        started_at = time.perf_counter()
        log.info("eatit.observer.start", turn_index=turn_index)
        try:
            result = await asyncio.wait_for(
                ObserverAgentService().run(
                    ObserverAgentInput(
                        turn_index=turn_index,
                        question=question,
                        answer=answer,
                        remaining_minutes=remaining_minutes,
                        long_term_summary=long_term_summary,
                    ),
                    self._gateway,
                ),
                timeout=_OBSERVER_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            # Observer is advisory; a broken observer must never break the
            # interview. Includes asyncio.TimeoutError + any LLMError.
            # Log so a stuck "每轮作答完,这里会有一条 AI 观察" panel can be
            # diagnosed instead of silently failing.
            log.warning(
                "eatit.observer.failed",
                turn_index=turn_index,
                error_type=type(exc).__name__,
                error=str(exc),
                elapsed_ms=int((time.perf_counter() - started_at) * 1000),
            )
            return
        log.info(
            "eatit.observer.ready",
            turn_index=turn_index,
            elapsed_ms=int((time.perf_counter() - started_at) * 1000),
            tone=result.tone,
        )
        await self._event_queue.put(
            ObserverObservationEvent(
                turn_index=turn_index,
                observation=result.observation,
                tone=result.tone,
                actionable=result.actionable,
            )
        )

    async def _run_reference_answer(
        self, turn_index: int, question: str, answer: str | None = None
    ) -> None:
        if self._gateway is None:
            return
        log = get_logger(__name__)
        started_at = time.perf_counter()
        log.info("eatit.reference.start", turn_index=turn_index)
        try:
            result = await ReferenceAgentService().run(
                # answer is intentionally optional now: the UI wants the hint
                # rendered alongside the question (before the user answers),
                # so the agent should produce a "model answer" rather than
                # a critique anchored on the candidate's reply.
                ReferenceAgentInput(question=question, candidate_answer=answer or None),
                self._gateway,
            )
        except Exception as exc:
            # Reference is advisory: don't surface as a turn-level error to
            # the candidate, but DO log the cause so we can diagnose silent
            # "AI 正在准备本轮参考答案" hangs. Most common culprits: provider
            # 429, schema validation retries exhausted, network timeout.
            log.warning(
                "eatit.reference.failed",
                turn_index=turn_index,
                error_type=type(exc).__name__,
                error=str(exc),
                elapsed_ms=int((time.perf_counter() - started_at) * 1000),
            )
            return
        await self._event_queue.put(
            ReferenceAnswerReadyEvent(
                turn_index=turn_index,
                answer_outline=tuple(result.answer_outline),
                ideal_answer=result.ideal_answer,
                key_evaluation_points=tuple(result.key_evaluation_points),
                common_pitfalls=tuple(result.common_pitfalls),
            )
        )
        log.info(
            "eatit.reference.ready",
            turn_index=turn_index,
            elapsed_ms=int((time.perf_counter() - started_at) * 1000),
        )

    def _kick_reference(self, turn_index: int, question: str) -> None:
        """Fire-and-forget reference generation tied to a freshly-emitted
        question. Tracked in `_ref_answer_tasks` so on_session_end can
        cancel any pending generation when the user navigates away."""
        if self._closed or self._gateway is None:
            return
        get_logger(__name__).info("eatit.reference.kicked", turn_index=turn_index)
        task = asyncio.create_task(self._run_reference_answer(turn_index, question))
        self._ref_answer_tasks.add(task)
        task.add_done_callback(self._ref_answer_tasks.discard)

    async def _emit_turn_events(self, state: TurnState) -> None:
        if state.assessment is not None:
            await self._event_queue.put(
                TurnAssessedEvent(
                    turn_index=state.turn_index,
                    summary=state.assessment.summary,
                    strengths=tuple(state.assessment.strengths),
                    weaknesses=tuple(state.assessment.weaknesses),
                )
            )
        if state.compressed is not None:
            await self._event_queue.put(
                TurnCompressedEvent(
                    summary=state.compressed.summary,
                    preserved_keywords=tuple(state.compressed.preserved_keywords),
                    open_threads=tuple(state.compressed.open_threads),
                )
            )
        if state.next_question is not None:
            nq = state.next_question
            next_turn_index = state.turn_index + 1
            await self._event_queue.put(
                QuestionGeneratedEvent(
                    turn_index=next_turn_index,
                    question=nq.question,
                    intent=nq.intent,
                    expected_depth=nq.expected_depth,
                    followup_hint=nq.followup_hint,
                    should_end=nq.should_end,
                    followup_hints=tuple(nq.followup_hints),
                )
            )
            # Reference for the upcoming question fires here, not after the
            # answer comes in. The user wants a "model answer" hint while
            # they're preparing their reply, not a post-mortem.
            if not nq.should_end:
                self._kick_reference(next_turn_index, nq.question)

    async def on_session_end(self) -> None:
        if self._closed:
            return
        self._closed = True

        for task in list(self._ref_answer_tasks):
            task.cancel()
        for task in list(self._ref_answer_tasks):
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self._ref_answer_tasks.clear()

        for task in list(self._observer_tasks):
            task.cancel()
        for task in list(self._observer_tasks):
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self._observer_tasks.clear()
        self._observed_turns.clear()

        if self._asr_backend is not None:
            try:
                await self._asr_backend.stop_stream()
            except Exception:
                # Cleanup path — never let a flaky SDK block teardown.
                pass
        self._asr_backend = None
        self._current_audio_turn = None
        self._last_final_by_turn.clear()
        self._pending_final_events.clear()

        while not self._event_queue.empty():
            try:
                self._event_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        # Drop every reference that transitively pins the LLMConfig so
        # gc.collect() can reclaim it. Order matters: graph closes over
        # gateway, gateway holds config — release the downstream refs
        # before nil-ing `_llm_config` itself.
        self._graph = None
        self._gateway = None
        self._task_group = None
        self._llm_config = None
