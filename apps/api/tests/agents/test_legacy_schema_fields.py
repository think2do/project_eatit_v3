"""G9 fix (2026-04-30 audit) — A10 数据契约只增不改专项守护.

L0 A10: v3.1 老 schema 字段不删,只增。v3.2+ 在 InterviewReportPayload
和 enums 上加了新字段(`pass_likelihood` / `dimensions[]` /
`round_reviews_v2[]` / `next_actions_v2`),老字段(`pass_probability` /
`reasons[]` / 老 `next_actions: list[str]` / 老 `RoundReview` /
`InterviewStyle` / `InterviewDirection` 老枚举)必须保留作向后兼容,
即使新 UI 不再读取它们。

前端任何持久化的 v3.1 报告 JSON / settings JSON / Alembic 老迁移产物
仍然能反序列化成功,这是 L0 红线。本文件用 schema 反射断言这些字段
仍然存在,任何静默删除都失败 CI。
"""

from __future__ import annotations

from app.models.enums import InterviewDirection, InterviewStyle
from app.schemas.reports import InterviewReportPayload, RoundReview


def test_legacy_pass_probability_field_retained() -> None:
    """v3.1 `pass_probability: int 0-100` (匹配度) — F-314 加了
    `overall_score` 替代它,但老字段仍要 round-trip 老 JSON."""
    fields = InterviewReportPayload.model_fields
    assert "pass_probability" in fields, "L0 A10: pass_probability 字段被删"
    # 默认值 = 0(老报告 missing 时不抛)
    info = fields["pass_probability"]
    assert info.default == 0


def test_legacy_next_actions_list_str_retained() -> None:
    """v3.1 `next_actions: list[str]` — M1.5 加了 `next_actions_v2:
    NextActions` 并行存在,但老 list[str] 不能删。"""
    fields = InterviewReportPayload.model_fields
    assert "next_actions" in fields, "L0 A10: next_actions 字段被删"
    assert "next_actions_v2" in fields, "next_actions_v2 should also exist"


def test_legacy_reasons_field_retained() -> None:
    """v3.1 `reasons: list[ReportReason]` — verdict 配套字段,新 UI
    不渲染,但老报告仍带这条数组。"""
    fields = InterviewReportPayload.model_fields
    assert "reasons" in fields, "L0 A10: reasons 字段被删"


def test_legacy_round_review_class_retained() -> None:
    """v3.1 `RoundReview` 类(F-313 加了 `RoundReviewV2` 并行)。
    `round_reviews: list[RoundReview]` 仍是 payload 字段,RoundReview
    类本身必须可导入。"""
    # Class importable + has the v3.1 minimum field set.
    assert hasattr(RoundReview, "model_fields")
    legacy_fields = RoundReview.model_fields
    assert "question" in legacy_fields
    assert "answer" in legacy_fields
    assert "assessment" in legacy_fields

    payload_fields = InterviewReportPayload.model_fields
    assert "round_reviews" in payload_fields
    assert "round_reviews_v2" in payload_fields, (
        "v3.2 RoundReviewV2 should coexist with legacy round_reviews"
    )


def test_legacy_interview_style_enum_retained() -> None:
    """v3.1 `InterviewStyle` StrEnum (3 老值) 必须保留作老 session JSON
    反序列化兼容。F-307 v3.2 用 `InterviewStyleV32` Literal 并行存在。"""
    legacy_values = {member.value for member in InterviewStyle}
    assert "friendly_guided" in legacy_values
    assert "standard_professional" in legacy_values
    assert "high_pressure_followup" in legacy_values
    assert len(legacy_values) == 3, (
        f"InterviewStyle 老枚举应有恰好 3 项,got {sorted(legacy_values)}"
    )


def test_legacy_interview_direction_enum_retained() -> None:
    """v3.1 `InterviewDirection` StrEnum (3 老值) 同样保留。"""
    legacy_values = {member.value for member in InterviewDirection}
    assert "role_match" in legacy_values
    assert "project_deep_dive" in legacy_values
    assert "behavioral_comprehensive" in legacy_values
    assert len(legacy_values) == 3, (
        f"InterviewDirection 老枚举应有恰好 3 项,got {sorted(legacy_values)}"
    )
