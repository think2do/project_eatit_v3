from __future__ import annotations

import json
from typing import Any

from app.agents.interviewer.schemas import (
    InterviewerAgentInput,
    InterviewerAgentOutput,
)
from app.infra.llm import LLMGateway
from app.infra.llm.instructor_client import make_instructor, structured_completion
from app.prompts import render_prompt


def _extract_predicted_questions(framework_json: str) -> list[dict[str, Any]]:
    """Pull `predicted_questions.questions` out of a serialized DirectionFramework.

    Returns [] when:
    - framework_json is not parseable (degraded path: don't crash interviewing)
    - the framework has no predicted_questions key (M2.3.4 not yet wired)
    - predicted_questions is null (Framework Agent declined to predict)

    Surfacing the bank as a separate prompt variable lets the user.j2
    render an explicit "优先采用以下预测题(若适用)" block — the LLM
    sees the same JSON twice (in framework_json and the bank list) but
    the dedicated block raises salience without hard-coding selection.
    """
    try:
        parsed = json.loads(framework_json)
    except (json.JSONDecodeError, TypeError):
        return []
    bank = parsed.get("predicted_questions") if isinstance(parsed, dict) else None
    if not isinstance(bank, dict):
        return []
    questions = bank.get("questions")
    if not isinstance(questions, list):
        return []
    return [q for q in questions if isinstance(q, dict)]


class InterviewerAgentService:
    async def run(
        self, input: InterviewerAgentInput, gateway: LLMGateway
    ) -> InterviewerAgentOutput:
        system = render_prompt("interviewer", "system")
        # F-321 V32.M2.3.3 — when Framework emitted a PredictedQuestionBank
        # we surface it explicitly so the prompt can reference it as
        # "preferred questions" without forcing the LLM to re-parse the
        # whole framework_json blob.
        predicted_questions = _extract_predicted_questions(input.framework_json)
        user = render_prompt(
            "interviewer",
            "user",
            framework_json=input.framework_json,
            recent_turns=[t.model_dump() for t in input.recent_turns],
            long_term_summary=input.long_term_summary,
            remaining_minutes=input.remaining_minutes,
            predicted_questions=predicted_questions,
        )
        client = make_instructor(gateway)
        return await structured_completion(
            client,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_model=InterviewerAgentOutput,
        )
