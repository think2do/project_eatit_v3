export type HealthStatus = {
  status: "ok";
  version: string;
};

export type AppVersion = {
  version: string;
};

export type CandidateAssetStatus =
  | "draft"
  | "ready_for_parse"
  | "parse_in_progress"
  | "analysis_ready"
  | "parse_failed";

export type ParseResultStatus = "pending" | "succeeded" | "failed";

export type InterviewStyle =
  | "friendly_guided"
  | "standard_professional"
  | "high_pressure_followup";

export type InterviewDirection =
  | "role_match"
  | "project_deep_dive"
  | "behavioral_comprehensive";

// v3.2+ palette (F-307). The legacy types above are retained for
// L0 back-compat (and still typed in legacy session payloads).
export type InterviewStyleV32 = "structured" | "pressure" | "friendly" | "expert";

export type InterviewDirectionV32 =
  | "ai-insight"
  | "data-driven"
  | "cross-func"
  | "zero-to-one"
  | "user-research"
  | "strategy";

export type InterviewDurationV32 = 15 | 30 | 45;

// F-308 InterviewerPersona names — A6 red line, locked to exactly
// these four. Mirrored on the backend in
// apps/api/app/agents/interviewer/personas.py.
export type InterviewerPersonaName = "Sarah" | "Marcus" | "Lin" | "Daniel";

export type InterviewerPersona = {
  name: InterviewerPersonaName;
  style: InterviewStyleV32;
  keywords: [string, string, string];
};

// F-312 / F-313 V32.M1.3 — five-dimension scorecard + per-question
// review. Five dimension names are an A8 red line; mirrored on the
// backend in `app/schemas/reports.py` + `app/domain/reports/service.py`.
export type DimensionName =
  | "专业深度"
  | "结构化表达"
  | "批判性思考"
  | "业务直觉"
  | "沟通节奏";

export type Chip = {
  text: string;
  good: boolean;
};

export type DimensionScore = {
  name: DimensionName;
  description: string;
  score: number;
  evidence_chips: Chip[];
};

export type RoundReviewTone = "good" | "ok" | "warn";

export type RoundReviewV2 = {
  turn_index: number;
  question_tag: string;
  question_text: string;
  score: number;
  tone: RoundReviewTone;
  answer_summary: string;
  ai_feedback: string;
};

// F-317 V32.M1.5 — preset-driven next-session CTA. The dark card on
// the report page renders when `next_actions_v2` is present; clicking
// the primary CTA hands `preset_config` to `app-store.presetConfig`
// and navigates to ConfigPage which then pre-fills on mount.
export type NextActions = {
  headline: string;
  preset_config: InterviewConfigRequest;
  reason: string;
};

export type InterviewSessionStatus =
  | "created"
  | "session_started"
  | "turn_recording"
  | "turn_transcribing"
  | "turn_evaluating"
  | "turn_compressing"
  | "next_question_ready"
  | "paused"
  | "ended"
  | "exited_early"
  | "report_generating"
  | "report_ready"
  | "failed";

export type InterviewReportStatus = "pending" | "generating" | "ready" | "failed";

export type FrameworkStage = {
  name: string;
  goal: string;
  question_budget: number;
};

export type DirectionFramework = {
  style: InterviewStyleV32 | InterviewStyle;
  direction: InterviewDirectionV32 | InterviewDirection;
  duration_minutes: number;
  stages: FrameworkStage[];
  focus_points: string[];
  risk_points: string[];
};

export type CompressedTurnSummary = {
  turn_index: number;
  question_tag: string;
  candidate_claims: string[];
  metrics_mentioned: string[];
  strengths: string[];
  weaknesses: string[];
  followup_candidates: string[];
  toxicity_or_risk: string[];
};

export type NormalizedQuestion = {
  turn_index: number;
  stage_name: string;
  question_tag: string;
  question_text: string;
};

export type NormalizedAnswer = {
  turn_index: number;
  transcript_text: string;
  cleaned_sentences: string[];
  key_points: string[];
};

export type NormalizedUserAssessment = {
  turn_index: number;
  strengths: string[];
  weaknesses: string[];
  risks: string[];
  suggestions: string[];
  evidence: string[];
  score_optional?: number | null;
};

export type ReferenceAnswer = {
  checkpoints: string[];
  expected_project_familiarity: string;
  expected_confidence: string;
  answer_script: string;
};

export type JobRequirement = {
  title: string;
  detail: string;
};

export type CandidateHighlight = {
  title: string;
  detail: string;
};

export type CandidateRisk = {
  title: string;
  detail: string;
};

export type ProjectHook = {
  project_name: string;
  reason: string;
  focus_points: string[];
};

export type MatchScoreLevel = "LOW" | "MID" | "HIGH";

export type MatchScore = {
  score: number;
  level: MatchScoreLevel;
  one_line: string;
};

export type MatchAdvantageTag = "强匹配" | "匹配";

export type MatchAdvantage = {
  label: string;
  tag: MatchAdvantageTag;
  evidence: string;
};

export type GapTag = "需补充" | "待评估";

export type Gap = {
  label: string;
  tag: GapTag;
  evidence: string;
};

export type InterviewDirectionId =
  | "ai-insight"
  | "data-driven"
  | "cross-func"
  | "zero-to-one"
  | "user-research"
  | "strategy";

export type InterviewFocus = {
  direction_id: InterviewDirectionId;
  priority: "high" | "mid" | "low";
  title: string;
  description: string;
};

export type ProjectHookV32 = {
  name: string;
  why: string;
};

export type CandidateProfile = {
  role: string;
  years: number;
  companies: string[];
  domain_tags: string[];
};

export type ParseResultPayload = {
  // legacy v3.1 fields (retained, L0 A10)
  job_requirements: JobRequirement[];
  candidate_highlights: CandidateHighlight[];
  candidate_risks: CandidateRisk[];
  project_hooks: ProjectHook[];
  match_summary: string | null;
  // v3.2 additions (F-301)
  candidate_profile: CandidateProfile | null;
  match_score: MatchScore | null;
  profile_summary: string | null;
  match_advantages: MatchAdvantage[];
  gaps: Gap[];
  interview_focus: InterviewFocus[];
  project_hooks_v32: ProjectHookV32[];
  // V32.M2.3.X audit-fix (F-320) — Parse Agent now mines the JD itself
  // for the company / role / industry signal that the intake_graph's
  // research_node consumes to build a ResearchAgentInput. All three are
  // optional because plenty of JDs anonymise the hiring company.
  jd_company_name?: string | null;
  jd_role_title?: string | null;
  jd_industry_hints?: string[];
};

export type ParseResultPreview = {
  match_summary: string;
  candidate_risk_count: number;
  project_hook_count: number;
};

// ===== Research Agent (F-320, V32.M2.3.1) =====
//
// Eighth agent. Runs in parallel with parse during the intake phase.
// Strict L0 A11 privacy: only company / role / industry crosses the
// wire — never resume_text or PII. The Python schema enforces this with
// `extra="forbid"`; this TS mirror is purely for the desktop UI.

export type ResearchSignalType =
  | "funding"
  | "product"
  | "personnel"
  | "market"
  | "regulation";

export type ResearchSignal = {
  type: ResearchSignalType;
  summary: string;
  occurred_at: string | null;
  source_url: string | null;
};

export type CompanyStage = "seed" | "growth" | "mature" | "listed" | "unknown";
export type ResearchConfidence = "high" | "mid" | "low";

export type CompanyProfile = {
  name: string;
  business_model: string;
  stage: CompanyStage;
  recent_signals: ResearchSignal[];
  evidence_links: string[];
  confidence: ResearchConfidence;
};

export type IndustryProfile = {
  name: string;
  landscape_summary: string;
  key_metrics: string[];
  typical_pain_points: string[];
  competitors_in_jd_ctx: string[];
};

export type ResearchResult = {
  company: CompanyProfile;
  industry: IndustryProfile;
  fetched_at: string;
  cache_key: string;
  degraded: boolean;
  degraded_reason: string | null;
};

// ===== Predicted Question Bank (F-321, V32.M2.3.3) =====
//
// Framework Agent emits this when Parse + (optional) Research carry
// enough evidence. The desktop UI renders it on ParsedPanel as the
// PredictedQuestionList card. M2.3.5 wires the card.

export type PredictedQuestionCategory =
  | "company-business"
  | "industry-judgment"
  | "project-deepdive"
  | "general-pm";

export type PredictedQuestionSource = "jd" | "resume" | "research";

export type PredictedQuestion = {
  category: PredictedQuestionCategory;
  question: string;
  why_likely: string;
  related_evidence: string;
};

export type PredictedQuestionBank = {
  questions: PredictedQuestion[];
  generated_at: string;
  sources: PredictedQuestionSource[];
};

export type TimestampedEntity = {
  id: string;
  created_at: string;
  updated_at: string;
};

export type AssetUploadRequest = {
  asset_bundle_id?: string | null;
};

export type AssetUploadResponse = TimestampedEntity & {
  asset_bundle_id: string;
  status: CandidateAssetStatus;
  uploaded_kind: "resume" | "jd" | string;
};

export type CandidateAssetResponse = TimestampedEntity & {
  user_id: string;
  status: CandidateAssetStatus;
  resume_filename?: string | null;
  jd_filename?: string | null;
  parse_preview?: ParseResultPreview | null;
};

export type ParseRequestResponse = {
  asset_bundle_id: string;
  status: ParseResultStatus | string;
  payload: ParseResultPayload;
  // V32.M2.3.X audit-fix (F-320 / F-321) — intake_graph now plumbs the
  // research output and the predicted-question bank through the
  // ParseRequest response. Both default null when (a) the user has not
  // opted into connected research or (b) Framework declined to predict
  // (parse-trigger path leaves framework_config=None today).
  research_payload?: ResearchResult | null;
  predicted_questions?: PredictedQuestionBank | null;
};

export type ParseResultResponse = TimestampedEntity & {
  candidate_asset_id: string;
  status: ParseResultStatus | string;
  payload: ParseResultPayload;
};

export type InterviewConfigRequest = {
  // v3.2+ palette (F-307). Backend `_upgrade_style` validator also
  // accepts the legacy v3.1 strings via the InterviewStyle union, so
  // existing v3.1 client code keeps working through the transition.
  style: InterviewStyleV32 | InterviewStyle;
  // v3.2+ multi-select. 1–3 items required at validation time;
  // backend back-fills from `direction` (legacy single) when empty.
  directions: InterviewDirectionV32[];
  duration_minutes: InterviewDurationV32 | number;
  // v3.1 legacy single-select; deprecated but accepted for L0 compat.
  direction?: InterviewDirection;
};

export type InterviewConfigResponse = TimestampedEntity & {
  interview_session_id: string;
  style: InterviewStyleV32 | InterviewStyle;
  directions: InterviewDirectionV32[];
  duration_minutes: InterviewDurationV32 | number;
  direction?: InterviewDirection | null;
};

export type CreateSessionRequest = {
  asset_bundle_id: string;
  config: InterviewConfigRequest;
};

export type CreateSessionResponse = {
  session_id: string;
  status: InterviewSessionStatus;
  direction_framework: DirectionFramework;
};

export type SessionListRequest = {
  page?: number;
  page_size?: number;
  status?: InterviewSessionStatus;
};

export type SessionSummary = TimestampedEntity & {
  user_id: string;
  candidate_asset_id: string;
  status: InterviewSessionStatus;
  started_at?: string | null;
  ended_at?: string | null;
  turn_count: number;
  config_snapshot: Record<string, unknown>;
};

export type SessionDetailResponse = SessionSummary & {
  config?: InterviewConfigResponse | null;
  direction_framework?: DirectionFramework | null;
};

export type SessionListResponse = {
  items: SessionSummary[];
  page: number;
  page_size: number;
  total: number;
};

export type EndSessionResponse = {
  session_id: string;
  status: InterviewSessionStatus;
  ended_at: string;
};

export type RoundReview = {
  question: NormalizedQuestion;
  answer: NormalizedAnswer;
  assessment: NormalizedUserAssessment;
};

export type ReportVerdict = "strong" | "solid" | "mixed" | "weak";

export type ReportReason = {
  aspect: string;
  verdict: ReportVerdict;
  evidence_turn_index: number;
  quote: string;
};

export type PassLikelihood = "中上" | "中" | "中下";

export type InterviewReportPayload = {
  overall_summary: string;
  round_reviews: RoundReview[];
  strengths: string[];
  improvements: string[];
  next_actions: string[];
  // Deprecated 0–100 匹配度,L0 红线下不向用户展示;后端兼容字段
  pass_probability: number;
  reasons: ReportReason[];
  // F-314 v3.2+ additions. `pass_likelihood` is the only thing that
  // surfaces in the report hero. Backend coerces any LLM drift to
  // these three tiers before the payload reaches the client.
  pass_likelihood?: PassLikelihood | null;
  overall_score?: number | null;
  ai_verdict?: string | null;
  // F-312 / F-313 v3.2+ additions. `dimensions` is either exactly 5
  // (post-normalize_dimensions on backend) or empty (v3.1 legacy
  // reports). `round_reviews_v2` lives alongside the legacy
  // `round_reviews` field rather than replacing it (L0 retention).
  dimensions?: DimensionScore[];
  round_reviews_v2?: RoundReviewV2[];
  // F-317 v3.2+ — server-derived preset CTA. Null when every dimension
  // scored ≥ 80 or the report has no dimensions (v3.1 legacy).
  next_actions_v2?: NextActions | null;
};

export type TriggerReportRequest = {
  force_regenerate?: boolean;
};

export type TriggerReportResponse = {
  session_id: string;
  status: InterviewReportStatus;
  requested_at: string;
};

export type InterviewReportResponse = TimestampedEntity & {
  interview_session_id: string;
  status: InterviewReportStatus;
  requested_at?: string | null;
  generated_at?: string | null;
  payload: InterviewReportPayload;
};

export type ReportStatusResponse = {
  session_id: string;
  status: InterviewReportStatus;
  has_payload: boolean;
};

export type MetaReportStatus = "generating" | "ready" | "failed";

export type MetaReportVerdict = "weak" | "mixed" | "solid" | "strong";

export type RecurringWeakness = {
  aspect: string;
  occurrence_count: number;
  session_ids: string[];
  evidence_quotes: string[];
};

export type ImprovementSignal = {
  aspect: string;
  from_verdict: MetaReportVerdict;
  to_verdict: MetaReportVerdict;
  earlier_session_id: string;
  later_session_id: string;
};

export type PassProbabilityPoint = {
  session_id: string;
  session_created_at: string;
  pass_probability: number;
};

export type NextFocusArea = {
  aspect: string;
  reason: string;
  suggested_prep: string;
};

export type MetaReportPayload = {
  overall_trend_summary: string;
  recurring_weaknesses: RecurringWeakness[];
  improvement_signals: ImprovementSignal[];
  pass_probability_series: PassProbabilityPoint[];
  next_focus_areas: NextFocusArea[];
};

export type TriggerMetaReportRequest = {
  session_ids?: string[] | null;
};

export type TriggerMetaReportResponse = {
  id: string;
  task_id: string;
  status: MetaReportStatus;
  covered_session_ids: string[];
  created_at: string;
};

export type MetaReportFailurePayload = {
  detail: string;
};

export type MetaReportDetailResponse = {
  id: string;
  user_id: string;
  status: MetaReportStatus;
  covered_session_ids: string[];
  payload: MetaReportPayload | MetaReportFailurePayload | null;
  created_at: string;
  updated_at: string;
};

export type MetaReportListItem = {
  id: string;
  status: MetaReportStatus;
  covered_session_ids: string[];
  session_count: number;
  created_at: string;
};

export type MetaReportListResponse = {
  items: MetaReportListItem[];
  page: number;
  page_size: number;
  total: number;
};

// F-318 V32.M3.1.1 — cross-session insight payload produced by the Coach
// Agent and persisted in `user_insight_cache`. Mirrors the Pydantic schema
// at `apps/api/app/agents/coach/schemas.py`.
export type UserInsightStatus =
  | "pending"
  | "running"
  | "ok"
  | "failed"
  | "skipped";

export type UserInsightCache = {
  user_id: string;
  based_on_session_count: number;
  based_on_last_session_id: string;
  headline: string;
  headline_detail: string;
  recurring_weaknesses: string[];
  improvement_signals: string[];
  next_focus_areas: InterviewDirectionV32[];
  generated_at: string;
  status: UserInsightStatus;
};

export type ClientAudioStartEvent = {
  event: "client.audio.start";
  turn_index: number;
};

export type ClientAudioStopEvent = {
  event: "client.audio.stop";
  turn_index: number;
};

export type LLMConfigPayload = {
  provider: string;
  api_key: string;
  model: string;
  base_url?: string | null;
};

export type ClientSessionInitEvent = {
  event: "client.session.init";
  config: LLMConfigPayload;
};

export type ClientTurnStartEvent = {
  event: "client.turn.start";
};

export type ClientTurnEndEvent = {
  event: "client.turn.end";
  turn_index: number;
  question: string;
  answer: string;
};

export type ClientSessionPauseEvent = {
  event: "client.session.pause";
};

export type ClientSessionResumeEvent = {
  event: "client.session.resume";
};

export type ClientSessionEndEvent = {
  event: "client.session.end";
};

export type ClientTextEvent =
  | ClientSessionInitEvent
  | ClientTurnStartEvent
  | ClientTurnEndEvent
  | ClientAudioStartEvent
  | ClientAudioStopEvent
  | ClientSessionPauseEvent
  | ClientSessionResumeEvent
  | ClientSessionEndEvent;

export type ClientEvent = ClientTextEvent;

export type ServerTranscriptPartialEvent = {
  event: "server.transcript.partial";
  payload: {
    turn_index: number;
    text: string;
  };
};

export type ServerTranscriptFinalEvent = {
  event: "server.transcript.final";
  payload: {
    turn_index: number;
    text: string;
  };
};

export type ServerTurnAssessedEvent = {
  event: "server.turn.assessed";
  payload: {
    turn_index: number;
    summary: string;
    strengths: string[];
    weaknesses: string[];
  };
};

export type ServerTurnCompressedEvent = {
  event: "server.turn.compressed";
  payload: {
    summary: string;
    preserved_keywords: string[];
    open_threads: string[];
  };
};

export type ServerQuestionGeneratedEvent = {
  event: "server.question.generated";
  payload: {
    turn_index: number;
    question: string;
    intent: string;
    expected_depth: "surface" | "tactical" | "strategic";
    followup_hint: string | null;
    should_end: boolean;
    // F-319 v3.2+ chip list (added in M1.4). Optional so v3.1 mock
    // payloads still parse; the runtime mirrors the empty default.
    followup_hints?: string[];
    // F-309 v3.2+ — Interviewer Agent's per-turn observation (≤30 chars,
    // null on turn 0). When null, the desktop client falls back to the
    // legacy server.coach.observation event (A13 dual-track).
    live_observation?: string | null;
  };
};

export type ServerReferenceReadyEvent = {
  event: "server.reference.ready";
  payload: {
    turn_index: number;
    answer_outline: string[];
    ideal_answer: string;
    key_evaluation_points: string[];
    common_pitfalls: string[];
  };
};

export type ObserverTone = "support" | "alert" | "pivot";

export type ServerCoachObservationEvent = {
  event: "server.coach.observation";
  payload: {
    turn_index: number;
    observation: string;
    tone: ObserverTone;
    actionable: boolean;
  };
};

export type ServerSessionEndedEvent = {
  event: "server.session.ended";
  payload: {
    session_id: string;
    status: string;
  };
};

export type ServerErrorEvent = {
  event: "server.error";
  code: string;
  message: string;
  recoverable: boolean;
};

export type ServerEvent =
  | ServerTranscriptPartialEvent
  | ServerTranscriptFinalEvent
  | ServerTurnAssessedEvent
  | ServerTurnCompressedEvent
  | ServerQuestionGeneratedEvent
  | ServerReferenceReadyEvent
  | ServerCoachObservationEvent
  | ServerSessionEndedEvent
  | ServerErrorEvent;
