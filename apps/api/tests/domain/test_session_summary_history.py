"""V32.M1.1.X-followup — SessionSummary surfaces latest report fields.

After M3.1 the History dashboard gained an SessionTable that wants the
latest report's `overall_score` + `improvements[].title` for each row.
The serializer pulls them off the joined report so HistoryPage can
render the 评分 / 弱项 columns instead of a "—" placeholder.

These tests exercise `SessionsService._serialize_session_summary` directly
with hand-built `InterviewSession` instances, so we avoid the cost of
running the full SQLAlchemy fixture stack just to verify a field
projection.
"""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.domain.sessions.service import SessionsService
from app.models.enums import InterviewSessionStatus


def _make_session(
    *,
    report_payload: dict | None = None,
) -> SimpleNamespace:
    """Mimic an ``InterviewSession`` row with optional joined report."""
    now = datetime.now(UTC)
    report = (
        SimpleNamespace(payload=report_payload)
        if report_payload is not None
        else None
    )
    return SimpleNamespace(
        id="00000000-0000-0000-0000-000000000001",
        created_at=now,
        updated_at=now,
        user_id="00000000-0000-0000-0000-0000000000aa",
        candidate_asset_id="00000000-0000-0000-0000-0000000000bb",
        status=InterviewSessionStatus.ENDED,
        started_at=now,
        ended_at=now,
        turn_count=8,
        config_snapshot={"style": "structured", "duration_minutes": 30},
        report=report,
    )


def test_summary_falls_back_when_no_report() -> None:
    summary = SessionsService._serialize_session_summary(_make_session())
    assert summary.latest_overall_score is None
    assert summary.latest_weaknesses == []


def test_summary_pulls_overall_score_from_report_payload() -> None:
    summary = SessionsService._serialize_session_summary(
        _make_session(report_payload={"overall_score": 78}),
    )
    assert summary.latest_overall_score == 78


def test_summary_coerces_float_overall_score_to_int() -> None:
    summary = SessionsService._serialize_session_summary(
        _make_session(report_payload={"overall_score": 78.4}),
    )
    assert summary.latest_overall_score == 78


def test_summary_pulls_top_two_improvement_titles() -> None:
    summary = SessionsService._serialize_session_summary(
        _make_session(
            report_payload={
                "overall_score": 65,
                "improvements": [
                    {"title": "AI 落地"},
                    {"title": "数据驱动"},
                    {"title": "结构表达"},  # truncated by max_length=2
                ],
            },
        ),
    )
    assert summary.latest_weaknesses == ["AI 落地", "数据驱动"]


def test_summary_ignores_malformed_improvements() -> None:
    summary = SessionsService._serialize_session_summary(
        _make_session(
            report_payload={
                "overall_score": 50,
                # Missing `title`, wrong shape, mixed types — all skipped.
                "improvements": [{}, "not a dict", {"title": ""}],
            },
        ),
    )
    assert summary.latest_weaknesses == []


def test_summary_handles_report_payload_missing_keys() -> None:
    summary = SessionsService._serialize_session_summary(
        _make_session(report_payload={"unrelated": True}),
    )
    assert summary.latest_overall_score is None
    assert summary.latest_weaknesses == []
