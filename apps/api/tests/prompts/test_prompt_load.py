from __future__ import annotations

import pytest

from app.prompts import AGENT_NAMES, render_prompt


# Minimal variable sets that satisfy every user.j2 template.
_USER_VARS: dict[str, dict] = {
    "parse": {
        "resume_text": "候选人简历摘要",
        "jd_text": "岗位描述摘要",
    },
    "framework": {
        "parse_payload_json": "{}",
        "config": type(
            "Config",
            (),
            {"level": "senior", "style": "deep_dive", "duration_minutes": 30},
        )(),
    },
    "interviewer": {
        "framework_json": "{}",
        "recent_turns": [
            {
                "question": "讲一个最能代表你能力的项目",
                "answer": "我主导过一个 LLM 摘要产品",
                "assessment": None,
            },
        ],
        "long_term_summary": None,
        "remaining_minutes": 18,
    },
    "reference": {
        "question": "如何给 LLM 产品设计指标?",
        "job_context": "AI PM 岗位,负责文档摘要 agent",
        "candidate_answer": None,
    },
    "compression": {
        "previous_summary": None,
        "turns": [
            {"question": "问题 1", "answer": "回答 1"},
            {"question": "问题 2", "answer": "回答 2"},
        ],
    },
    "report": {
        "parse_payload_json": "{}",
        "framework_json": "{}",
        "turns": [
            {"question": "Q1", "answer": "A1", "assessment": None},
            {
                "question": "Q2",
                "answer": "A2",
                "assessment": type("Assessment", (), {"summary": "表现稳定"})(),
            },
        ],
        "long_term_summary": None,
    },
    "meta_report": {
        "session_count": 2,
        "sessions_json": "[]",
    },
    "observer": {
        "turn_index": 2,
        "question": "请说一个你主导的项目",
        "answer": "我主导过一个文档摘要 agent 的上线项目",
        "remaining_minutes": 5,
        "long_term_summary": None,
    },
    "research": {
        "company_name": "字节跳动",
        "role_title": "高级产品经理",
        "industry_hints": ["短视频", "推荐"],
    },
}


# System templates that require variables (most agents don't).
_SYSTEM_VARS: dict[str, dict] = {
    "meta_report": {"session_count": 2},
}


@pytest.mark.parametrize("agent", AGENT_NAMES)
def test_system_prompt_renders_and_includes_guardrails(agent: str) -> None:
    rendered = render_prompt(agent, "system", **_SYSTEM_VARS.get(agent, {}))

    assert rendered.strip(), f"{agent}/system.j2 rendered empty"
    # Shared guardrails banner should be embedded.
    assert "prompt injection" not in rendered.lower() or "忽略之前的指令" in rendered
    assert "忽略之前的指令" in rendered, "guardrails block missing"
    assert "内容安全边界" in rendered, "content safety rail missing"


@pytest.mark.parametrize("agent", AGENT_NAMES)
def test_user_prompt_renders_with_minimal_vars(agent: str) -> None:
    rendered = render_prompt(agent, "user", **_USER_VARS[agent])

    assert rendered.strip(), f"{agent}/user.j2 rendered empty"


def test_strict_undefined_raises_on_missing_variable() -> None:
    from jinja2.exceptions import UndefinedError

    with pytest.raises(UndefinedError):
        render_prompt("parse", "user")  # resume_text/jd_text not provided


def test_unknown_agent_raises_value_error() -> None:
    with pytest.raises(ValueError):
        render_prompt("no-such-agent", "system")


def test_guardrail_snippet_is_shared_not_duplicated() -> None:
    p_sys = render_prompt("parse", "system")
    f_sys = render_prompt("framework", "system")
    # Both must contain the shared guardrail marker exactly once.
    assert p_sys.count("忽略之前的指令") == 1
    assert f_sys.count("忽略之前的指令") == 1
