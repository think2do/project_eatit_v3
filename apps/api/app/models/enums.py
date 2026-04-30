from __future__ import annotations

from enum import StrEnum
from typing import Literal


# v3.2+ palette (F-307). These are Literal types rather than StrEnums
# because Pydantic Literal validation gives the exact enumerated set
# in error messages, which is what M1.1's boundary tests expect. The
# legacy StrEnums below are kept verbatim — L0 forbids deletion.
InterviewStyleV32 = Literal["structured", "pressure", "friendly", "expert"]
InterviewDirectionV32 = Literal[
    "ai-insight",
    "data-driven",
    "cross-func",
    "zero-to-one",
    "user-research",
    "strategy",
]
InterviewDurationV32 = Literal[15, 30, 45]


class CandidateAssetStatus(StrEnum):
    DRAFT = "draft"
    READY_FOR_PARSE = "ready_for_parse"
    PARSE_IN_PROGRESS = "parse_in_progress"
    ANALYSIS_READY = "analysis_ready"
    PARSE_FAILED = "parse_failed"


class ParseResultStatus(StrEnum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class InterviewStyle(StrEnum):
    FRIENDLY_GUIDED = "friendly_guided"
    STANDARD_PROFESSIONAL = "standard_professional"
    HIGH_PRESSURE_FOLLOWUP = "high_pressure_followup"


class InterviewDirection(StrEnum):
    ROLE_MATCH = "role_match"
    PROJECT_DEEP_DIVE = "project_deep_dive"
    BEHAVIORAL_COMPREHENSIVE = "behavioral_comprehensive"


class InterviewSessionStatus(StrEnum):
    CREATED = "created"
    SESSION_STARTED = "session_started"
    TURN_RECORDING = "turn_recording"
    TURN_TRANSCRIBING = "turn_transcribing"
    TURN_EVALUATING = "turn_evaluating"
    TURN_COMPRESSING = "turn_compressing"
    NEXT_QUESTION_READY = "next_question_ready"
    PAUSED = "paused"
    ENDED = "ended"
    EXITED_EARLY = "exited_early"
    REPORT_GENERATING = "report_generating"
    REPORT_READY = "report_ready"
    FAILED = "failed"


class InterviewReportStatus(StrEnum):
    PENDING = "pending"
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"


class MetaReportStatus(StrEnum):
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"
