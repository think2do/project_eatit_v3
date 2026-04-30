"""V32.M3.X audit-fix G1 — fire-and-forget post-report trigger isolation.

PRD §0.4 + AGENTS.md §6 红线第 3 条:Coach / Reflection 必须**异步且不阻塞
主流程**。``_spawn_post_report_coach_trigger`` 在 ``_generate_report_task``
末尾(report row 已 commit READY 之后)被调用,自身 try/except 把任何
spawn-time 失败转成 ``logger.warning("post_report_coach_spawn_failed", ...)``
+ 返回 ``None``。本套测试守住该隔离契约:

  1. ``build_default_coach_service`` 抛 ``RuntimeError`` ⇒ report 仍 READY
  2. ``build_default_reflection_service`` 抛 ``ValueError`` ⇒ report 仍 READY

两条 case 镜像 M3.2.2 之后 post_report_graph 的 coach_node + reflection_node
并行结构,显式覆盖 tester audit 指出的 G1 测试空洞(原 ``test_reports_api``
没有显式断言 trigger 抛错时 status 不被翻掉)。
"""
from __future__ import annotations

import base64
import json
import logging

import anyio
import pytest
from httpx import ASGITransport, AsyncClient

from app.agents.framework.schemas import (
    DeepDiveAnchor,
    FocusCompetency,
    FrameworkAgentOutput,
    PacePlan,
    PaceSegment,
)
from app.agents.framework.service import FrameworkAgentService
from app.agents.parse.schemas import ParseAgentOutput
from app.agents.parse.service import ParseAgentService
from app.agents.report.schemas import Reason, ReportAgentOutput
from app.agents.report.service import ReportAgentService
from app.main import app


def _llm_config_header() -> str:
    return base64.b64encode(
        json.dumps(
            {
                "provider": "openai",
                "api_key": "sk-isolation-test",
                "model": "gpt-4o-mini",
                "base_url": None,
            }
        ).encode("utf-8")
    ).decode("ascii")


def _fake_parse_output() -> ParseAgentOutput:
    return ParseAgentOutput.model_validate(
        {
            "job_requirements": [{"title": "岗位理解", "detail": "把经历映射到岗位。"}],
            "candidate_highlights": [{"title": "结果导向", "detail": "能说明项目结果。"}],
            "candidate_risks": [{"title": "数据不足", "detail": "需要补充指标。"}],
            "project_hooks": [
                {
                    "project_name": "AI 面试官",
                    "reason": "与岗位相关。",
                    "focus_points": ["场景选择", "指标设计"],
                }
            ],
            "match_summary": "候选人匹配中上。",
        }
    )


def _fake_framework_output() -> FrameworkAgentOutput:
    return FrameworkAgentOutput(
        direction="project_deep_dive",
        focus_competencies=[
            FocusCompetency(title="岗位理解", why="AI PM 核心", probe_hint="0→1 项目")
        ],
        opening_questions=["请介绍最近一个完整上线的项目"],
        deep_dive_anchors=[
            DeepDiveAnchor(anchor="AI 面试官", probe_chain=["what", "why", "how"])
        ],
        pace_plan=PacePlan(
            total_minutes=20,
            segments=[
                PaceSegment(name="opening", rough_minutes=3, goal="破冰"),
                PaceSegment(name="core_project", rough_minutes=15, goal="项目深挖"),
                PaceSegment(name="closing", rough_minutes=2, goal="反问"),
            ],
        ),
    )


def _fake_report_output() -> ReportAgentOutput:
    return ReportAgentOutput(
        pass_probability=72,
        summary="候选人整体胜任,但若干维度需要复盘。",
        reasons=[
            Reason(
                aspect="指标设计",
                verdict="solid",
                evidence_turn_index=0,
                quote="完成率作为北极星指标",
            ),
            Reason(
                aspect="失败复盘",
                verdict="weak",
                evidence_turn_index=1,
                quote="主要是配合执行",
            ),
        ],
        next_actions=["整理上线指标表", "复盘失败项目"],
    )


async def _drive_report_to_terminal(monkeypatch: pytest.MonkeyPatch) -> tuple[int, dict | None]:
    """Run upload→parse→session→trigger-report→poll until READY (or 409 budget exhausted).

    Returns ``(final_status_code, final_payload)``. Caller asserts on the
    pair so each isolation test can verify the report stuck on READY
    despite the spawn-time failure injected via monkeypatch.
    """
    parse_out = _fake_parse_output()
    framework_out = _fake_framework_output()
    report_out = _fake_report_output()

    async def fake_parse_run(self, agent_input, gateway):  # noqa: ANN001
        return parse_out

    async def fake_framework_run(self, agent_input, gateway):  # noqa: ANN001
        return framework_out

    async def fake_report_run(self, agent_input, gateway):  # noqa: ANN001
        return report_out

    monkeypatch.setattr(ParseAgentService, "run", fake_parse_run)
    monkeypatch.setattr(FrameworkAgentService, "run", fake_framework_run)
    monkeypatch.setattr(ReportAgentService, "run", fake_report_run)

    headers = {"X-LLM-Config": _llm_config_header()}
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://testserver", headers=headers
    ) as client:
        resume_response = await client.post(
            "/api/v1/assets/resume",
            files={"file": ("resume.txt", b"resume-content", "text/plain")},
        )
        asset_id = resume_response.json()["asset_bundle_id"]

        await client.post(
            "/api/v1/assets/jd",
            files={"file": ("jd.txt", b"jd-content", "text/plain")},
            data={"asset_bundle_id": asset_id},
        )
        await client.post(f"/api/v1/assets/{asset_id}/parse")
        session_response = await client.post(
            "/api/v1/sessions",
            json={
                "asset_bundle_id": asset_id,
                "config": {
                    "style": "standard_professional",
                    "direction": "project_deep_dive",
                    "duration_minutes": 20,
                },
            },
        )
        session_id = session_response.json()["session_id"]

        trigger_response = await client.post(
            f"/api/v1/sessions/{session_id}/report", json={}
        )
        assert trigger_response.status_code == 200
        assert trigger_response.json()["status"] == "generating"

        final_status_code = 0
        final_payload: dict | None = None
        for _ in range(20):
            report_response = await client.get(
                f"/api/v1/sessions/{session_id}/report"
            )
            final_status_code = report_response.status_code
            if report_response.status_code == 200:
                final_payload = report_response.json()
                break
            assert report_response.status_code == 409
            await anyio.sleep(0.05)

    return final_status_code, final_payload


def _spawn_warning_records(
    caplog: pytest.LogCaptureFixture,
) -> list[logging.LogRecord]:
    """Filter caplog for the swallowed-spawn-failure warning we expect."""
    return [
        record
        for record in caplog.records
        if record.name == "app.domain.reports.service"
        and record.levelno == logging.WARNING
        and record.getMessage() == "post_report_coach_spawn_failed"
    ]


async def test_report_ready_when_coach_trigger_build_raises(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """G1 case 1 — Coach build failure does not flip the report off READY.

    ``build_default_coach_service`` raises mid-spawn. The spawn helper's
    own ``try/except`` must catch it, log a single WARN, return ``None``.
    ``_generate_report_task`` returns successfully and the report row,
    committed READY before the spawn call, stays READY for the user.
    """

    def _coach_build_raises(*_args, **_kwargs):  # type: ignore[no-untyped-def]
        raise RuntimeError("simulated coach build failure")

    monkeypatch.setattr(
        "app.domain.reports.service.build_default_coach_service",
        _coach_build_raises,
    )

    caplog.set_level(logging.WARNING, logger="app.domain.reports.service")
    status_code, payload = await _drive_report_to_terminal(monkeypatch)

    # Contract — report row settles on READY despite the spawn explosion.
    assert status_code == 200
    assert payload is not None
    assert payload["status"] == "ready"
    assert payload["payload"]["pass_probability"] == 72

    # Contract — spawn helper caught the failure and emitted a single WARN
    # (no ERROR / no upstream propagation).
    warnings = _spawn_warning_records(caplog)
    assert len(warnings) >= 1, (
        "expected post_report_coach_spawn_failed WARN; "
        f"got: {[(r.name, r.levelno, r.getMessage()) for r in caplog.records]}"
    )
    assert getattr(warnings[0], "reason", None) == "RuntimeError"

    # Contract — nothing escalated above WARN inside the reports service
    # (an ERROR/CRITICAL would mean the spawn helper let the failure bubble).
    escalated = [
        r
        for r in caplog.records
        if r.name == "app.domain.reports.service"
        and r.levelno >= logging.ERROR
    ]
    assert escalated == [], (
        f"spawn failure must not escalate to ERROR/CRITICAL; got: "
        f"{[(r.levelno, r.getMessage()) for r in escalated]}"
    )


async def test_report_ready_when_reflection_trigger_build_raises(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """G1 case 2 — Reflection build failure does not flip the report off READY.

    Mirrors case 1 with the M3.2.2 reflection service as the failure
    point. Reflection runs in parallel with Coach inside the same
    post_report_graph spawn call — its build raise must be caught by
    the same try/except shield without touching the user-facing report.
    """

    def _reflection_build_raises(*_args, **_kwargs):  # type: ignore[no-untyped-def]
        raise ValueError("simulated reflection build failure")

    monkeypatch.setattr(
        "app.domain.reports.service.build_default_reflection_service",
        _reflection_build_raises,
    )

    caplog.set_level(logging.WARNING, logger="app.domain.reports.service")
    status_code, payload = await _drive_report_to_terminal(monkeypatch)

    assert status_code == 200
    assert payload is not None
    assert payload["status"] == "ready"
    assert payload["payload"]["pass_probability"] == 72

    warnings = _spawn_warning_records(caplog)
    assert len(warnings) >= 1, (
        "expected post_report_coach_spawn_failed WARN; "
        f"got: {[(r.name, r.levelno, r.getMessage()) for r in caplog.records]}"
    )
    assert getattr(warnings[0], "reason", None) == "ValueError"

    escalated = [
        r
        for r in caplog.records
        if r.name == "app.domain.reports.service"
        and r.levelno >= logging.ERROR
    ]
    assert escalated == [], (
        f"spawn failure must not escalate to ERROR/CRITICAL; got: "
        f"{[(r.levelno, r.getMessage()) for r in escalated]}"
    )
