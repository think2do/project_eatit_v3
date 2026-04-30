from __future__ import annotations

from app.agents.parse.schemas import ParseAgentInput, ParseAgentOutput
from app.infra.llm import LLMGateway
from app.infra.llm.instructor_client import make_instructor, structured_completion
from app.prompts import render_prompt
from app.schemas.parse import InterviewFocus, MatchScore


def _derive_match_score(advantages_n: int, gaps_n: int) -> MatchScore:
    """Fallback: derive a match score when the LLM omits it."""
    delta = advantages_n - gaps_n
    if delta >= 2:
        return MatchScore(score=65, level="MID", one_line="自动估算:优势略多于缺口")
    if delta >= 0:
        return MatchScore(score=50, level="LOW", one_line="自动估算:优劣势接近持平")
    return MatchScore(score=40, level="LOW", one_line="自动估算:缺口多于优势")


_DEFAULT_INTERVIEW_FOCUS: list[InterviewFocus] = [
    InterviewFocus(
        direction_id="cross-func",
        priority="high",
        title="跨职能协作",
        description="默认补位:验证跨团队推进与对齐能力。",
    ),
    InterviewFocus(
        direction_id="zero-to-one",
        priority="mid",
        title="0→1 推动力",
        description="默认补位:看候选人独立推进新项目的节奏。",
    ),
]


class ParseAgentService:
    async def run(self, input: ParseAgentInput, gateway: LLMGateway) -> ParseAgentOutput:
        system = render_prompt("parse", "system")
        user = render_prompt(
            "parse",
            "user",
            resume_text=input.resume_text,
            jd_text=input.jd_text,
        )
        client = make_instructor(gateway)
        result = await structured_completion(
            client,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_model=ParseAgentOutput,
        )
        if result.match_score is None:
            result.match_score = _derive_match_score(
                advantages_n=len(result.match_advantages),
                gaps_n=len(result.gaps),
            )
        if len(result.interview_focus) < 2:
            result.interview_focus = list(_DEFAULT_INTERVIEW_FOCUS)
        return result
