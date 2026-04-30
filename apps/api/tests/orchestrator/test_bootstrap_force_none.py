"""G1 fix (2026-04-30 audit) — turn 0 live_observation force-None guard.

The Pydantic schema accepts any string ≤ 30 chars for
`InterviewerAgentOutput.live_observation`. The A12 spec rule that
turn 0 must surface `live_observation = None` is enforced **at the
runtime callsite** (apps/api/app/orchestrator/runtime.py
`bootstrap_first_question`) — even if the LLM ignores the prompt and
emits text for turn 0, the runtime overwrites it with None before
the QuestionGeneratedEvent is queued.

This test pins that runtime behaviour: mock the agent service to
return a NON-None observation, then assert the emitted event has
`live_observation is None`. Without this test, a refactor that
forwards `output.live_observation` directly would silently leak
turn-0 observations and the only schema test (the Pydantic check)
would still pass.
"""

from __future__ import annotations

from pydantic import SecretStr

from app.agents.interviewer.schemas import InterviewerAgentOutput
from app.agents.interviewer.service import InterviewerAgentService
from app.infra.llm.config import LLMConfig
from app.orchestrator.events import QuestionGeneratedEvent
from app.orchestrator.runtime import SessionRuntime


def _config() -> LLMConfig:
    return LLMConfig(
        provider="openai",
        api_key=SecretStr("sk-bootstrap-force-none-test"),
        model="gpt-4o-mini",
        base_url=None,
    )


async def test_bootstrap_forces_live_observation_to_none_even_if_llm_emits_text(
    monkeypatch,
) -> None:
    """LLM ignored the prompt and produced text for turn 0 → runtime must
    still emit None. Otherwise a UI showing 'AI 实时观察' on turn 0 would
    pretend to comment on a turn that hasn't happened."""

    async def fake_run(_self, _input, _gateway):
        # Deliberately non-None — the agent layer can't enforce A12, only
        # the runtime callsite can. Schema length is fine (≤30 chars), so
        # this would pass validation if forwarded as-is.
        return InterviewerAgentOutput(
            question="先聊聊你最近主导的项目。",
            intent="开场",
            expected_depth="surface",
            followup_hint=None,
            live_observation="不该出现的观察",
        )

    monkeypatch.setattr(InterviewerAgentService, "run", fake_run)

    runtime = SessionRuntime(
        session_id="session-force-none", llm_config=_config()
    )
    try:
        await runtime.bootstrap_first_question(framework_json="{}")

        event = runtime.event_queue.get_nowait()
        assert isinstance(event, QuestionGeneratedEvent)
        assert event.turn_index == 0
        # The whole point of this test:
        assert event.live_observation is None, (
            "runtime must force-None live_observation on turn 0 "
            "(A12 red line); LLM emitted text was leaked"
        )
    finally:
        await runtime.on_session_end()


async def test_bootstrap_forces_none_when_llm_already_emits_none(
    monkeypatch,
) -> None:
    """Sanity: well-behaved LLM (None) still works through the same path."""

    async def fake_run(_self, _input, _gateway):
        return InterviewerAgentOutput(
            question="介绍一下你最近的一次决策。",
            intent="决策考察",
            expected_depth="tactical",
            followup_hint=None,
            live_observation=None,
        )

    monkeypatch.setattr(InterviewerAgentService, "run", fake_run)

    runtime = SessionRuntime(
        session_id="session-force-none-happy", llm_config=_config()
    )
    try:
        await runtime.bootstrap_first_question(framework_json="{}")
        event = runtime.event_queue.get_nowait()
        assert isinstance(event, QuestionGeneratedEvent)
        assert event.live_observation is None
    finally:
        await runtime.on_session_end()
