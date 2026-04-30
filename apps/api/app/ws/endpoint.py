"""WebSocket endpoint for a single interview session.

Protocol (phase3-constraints.md §A2, phase4-sections.md §P4.2):
1. Client connects; the server accepts and validates the session owner.
2. First text frame MUST be `client.session.init` carrying the BYOK
   LLMConfig. Any other first frame -> `server.error{code:"session_not_initialized"}`
   + close with 1008 policy violation.
3. Subsequent text frames drive the orchestrator:
   - `client.turn.end{question, answer, turn_index}` -> SessionRuntime.run_turn
     then drain the runtime's outbound event queue and forward to the client.
   - `client.audio.start{turn_index}` -> allocate an ASR backend per turn and
     route the next binary frames through it.
   - `client.audio.stop{turn_index}` -> flush the ASR stream and drain the
     trailing transcript event.
   - `client.session.end` -> close gracefully.
4. Binary frames are ASR audio chunks. They require an active `audio.start`
   session; a binary frame in idle mode gets `server.error{code:"audio_not_started"}`
   without closing the connection.
5. On disconnect (clean or not) the runtime's `on_session_end()` runs
   from a `finally` block so the LLMConfig and any open ASR stream are
   released regardless of path.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Callable
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from pydantic import ValidationError
from sqlalchemy import select

from app.api.dependencies.auth import get_websocket_user
from app.infra.asr import ASRBackend, ASRError, build_asr_backend
from app.infra.db.session import AsyncSessionFactory
from app.models.session import DirectionFramework, InterviewSession
from app.orchestrator.events import (
    ObserverObservationEvent,
    QuestionGeneratedEvent,
    ReferenceAnswerReadyEvent,
    TranscriptFinalEvent,
    TranscriptPartialEvent,
    TurnAssessedEvent,
    TurnCompressedEvent,
)
from app.orchestrator.runtime import SessionRuntime
from app.ws.manager import socket_manager
from app.ws.schemas import (
    CLIENT_TEXT_EVENT_ADAPTER,
    ClientAudioStartEvent,
    ClientAudioStopEvent,
    ClientSessionEndEvent,
    ClientSessionInitEvent,
    ClientTurnEndEvent,
)


router = APIRouter()


def _default_asr_backend_factory() -> ASRBackend:
    """Per-turn ASR backend. Thin wrapper around `build_asr_backend()` so
    tests can monkeypatch this module-level binding with a mock factory
    without reaching into `infra.asr`."""
    return build_asr_backend()


asr_backend_factory: Callable[[], ASRBackend] = _default_asr_backend_factory


@router.websocket("/ws/sessions/{session_id}")
async def interview_socket(websocket: WebSocket, session_id: UUID) -> None:
    token = websocket.query_params.get("token", "")

    async with AsyncSessionFactory() as session:
        try:
            current_user = await get_websocket_user(token, session)
        except ValueError:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        result = await session.execute(
            select(InterviewSession).where(
                InterviewSession.id == str(session_id),
                InterviewSession.user_id == current_user.id,
            )
        )
        interview_session = result.scalar_one_or_none()
        if interview_session is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        framework_json = await _load_framework_json(session, str(session_id))

    await socket_manager.connect(session_id, websocket)
    runtime: SessionRuntime | None = None
    drain_task: asyncio.Task | None = None

    try:
        # --- First-frame protocol ---
        first_frame = await _receive_first_frame(websocket)
        if first_frame is None:
            return

        try:
            parsed_first = CLIENT_TEXT_EVENT_ADAPTER.validate_python(first_frame)
        except ValidationError:
            await _send_not_initialized(websocket)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        if not isinstance(parsed_first, ClientSessionInitEvent):
            await _send_not_initialized(websocket)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        runtime = SessionRuntime(
            session_id=str(session_id),
            llm_config=parsed_first.config,
        )

        # Bootstrap turn 0 so the candidate actually sees a question.
        # The turn_graph handles turn N>0 (assess previous answer, then
        # pick the next question); at turn 0 there is no previous answer,
        # so we call the interviewer directly with an empty history.
        try:
            await runtime.bootstrap_first_question(framework_json=framework_json)
        except Exception as exc:  # noqa: BLE001 — surface any agent failure
            await socket_manager.send_error(
                websocket,
                code="bootstrap_failed",
                message=f"无法生成首题:{exc}",
                recoverable=False,
            )
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
            return
        await _drain_queue(websocket, runtime)

        # Continuously pump fire-and-forget events (reference / observer)
        # to the client as they land on the queue, otherwise they'd sit
        # idle until the next inbound client frame and get rejected by
        # the frontend's turn_index filter.
        drain_task = asyncio.create_task(_continuous_drain(websocket, runtime))

        # --- Main loop ---
        current_audio_turn: int | None = None
        audio_turns: set[int] = set()

        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"] is not None:
                if current_audio_turn is None:
                    await socket_manager.send_error(
                        websocket,
                        code="audio_not_started",
                        message="Send client.audio.start before binary audio chunks.",
                        recoverable=True,
                    )
                    continue
                await runtime.push_audio(message["bytes"])
                await _drain_queue(websocket, runtime)
                continue

            text = message.get("text")
            if text is None:
                continue

            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
                break

            try:
                parsed = CLIENT_TEXT_EVENT_ADAPTER.validate_python(payload)
            except ValidationError:
                await socket_manager.send_error(
                    websocket,
                    code="invalid_event",
                    message=f"Unsupported websocket event: {payload.get('event')}",
                    recoverable=True,
                )
                continue

            if isinstance(parsed, ClientTurnEndEvent):
                answer = parsed.answer
                if parsed.turn_index in audio_turns:
                    # Voice mode: client-supplied `answer` may be empty or
                    # stale. The ASR final transcript is the authoritative
                    # answer text for this turn.
                    voice_answer = runtime.get_audio_answer(parsed.turn_index)
                    if voice_answer is not None:
                        answer = voice_answer
                await runtime.run_turn(
                    turn_index=parsed.turn_index,
                    question=parsed.question,
                    answer=answer,
                    framework_json=framework_json,
                )
                await _drain_queue(websocket, runtime)
                continue

            if isinstance(parsed, ClientAudioStartEvent):
                if current_audio_turn is not None:
                    await socket_manager.send_error(
                        websocket,
                        code="audio_already_started",
                        message="An audio turn is already in progress.",
                        recoverable=True,
                    )
                    continue
                try:
                    await runtime.start_audio_turn(parsed.turn_index, asr_backend_factory)
                except ASRError as exc:
                    await socket_manager.send_error(
                        websocket,
                        code="asr_unavailable",
                        message=str(exc),
                        recoverable=True,
                    )
                    continue
                current_audio_turn = parsed.turn_index
                audio_turns.add(parsed.turn_index)
                await _drain_queue(websocket, runtime)
                continue

            if isinstance(parsed, ClientAudioStopEvent):
                if current_audio_turn is None:
                    continue
                await runtime.stop_audio_turn()
                current_audio_turn = None
                await _drain_queue(websocket, runtime)
                continue

            if isinstance(parsed, ClientSessionEndEvent):
                break

            # Re-sent init / pause / resume events are acknowledged
            # silently in Phase 3.
            continue
    except WebSocketDisconnect:
        pass
    finally:
        if drain_task is not None:
            drain_task.cancel()
            try:
                await drain_task
            except (asyncio.CancelledError, Exception):
                pass
        if runtime is not None:
            # Give any ref-answer task a short window so its event
            # lands before we shut down the queue.
            await _drain_queue(websocket, runtime, deadline_s=0.2)
            await runtime.on_session_end()
        socket_manager.disconnect(session_id, websocket)


async def _receive_first_frame(websocket: WebSocket) -> Any | None:
    message = await websocket.receive()
    if message["type"] == "websocket.disconnect":
        return None
    if "bytes" in message and message["bytes"] is not None:
        await _send_not_initialized(websocket)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None
    text = message.get("text")
    if text is None:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        await _send_not_initialized(websocket)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None


async def _send_not_initialized(websocket: WebSocket) -> None:
    await socket_manager.send_error(
        websocket,
        code="session_not_initialized",
        message="First frame must be client.session.init.",
        recoverable=False,
    )


async def _load_framework_json(session, interview_session_id: str) -> str:
    result = await session.execute(
        select(DirectionFramework).where(
            DirectionFramework.interview_session_id == interview_session_id
        )
    )
    row = result.scalar_one_or_none()
    if row is None or not isinstance(row.payload, dict):
        return "{}"
    agent_payload = row.payload.get("agent") if "agent" in row.payload else row.payload
    return json.dumps(agent_payload, ensure_ascii=False)


async def _drain_queue(
    websocket: WebSocket,
    runtime: SessionRuntime,
    deadline_s: float = 0.0,
) -> None:
    loop = asyncio.get_event_loop()
    end = loop.time() + deadline_s

    while True:
        try:
            event = runtime.event_queue.get_nowait()
        except asyncio.QueueEmpty:
            if deadline_s and loop.time() < end:
                await asyncio.sleep(0.02)
                continue
            return
        await websocket.send_json(_serialize_event(event))


async def _continuous_drain(
    websocket: WebSocket,
    runtime: SessionRuntime,
) -> None:
    """Forever-loop pumping runtime events to the client.

    The main WS handler only drains synchronously after a client frame,
    which means fire-and-forget tasks (reference, observer) that finish
    *between* client messages would sit on the queue indefinitely. By
    the time the next client message arrives the turn has often moved
    on and the frontend filters the event by turn_index.

    This task is spawned alongside the main loop and cancelled in the
    `finally` block.
    """
    try:
        while True:
            event = await runtime.event_queue.get()
            try:
                await websocket.send_json(_serialize_event(event))
            except Exception:
                # WS closed mid-flight: stop quietly. The outer finally
                # block will tear down the runtime.
                return
    except asyncio.CancelledError:
        return


def _serialize_event(event: object) -> dict[str, Any]:
    if isinstance(event, TurnAssessedEvent):
        return {
            "event": "server.turn.assessed",
            "payload": {
                "turn_index": event.turn_index,
                "summary": event.summary,
                "strengths": list(event.strengths),
                "weaknesses": list(event.weaknesses),
            },
        }
    if isinstance(event, TurnCompressedEvent):
        return {
            "event": "server.turn.compressed",
            "payload": {
                "summary": event.summary,
                "preserved_keywords": list(event.preserved_keywords),
                "open_threads": list(event.open_threads),
            },
        }
    if isinstance(event, QuestionGeneratedEvent):
        return {
            "event": "server.question.generated",
            "payload": {
                "turn_index": event.turn_index,
                "question": event.question,
                "intent": event.intent,
                "expected_depth": event.expected_depth,
                "followup_hint": event.followup_hint,
                "should_end": event.should_end,
                "followup_hints": list(event.followup_hints),
            },
        }
    if isinstance(event, ReferenceAnswerReadyEvent):
        return {
            "event": "server.reference.ready",
            "payload": {
                "turn_index": event.turn_index,
                "answer_outline": list(event.answer_outline),
                "ideal_answer": event.ideal_answer,
                "key_evaluation_points": list(event.key_evaluation_points),
                "common_pitfalls": list(event.common_pitfalls),
            },
        }
    if isinstance(event, ObserverObservationEvent):
        return {
            "event": "server.coach.observation",
            "payload": {
                "turn_index": event.turn_index,
                "observation": event.observation,
                "tone": event.tone,
                "actionable": event.actionable,
            },
        }
    if isinstance(event, TranscriptPartialEvent):
        return {
            "event": "server.transcript.partial",
            "payload": {"turn_index": event.turn_index, "text": event.text},
        }
    if isinstance(event, TranscriptFinalEvent):
        return {
            "event": "server.transcript.final",
            "payload": {"turn_index": event.turn_index, "text": event.text},
        }
    return {
        "event": "server.error",
        "code": "unknown_event",
        "message": "",
        "recoverable": True,
    }
