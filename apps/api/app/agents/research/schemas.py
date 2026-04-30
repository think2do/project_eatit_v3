"""Research Agent schemas (F-320).

L0 A11 privacy guardrail: ResearchAgentInput is `extra="forbid"`. Any
caller that passes resume_text / candidate_email / candidate_phone /
other PII triggers a Pydantic ValidationError before the request ever
reaches the LLM. See `apps/api/tests/agents/test_research.py` for the
rejection cases.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


SignalType = Literal["funding", "product", "personnel", "market", "regulation"]
CompanyStage = Literal["seed", "growth", "mature", "listed", "unknown"]
Confidence = Literal["high", "mid", "low"]


class Signal(BaseModel):
    type: SignalType
    summary: str = Field(max_length=200)
    occurred_at: datetime | None = None
    # source_url comes from LLM web_search; clients must treat as
    # potentially-unverified third-party data.
    source_url: str | None = None


class CompanyProfile(BaseModel):
    name: str = Field(max_length=80)
    business_model: str = Field(max_length=200)
    stage: CompanyStage
    recent_signals: list[Signal] = Field(default_factory=list, max_length=8)
    evidence_links: list[str] = Field(default_factory=list, max_length=10)
    confidence: Confidence


class IndustryProfile(BaseModel):
    name: str = Field(max_length=60)
    landscape_summary: str = Field(max_length=200)
    key_metrics: list[str] = Field(default_factory=list, min_length=3, max_length=6)
    typical_pain_points: list[str] = Field(
        default_factory=list, min_length=2, max_length=5
    )
    competitors_in_jd_ctx: list[str] = Field(default_factory=list, max_length=8)


class ResearchAgentInput(BaseModel):
    """L0 A11 — strictly company/role/industry only.

    `extra="forbid"` rejects ANY unknown field including resume_text,
    candidate_email, candidate_phone, etc. This is the first line of
    defence; the prompt and audit log are belt-and-braces backups.
    """

    model_config = ConfigDict(extra="forbid")

    company_name: str = Field(min_length=1, max_length=80)
    role_title: str = Field(min_length=1, max_length=80)
    industry_hints: list[str] = Field(min_length=1, max_length=5)


class ResearchAgentOutput(BaseModel):
    company: CompanyProfile
    industry: IndustryProfile
    fetched_at: datetime
    # sha256(company_name + ',' + ','.join(industry_hints))[:16] —
    # used by research_cache (M2.3.2) and audit logs. Never the raw name.
    cache_key: str = Field(min_length=8, max_length=64)
    # True when LLM tool use was unavailable or fetching timed out, so
    # the result was synthesized from model-internal knowledge only.
    degraded: bool = False
    degraded_reason: str | None = None
