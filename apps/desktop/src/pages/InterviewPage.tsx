import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Loader2, Pause, Volume2, ChevronRight as ChevronRightIcon } from "lucide-react";
import { getAppSetting } from "@/api/appSettings";
import { loadLLMConfig, type LLMConfig } from "@/lib/llm/config";
import { useConnectivityStore } from "@/stores/connectivity-store";
import {
  requestMicPermission,
} from "@/lib/mic";
import { speakInterviewerLine, stopInterviewerLine } from "@/lib/tts";
import { useGlobalKeymap } from "@/lib/useGlobalKeymap";
import { EndConfirmDialog } from "@/components/EndConfirmDialog";
import { showToast } from "@/components/Toast";
import { useSessionStatusStore } from "@/stores/sessionStatus-store";
import { getSession, getSessionList, finalizeSession } from "@/api/sessions";
import { getCandidateAssetMeta, getParseResult } from "@/api/assets";
import type { InterviewSessionStatus } from "@eatit/shared-types";
import { hasASRCredentials } from "@/lib/asr/credentials";
import { deriveJobTitle } from "@/lib/jobTitle";
import {
  runInterviewSession,
  createAsyncQueue,
  type InterviewSessionInput,
  type RunInterviewSessionInput,
  type AsyncQueue,
} from "@/core/sessions/runInterviewSession";
import { FollowupHintChips } from "@/pages/interview/FollowupHintChips";
import { KeyboardShortcutHelper } from "@/pages/interview/KeyboardShortcutHelper";
import { LiveCaption } from "@/pages/interview/LiveCaption";
import { ObserverPanel } from "@/pages/interview/ObserverPanel";
import { SessionPaceCard, type PaceTone } from "@/pages/interview/SessionPaceCard";
import { DirectionProgressCard, type DirectionRow } from "@/pages/interview/DirectionProgressCard";
import { TopbarActionsPortal } from "@/components/TopbarActionsPortal";
import { RecBadge } from "@/pages/interview/RecBadge";
import {
  RecentRounds,
  type RecentRound,
} from "@/pages/interview/RecentRounds";
import { ReferencePanel } from "@/pages/interview/ReferencePanel";
import { SessionMetaStrip } from "@/pages/interview/SessionMetaStrip";
import { useTurnStats } from "@/pages/interview/useTurnStats";
import { VoiceControl } from "@/pages/interview/VoiceControl";
import { WaveBars } from "@/pages/interview/WaveBars";
import { interviewMachine } from "@/statecharts/interview-machine";
import { WarmupOverlay } from "@/components/WarmupOverlay";
import {
  createVolcStreamAsr,
  type VolcStreamAsrController,
} from "@/core/asr/volcStreamAsr";

const OBSERVER_BREAKPOINT_PX = 1100;

// F-308 personas — keep the desktop-side mapping local so we don't have
// to fetch /personas just to label the topbar. A6 red line: these names
// are locked on the backend (apps/api/app/agents/interviewer/personas.py).
const PERSONA_NAME_BY_STYLE: Record<string, string> = {
  structured: "Sarah",
  pressure: "Marcus",
  friendly: "Lin",
  expert: "Daniel",
};

const STYLE_LABEL_ZH: Record<string, string> = {
  structured: "结构化",
  pressure: "高压追问",
  friendly: "友好引导",
  expert: "专家深聊",
  // legacy v3.1 styles still tolerated by the backend validator
  friendly_guided: "友好引导",
  standard_professional: "结构化",
  high_pressure_followup: "高压追问",
};

// V32.M1.1.X-followup — direction id → 中文 label for the question card
// header tag-line. Mirrors `DIRECTION_OPTIONS` in ConfigPage.tsx but kept
// inline to avoid pulling the entire ConfigPage type-graph into the
// interview machine bundle. If a third site needs this map, extract.
const DIRECTION_LABEL_ZH: Record<string, string> = {
  "ai-insight": "AI 场景洞察",
  "data-driven": "数据驱动决策",
  "cross-func": "跨职能协作",
  "zero-to-one": "从 0 到 1",
  "user-research": "用户洞察",
  strategy: "产品战略",
};

// 2026-05-16:与 ConfigPage UI 标签 + QuestionQueue.totalTurnsByDuration 完全对齐。
// 之前三套算法各算各的(UI 读 framework.stages / 后端 ceil(min×0.4)+2 / framework
// pace_plan budget),导致 UI 显示 7/7 但 queue 还允许出 Q8 的错位。统一 lookup。
function estimateTotalTurns(durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 4;
  if (durationMinutes <= 15) return 4;
  if (durationMinutes <= 30) return 8;
  if (durationMinutes <= 45) return 12;
  return 16;
}

const WARMUP_REFERENCE_TIMEOUT_MS = 8000;

type InputMode = "voice" | "text";

function getViewportWidth(): number {
  if (typeof window === "undefined") return OBSERVER_BREAKPOINT_PX;
  return window.innerWidth;
}

export function InterviewPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isWarmupEntry = Boolean((location.state as { warming?: boolean } | null)?.warming);
  const [state, send] = useMachine(interviewMachine);
  const micStreamRef = useRef<MediaStream | null>(null);
  const controllerRef = useRef<VolcStreamAsrController | null>(null);
  const inputQueueRef = useRef<AsyncQueue<InterviewSessionInput> | null>(null);
  const setConnectivity = useConnectivityStore((s) => s.set);
  const [sessionInitialContext, setSessionInitialContext] = useState<RunInterviewSessionInput | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [asrAvailable, setAsrAvailable] = useState<boolean | null>(null);
  const [voiceError, setVoiceError] = useState<
    | { message: string; kind: "mic_denied" | "other" }
    | null
  >(null);
  const [observerPanelEnabled, setObserverPanelEnabled] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [observerCollapsed, setObserverCollapsed] = useState(
    () => getViewportWidth() < OBSERVER_BREAKPOINT_PX,
  );


  useEffect(() => {
    let mounted = true;
    loadLLMConfig()
      .then((cfg) => {
        if (mounted) setLlmConfig(cfg);
      })
      .catch(() => {
        /* keychain unavailable */
      })
      .finally(() => {
        if (mounted) setConfigLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getAppSetting<boolean>("observer_panel_enabled")
      .then((value) => {
        if (!mounted) return;
        if (value === null || value === undefined) {
          setObserverPanelEnabled(true);
          return;
        }
        setObserverPanelEnabled(Boolean(value));
      })
      .catch(() => {
        /* backend unavailable — default to on */
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getAppSetting<boolean>("interviewer_tts_enabled")
      .then((value) => {
        if (!mounted) return;
        setTtsEnabled(value === null || value === undefined ? true : Boolean(value));
      })
      .catch(() => {
        /* backend unavailable — default to on */
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getAppSetting<InputMode>("interview_input_mode")
      .then((value) => {
        if (!mounted) return;
        setInputMode(value === "text" ? "text" : "voice");
      })
      .catch(() => {
        /* backend unavailable — default stays "voice" */
      });
    return () => {
      mounted = false;
    };
  }, []);

  const currentQuestionText = state.context.currentQuestion?.question;
  const currentTurnIndex = state.context.currentQuestion?.turn_index;

  // M3.4.1.dev — init VolcStreamAsr controller once on mount; abort on unmount.
  useEffect(() => {
    controllerRef.current = createVolcStreamAsr({
      enableITN: true,
      enablePunc: true,
    });
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  // 2026-05-14 DIAG-state: track every state.value transition + currentQuestion turn_index.
  // 帮助诊断"屏幕显示了问题但 UI 卡在 等待问题加载"这种状态机异常。
  useEffect(() => {
    const stateValue = typeof state.value === "string" ? state.value : JSON.stringify(state.value);
    const qIdx = state.context.currentQuestion?.turn_index;
    const cqIdx = state.context.currentTurnIndex;
    console.warn(`[ST] state=${stateValue} currentQuestion.turn_index=${qIdx} currentTurnIndex=${cqIdx} hasError=${state.context.error != null}`);
  }, [state.value, state.context.currentQuestion?.turn_index, state.context.currentTurnIndex, state.context.error]);

  // Pre-warm the OS mic permission as soon as the page mounts, so the
  // first "开始录音" click doesn't sit on a TCC prompt mid-answer.
  // Failures are silent: the user will see the actionable banner the
  // moment they try to record. We also reuse the resulting stream to
  // skip a second getUserMedia call inside handleVoiceStart.
  useEffect(() => {
    if (inputMode !== "voice") return;
    if (micStreamRef.current) return;
    let cancelled = false;
    void (async () => {
      const result = await requestMicPermission();
      if (cancelled) {
        if (result.ok) {
          // Component unmounted while the OS dialog was open — release
          // the device so the user's other apps don't see the green dot.
          result.stream.getTracks().forEach((t) => t.stop());
        }
        return;
      }
      if (result.ok) {
        micStreamRef.current = result.stream;
      }
      // On denial we deliberately don't surface anything yet; the user
      // hasn't asked to record. handleVoiceStart shows the banner with
      // the "打开系统设置" button when they actually need the mic.
    })();
    return () => {
      cancelled = true;
    };
  }, [inputMode]);

  useEffect(() => {
    function onResize() {
      if (getViewportWidth() < OBSERVER_BREAKPOINT_PX) {
        setObserverCollapsed(true);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Setup effect: fetch session detail + parse result, then build sessionInitialContext.
  // Runs once sessionId + llmConfig are ready (configLoading gate keeps it from firing
  // before the keychain read completes).
  useEffect(() => {
    if (!sessionId || configLoading) return;
    if (!llmConfig) {
      send({ type: "WS_ERROR", message: "尚未配置 LLM,请先前往「设置」。" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const session = await getSession(sessionId);
        const parseResult = await getParseResult(session.candidate_asset_id);
        if (cancelled) return;
        const config = (session.config_snapshot ?? {}) as {
          duration_minutes?: number;
          style?: string;
          directions?: string[];
          direction?: string;
        };
        const durationMinutes =
          typeof config.duration_minutes === "number" ? config.duration_minutes : 30;
        const frameworkJson = session.direction_framework
          ? JSON.stringify(session.direction_framework)
          : "{}";
        const style = typeof config.style === "string" ? config.style : "structured";
        const personaName = (PERSONA_NAME_BY_STYLE[style] ?? "Sarah") as
          | "Sarah"
          | "Marcus"
          | "Lin"
          | "Daniel";
        setSessionInitialContext({
          sessionId,
          llmConfigMeta: {
            provider: llmConfig.provider,
            model: llmConfig.model,
            base_url: llmConfig.base_url ?? null,
          },
          frameworkJson,
          parseSummary: parseResult.payload,
          durationMinutes,
          personaName,
        });
      } catch (err) {
        if (!cancelled) {
          send({
            type: "WS_ERROR",
            message: err instanceof Error ? err.message : "session setup failed",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, configLoading, llmConfig, send]);

  // Generator effect: drive the AsyncGenerator and dispatch events to the statechart.
  // turn_index is tracked locally here because InterviewerAgentOutput doesn't carry it;
  // the generator increments its internal counter after each turn in lockstep with this
  // local counter.
  useEffect(() => {
    if (!sessionId || !sessionInitialContext) return;

    const inputQueue = createAsyncQueue<InterviewSessionInput>();
    inputQueueRef.current = inputQueue;
    setConnectivity("online");
    send({ type: "CONNECT", sessionId });

    let cancelled = false;
    let localTurnIndex = 0;

    void (async () => {
      try {
        send({ type: "WS_OPEN" });
        for await (const event of runInterviewSession(sessionInitialContext, inputQueue.iter())) {
          if (cancelled) break;
          switch (event.type) {
            case "question.generated":
              // Reset streaming text for the new turn
              setCurrentTurnStreamingText(null);
              console.warn(`[IP] question.generated localTurnIndex=${localTurnIndex} should_end=${event.payload.should_end} question="${event.payload.question?.slice(0, 40)}"`);
              send({
                type: "SERVER_QUESTION",
                payload: {
                  turn_index: localTurnIndex,
                  question: event.payload.question,
                  intent: event.payload.intent,
                  expected_depth: event.payload.expected_depth,
                  followup_hint: event.payload.followup_hint ?? null,
                  should_end: event.payload.should_end,
                  followup_hints: event.payload.followup_hints,
                  live_observation: event.payload.live_observation ?? null,
                },
              });
              // Non-warmup entries (history/refresh) skip the warming state in one tick.
              if (!isWarmupEntry) {
                send({ type: "REFERENCE_STARTED", turn_index: localTurnIndex });
              }
              // Increment after bootstrap; subsequent questions come one per turn.
              localTurnIndex += 1;
              break;
            case "turn.assessed":
              send({
                type: "SERVER_ASSESSED",
                payload: {
                  turn_index: localTurnIndex - 1,
                  summary: event.payload.summary,
                  strengths: event.payload.strengths,
                  weaknesses: event.payload.weaknesses,
                },
              });
              break;
            case "coach.observation":
              send({
                type: "SERVER_OBSERVATION",
                payload: {
                  turn_index: localTurnIndex - 1,
                  observation: event.payload.observation,
                  tone: event.payload.tone,
                  actionable: event.payload.actionable,
                },
              });
              break;
            case "reference.started":
              send({ type: "REFERENCE_STARTED", turn_index: event.turnIndex });
              break;
            case "reference.ready":
              send({
                type: "SERVER_REFERENCE",
                payload: {
                  turn_index: event.turnIndex,
                  answer_outline: event.payload.answer_outline,
                  ideal_answer: event.payload.ideal_answer,
                  key_evaluation_points: event.payload.key_evaluation_points,
                  common_pitfalls: event.payload.common_pitfalls,
                },
              });
              break;
            case "reference.chunk": {
              const map = referenceStreamingByTurnRef.current;
              const prev = map.get(event.turnIndex) ?? "";
              map.set(event.turnIndex, prev + event.delta);
              // M9.1: if this turn's reference is frozen (user is answering),
              // accumulate into the ref but don't push to React state so the
              // panel snapshot stays still while the user reads/recites.
              // Use frozenTurnIndexRef (not the state) to avoid closure staleness
              // in this long-lived async generator loop.
              if (frozenTurnIndexRef.current !== null && event.turnIndex === frozenTurnIndexRef.current) {
                break;
              }
              // Only trigger re-render for the currently active turn
              if (event.turnIndex === localTurnIndex - 1) {
                setCurrentTurnStreamingText(map.get(event.turnIndex) ?? null);
              }
              break;
            }
            case "reference.streamComplete":
              // Stream complete — no additional action needed;
              // accumulated text is already in referenceStreamingByTurnRef
              break;
            case "session.ended":
              send({ type: "END_SESSION" });
              break;
            case "error":
              send({ type: "WS_ERROR", message: `${event.payload.code}: ${event.payload.message}` });
              break;
          }
        }
      } catch (err) {
        if (!cancelled) {
          send({
            type: "WS_ERROR",
            message: err instanceof Error ? err.message : "session aborted",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      inputQueue.close();
      inputQueueRef.current = null;
    };
  }, [sessionId, sessionInitialContext, send, setConnectivity]);

  // M8.1: state.ended no longer auto-navigates to /report.
  // handleEndSession fires finalizeSession in the background and
  // navigates directly to "/" so the user isn't blocked.

  const submitAnswer = useCallback((text: string, turnIndex: number) => {
    inputQueueRef.current?.push({ type: "answer.submitted", text, turnIndex });
  }, []);

  const endSession = useCallback(() => {
    inputQueueRef.current?.push({ type: "session.end" });
  }, []);

  const handleVoiceStart = useCallback(async () => {
    if (!state.context.currentQuestion) return;
    if (state.context.isRecording) return;
    // Cut the interviewer mid-sentence so the user's own voice isn't
    // mixed with the playback through the mic feedback loop.
    stopInterviewerLine();
    setVoiceError(null);

    // Pre-flight: ASR credentials must exist before we even open the mic.
    // Without this check the user would see AUDIO_START flicker briefly
    // before WS_ERROR rolls isRecording back — a "click and immediately
    // stops" experience that hides the actionable next step (go to
    // Settings → ASR BYOK and fill in App ID + Access Token).
    const asrConfigured = await hasASRCredentials();
    if (!asrConfigured) {
      setVoiceError({
        kind: "other",
        message:
          "未配置火山引擎 ASR 凭证。请前往「设置 → ASR · 火山引擎语音识别凭证」填写 App ID + Access Token 后再试。",
      });
      return;
    }

    let stream = micStreamRef.current;
    if (!stream) {
      const result = await requestMicPermission();
      if (!result.ok) {
        setVoiceError({
          kind: result.error === "denied" ? "mic_denied" : "other",
          message: result.message,
        });
        return;
      }
      stream = result.stream;
      micStreamRef.current = stream;
    }

    // M3.4.1.dev — Bridge-based ASR: beginCapture dispatches partials/errors
    // to XState; no PCM bytes cross the Bridge from JS.
    controllerRef.current?.beginCapture({
      onPartial: (text) => {
        send({ type: "TRANSCRIPT_PARTIAL", text });
      },
      onError: (err) => {
        send({ type: "WS_ERROR", message: err.message });
      },
    });
    send({ type: "AUDIO_START" });
  }, [state, send]);

  const handleVoiceStop = useCallback(async () => {
    if (!state.context.isRecording) return;
    try {
      const result = await controllerRef.current?.endCapture();
      if (result) {
        send({ type: "TRANSCRIPT_FINAL", text: result.finalText });
      }
    } catch (err) {
      send({ type: "WS_ERROR", message: (err as Error).message });
    } finally {
      send({ type: "AUDIO_STOP" });
    }
  }, [state, send]);

  useEffect(() => {
    return () => {
      const stream = micStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
    };
  }, []);

  const handleSubmit = () => {
    const question = state.context.currentQuestion;
    if (!question) return;
    const answer = state.context.draftAnswer.trim();
    if (!answer) return;
    submitAnswer(answer, question.turn_index);
    // Snapshot for RecentRounds (M2.1.5). Tone defaults to "normal" until
    // server.turn.assessed comes back; an effect below upgrades it to
    // good/risk based on the assessment summary.
    setPastRounds((prev) => {
      if (prev.find((r) => r.index === question.turn_index)) return prev;
      const summary =
        answer.length > 60 ? `${answer.slice(0, 60).trim()}…` : answer;
      const next: RecentRound = {
        index: question.turn_index,
        question: question.question,
        answerSummary: summary,
        tone: "normal",
        toneLabel: "已记录",
      };
      return [...prev, next];
    });
    send({ type: "SUBMIT_ANSWER" });
  };

  // M2.1.5 — lift the latest assessment back into pastRounds so the
  // bottom strip shows tone tags as soon as scoring lands. Heuristic:
  // strengths > weaknesses → good; otherwise → risk.
  const lastAssessment = state.context.lastAssessment;
  useEffect(() => {
    if (!lastAssessment) return;
    setPastRounds((prev) =>
      prev.map((r) => {
        if (r.index !== lastAssessment.turn_index) return r;
        const tone: RecentRound["tone"] =
          lastAssessment.strengths.length >
          lastAssessment.weaknesses.length
            ? "good"
            : lastAssessment.weaknesses.length > 0
              ? "risk"
              : "normal";
        const toneLabel =
          tone === "good" ? "回答有亮点" : tone === "risk" ? "可改进" : "已记录";
        return {
          ...r,
          tone,
          toneLabel,
          answerSummary: lastAssessment.summary || r.answerSummary,
        };
      }),
    );
  }, [lastAssessment]);

  // M2.1.5 — session meta strip data. Fetched once on sessionId mount
  // (config_snapshot is the source of truth for style + duration).
  // Falling back to "—" placeholders keeps the strip visible during
  // the request window without flashing layout.
  const [sessionMeta, setSessionMeta] = useState<{
    jobTitle: string;
    style: string;
    totalTurns: number;
    /** Total session budget in minutes — drives SessionPaceCard's denominator. */
    durationMinutes: number;
    // First selected direction id, or null when the snapshot is from a
    // v3.1 session (legacy single-direction) or somehow malformed.
    // Used by the current-question card header tag-line on the right.
    primaryDirection: string | null;
    /** Full v3.2 directions list — drives DirectionProgressCard rows. */
    directions: string[];
  }>({
    jobTitle: "—",
    style: "structured",
    totalTurns: 5,
    durationMinutes: 30,
    primaryDirection: null,
    directions: [],
  });
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    getSession(sessionId)
      .then((detail) => {
        if (cancelled) return;
        const config = (detail.config_snapshot ?? {}) as Record<string, unknown>;
        const style =
          typeof config.style === "string" ? config.style : "structured";
        const duration =
          typeof config.duration_minutes === "number"
            ? config.duration_minutes
            : 30;
        const directionsRaw = config.directions;
        const directionsList: string[] = Array.isArray(directionsRaw)
          ? directionsRaw.filter(
              (d): d is string => typeof d === "string" && d.length > 0,
            )
          : typeof config.direction === "string" && config.direction.length > 0
            ? [config.direction as string]
            : [];
        const primaryDirection = directionsList[0] ?? null;
        // 2026-05-16:不再读 framework.stages.question_budget(LLM 出的题量不可控,
        // 容易跟 UI 标签错位)。统一用 duration → lookup,与 QuestionQueue +
        // ConfigPage UI 三处对齐。framework budget 仍由 turnGraph 内部做兜底
        // ceiling,但 UI 显示以 lookup 为准。
        const totalTurns = estimateTotalTurns(duration);
        // Provisional title from the asset id slice; replaced below
        // once the parse payload returns the real JD company + role.
        const titleFallback = detail.candidate_asset_id
          ? `候选人 · ${detail.candidate_asset_id.slice(0, 6)}`
          : "AI 模拟面试";
        setSessionMeta({
          jobTitle: titleFallback,
          style,
          totalTurns,
          durationMinutes: duration,
          primaryDirection,
          directions: directionsList,
        });
        // Chain parse-result + asset-meta fetches so the strip can show
        // "{company} · {role}" — falling back to the JD filename when the
        // LLM parse didn't surface either field. Both 404s are non-fatal:
        // we keep the candidate-id placeholder.
        if (!detail.candidate_asset_id) return;
        const assetId = detail.candidate_asset_id;
        Promise.all([
          getParseResult(assetId).catch(() => null),
          getCandidateAssetMeta(assetId).catch(() => null),
        ]).then(([parse, meta]) => {
          if (cancelled) return;
          const composed = deriveJobTitle({
            company: parse?.payload.jd_company_name,
            role: parse?.payload.jd_role_title,
            jdFileName: meta?.jdFilename,
          });
          if (composed) {
            setSessionMeta((prev) => ({ ...prev, jobTitle: composed }));
          }
        });
      })
      .catch(() => {
        /* keep placeholder values; non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // M2.1.5 — page-level elapsed (REC badge clock). Starts ticking once
  // the WS opens; resets to 0 if the user navigates away and returns.
  const [pageStartMs, setPageStartMs] = useState<number | null>(null);
  const [pageNow, setPageNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (state.matches("idle") || state.matches("connecting")) return;
    if (pageStartMs === null) {
      setPageStartMs(Date.now());
    }
    const t = window.setInterval(() => setPageNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [state, pageStartMs]);
  const pageElapsedSeconds =
    pageStartMs === null ? 0 : Math.floor((pageNow - pageStartMs) / 1000);

  // M2.1.5 — local history of past rounds for the bottom RecentRounds
  // strip. Snapshotted on every SUBMIT_ANSWER so we keep the question +
  // typed/transcribed answer text before the state machine resets the
  // turn fields. The XState machine doesn't carry per-turn history.
  const [pastRounds, setPastRounds] = useState<RecentRound[]>([]);

  // M8.3 — per-turn accumulated streaming reference text.
  // Kept in a ref (not state) to avoid re-render on every chunk;
  // a separate state triggers React re-render only when the current turn's
  // text changes (batched by the chunk handler below).
  const referenceStreamingByTurnRef = useRef<Map<number, string>>(new Map());
  const [currentTurnStreamingText, setCurrentTurnStreamingText] = useState<string | null>(null);

  // M9.1: freeze reference panel while the user is **actively answering**.
  // 2026-05-15 修正:之前进 user_answering 立即 freeze 太早,reference 流根本
  // 没机会到 UI(问题一出现 SERVER_QUESTION 就把状态机推进 user_answering)。
  // 真正应该 freeze 的时机是用户**开始动作**:打字(draftAnswer 非空)/ 录音
  // (isRecording 或有 partialTranscript)。进 user_answering 但还没动作时
  // 让 reference 继续 stream,等用户开始念/打字才 freeze。
  const [frozenTurnIndex, setFrozenTurnIndex] = useState<number | null>(null);
  const frozenTurnIndexRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state.matches("user_answering")) {
      setFrozenTurnIndex(null);
      frozenTurnIndexRef.current = null;
      return;
    }
    const hasStartedAnswering =
      state.context.draftAnswer.length > 0 ||
      state.context.isRecording ||
      state.context.partialTranscript.length > 0;
    if (hasStartedAnswering && frozenTurnIndexRef.current === null) {
      const idx = state.context.currentTurnIndex;
      setFrozenTurnIndex(idx);
      frozenTurnIndexRef.current = idx;
    }
  }, [
    state.value,
    state.context.currentTurnIndex,
    state.context.draftAnswer,
    state.context.isRecording,
    state.context.partialTranscript,
  ]);

  // F-515: 8s fallback to unblock warming if reference.started never fires.
  useEffect(() => {
    if (!state.matches("warming")) return;
    const t = window.setTimeout(() => {
      send({ type: "REFERENCE_STARTED", turn_index: state.context.currentTurnIndex });
    }, WARMUP_REFERENCE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [state.value, state.context.currentTurnIndex, send]);

  // F-310: per-turn wall-clock start. Resets the moment the user enters
  // the answering state for a new turn (covers both voice and text
  // modes). The hook freezes its timer when this is null, so we drop
  // back to null after submit / when out of user_answering.
  const [turnStartMs, setTurnStartMs] = useState<number | null>(null);
  const isUserAnsweringNow = state.matches("user_answering");
  const currentTurnIndexForStats = state.context.currentTurnIndex;
  useEffect(() => {
    if (isUserAnsweringNow) {
      setTurnStartMs(Date.now());
    } else {
      setTurnStartMs(null);
    }
  }, [isUserAnsweringNow, currentTurnIndexForStats]);
  const turnStats = useTurnStats(state.context.draftAnswer, turnStartMs);

  // F-311 — keymap state. `endConfirmOpen` gates EndConfirmDialog so Esc
  // only ever opens the dialog (never ends directly); the dialog's
  // 确认结束 button is what actually fires session.end.
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  // Speak each new interviewer line once, keyed by turn_index so a stale
  // re-render of the same question doesn't replay. Lives below sessionMeta
  // declaration — referencing sessionMeta.style above it hits TDZ.
  useEffect(() => {
    if (!ttsEnabled) return;
    if (!currentQuestionText) return;
    void speakInterviewerLine(currentQuestionText, sessionMeta.style);
    return () => {
      stopInterviewerLine();
    };
  }, [ttsEnabled, currentQuestionText, currentTurnIndex, sessionMeta.style]);

  const handleReplay = useCallback(() => {
    if (!ttsEnabled) return;
    if (!currentQuestionText) return;
    void speakInterviewerLine(currentQuestionText, sessionMeta.style);
  }, [ttsEnabled, currentQuestionText, sessionMeta.style]);

  const markAnalyzing = useSessionStatusStore((s) => s.markAnalyzing);
  const markReady = useSessionStatusStore((s) => s.markReady);

  const handleEndSession = useCallback(() => {
    setEndConfirmOpen(false);
    const sid = sessionId!;
    markAnalyzing(sid);
    void finalizeSession(sid).then((result) => {
      if (result.status === "ready") {
        markReady(sid);
        showToast("上一轮面试分析完成", {
          actionLabel: "查看",
          onAction: () => navigate(`/report/${sid}`),
        });
      } else {
        showToast("分析生成失败,请稍后在面试记录中重试", { tone: "error" });
      }
    });
    showToast("上一轮面试分析生成中…");
    endSession();
    send({ type: "END_SESSION" });
    navigate("/");
  }, [sessionId, markAnalyzing, markReady, endSession, send, navigate]);

  // 2026-05-16:监听状态机进入 ended(由 runInterviewSession 的 session.ended
  // 自动触发,典型场景:答完 totalTurns 上限的最后一题)→ 自动 navigate 回主页
  // + 触发分析生成 toast,跟用户手动点"结束面试"行为一致。
  const autoEndedRef = useRef(false);
  useEffect(() => {
    if (!state.matches("ended")) return;
    if (autoEndedRef.current) return;
    if (!sessionId) return;
    autoEndedRef.current = true;
    // 跟 handleEndSession 同样的副作用:markAnalyzing → finalize → toast → navigate
    markAnalyzing(sessionId);
    void finalizeSession(sessionId).then((result) => {
      if (result.status === "ready") {
        markReady(sessionId);
        showToast("上一轮面试分析完成", {
          actionLabel: "查看",
          onAction: () => navigate(`/report/${sessionId}`),
        });
      } else {
        showToast("分析生成失败,请稍后在面试记录中重试", { tone: "error" });
      }
    });
    showToast("面试已到达题数上限,正在生成分析…");
    navigate("/");
  }, [state, sessionId, markAnalyzing, markReady, navigate]);

  // Suspend the keymap once the session has wrapped — pressing Esc on a
  // navigated-away page would otherwise reopen the dialog.
  const keymapEnabled =
    !state.matches("idle") &&
    !state.matches("ended") &&
    state.context.currentQuestion !== null;
  useGlobalKeymap(
    {
      onSubmit: handleSubmit,
      onReplay: handleReplay,
      onEnd: () => setEndConfirmOpen(true),
    },
    keymapEnabled,
  );

  const statusLabel = useMemo(() => {
    if (state.matches("idle")) return "待启动";
    if (state.matches("connecting")) return "正在连接...";
    if (state.matches("ready")) return "等待第一道问题";
    if (state.matches("user_answering")) return "轮到你作答";
    if (state.matches("scoring")) return "AI 正在复盘这轮";
    if (state.matches("next_question")) return "生成下一题中...";
    if (state.matches("ended")) return "面试结束";
    return "";
  }, [state]);

  if (!sessionId) {
    return <NoSessionPlaceholder />;
  }

  const warmStage: 1 | 2 | 3 | null = !isWarmupEntry
    ? null
    : (state.matches("idle") || state.matches("connecting") || state.matches("ready"))
      ? 2
      : state.matches("warming")
        ? 3
        : null;
  if (warmStage !== null) {
    return <WarmupOverlay stage={warmStage} error={state.context.error} />;
  }

  const isUserAnswering = state.matches("user_answering");
  const showObserverPanel = observerPanelEnabled;
  const personaName =
    PERSONA_NAME_BY_STYLE[sessionMeta.style] ?? "Sarah";
  const styleLabel = STYLE_LABEL_ZH[sessionMeta.style] ?? "结构化";
  // Progress: completed turn count = currentTurnIndex (0-based →
  // turn 0 means we're answering Q1, so display 1/N). Cap at totalTurns.
  const progressTurn = Math.min(
    state.context.currentTurnIndex + (state.context.currentQuestion ? 1 : 0),
    sessionMeta.totalTurns,
  );

  const mainColumn = (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* V32.M1.1.X-followup — REC + 结束面试 moved to the global Topbar
          via TopbarActionsPortal so the page above-the-fold is dominated
          by the question card (matches design-reference/page-live.jsx).
          The portal renders nothing inside `mainColumn`; its children
          land in Topbar's actions slot at the top of the window. */}
      <TopbarActionsPortal>
        <RecBadge
          recording={state.context.isRecording}
          elapsedSeconds={pageElapsedSeconds}
        />
        {/* 暂停: stops the active recording (no-op when not recording).
            design-reference/page-live.jsx places this between REC and
            结束面试. With the click-to-toggle voice button this is a
            redundant secondary stop affordance; in text mode it simply
            disables. */}
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => { void handleVoiceStop(); }}
          disabled={!state.context.isRecording}
          aria-label="暂停录音"
        >
          <Pause size={13} />
          暂停
        </button>
        <button
          type="button"
          className="btn btn-danger-soft btn-sm"
          onClick={() => setEndConfirmOpen(true)}
          disabled={state.matches("ended") || state.matches("idle")}
        >
          结束面试
        </button>
      </TopbarActionsPortal>

      <SessionMetaStrip
        jobTitle={sessionMeta.jobTitle}
        personaName={personaName}
        styleLabel={styleLabel}
        currentTurn={progressTurn}
        totalTurns={sessionMeta.totalTurns}
      />

      {/* design-reference/page-live.jsx: no full-width "轮到你作答"
          green status banner — the my-response card header already
          carries the active-state cue. Keep error surfacing only. */}
      {state.context.error ? (
        <StatusBar label={statusLabel} error={state.context.error} />
      ) : null}

      <section
        className="ds-card"
        style={{
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minHeight: 260,
        }}
      >
        {state.context.currentQuestion ? (
          <>
            {/* design-reference/page-live.jsx — header row with AI
                avatar + persona name + meta line on the left, direction
                tag on the right. Mirrors the live mockup. */}
            <div
              className="row between"
              style={{ gap: 12, alignItems: "flex-start" }}
            >
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <div
                  aria-hidden="true"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: "var(--ink-900)",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  AI
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    面试官 {personaName}
                  </div>
                  <div
                    className="muted mono"
                    style={{ fontSize: 10.5 }}
                  >
                    刚刚 · 问题 {state.context.currentQuestion.turn_index + 1}
                    {sessionMeta.primaryDirection
                      ? ` · ${
                          DIRECTION_LABEL_ZH[sessionMeta.primaryDirection] ??
                          sessionMeta.primaryDirection
                        }`
                      : null}
                  </div>
                </div>
              </div>
              <div
                className="row"
                style={{ gap: 6, alignItems: "center", flexShrink: 0 }}
              >
                {sessionMeta.primaryDirection ? (
                  <span
                    className="tag tag-line"
                    data-testid="question-direction-tag"
                  >
                    {DIRECTION_LABEL_ZH[sessionMeta.primaryDirection] ??
                      sessionMeta.primaryDirection}
                  </span>
                ) : null}
                {/* 重听: replays the TTS for the current question text. The
                    auto-speak useEffect runs once on turn change; this lets
                    users explicitly hear it again after that initial playback. */}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  title="重听问题"
                  aria-label="重听问题"
                  onClick={() => {
                    if (state.context.currentQuestion?.question) {
                      void speakInterviewerLine(state.context.currentQuestion.question, sessionMeta.style);
                    }
                  }}
                  style={{ padding: "4px 8px" }}
                >
                  <Volume2 size={13} />
                </button>
                {/* 下一题: skip the current turn. We don't yet wire a
                    server-side skip event, so the button surfaces the
                    affordance but stays disabled until the current
                    answer flow completes. */}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  title="跳过本题(暂未启用)"
                  disabled
                  style={{ padding: "4px 8px" }}
                >
                  下一题
                  <ChevronRightIcon size={13} />
                </button>
              </div>
            </div>
            <div
              className="h-serif"
              style={{
                fontSize: 26,
                lineHeight: 1.35,
                letterSpacing: "-0.01em",
                color: "var(--ink-900)",
                fontWeight: 400,
                margin: "4px 0 0",
              }}
            >
              {state.context.currentQuestion.question}
            </div>
            <FollowupHintChips
              hints={state.context.currentQuestion.followup_hints}
            />
          </>
        ) : (
          <div style={{ color: "var(--ink-500)", fontSize: 14 }}>
            {state.matches("connecting") || state.matches("ready") ? (
              <span>
                <Loader2 size={14} className="spin" style={{ verticalAlign: -2, marginRight: 6 }} />
                面试官正在准备第一个问题...
              </span>
            ) : (
              "等待服务端下发问题"
            )}
          </div>
        )}

        {/* design-reference/page-live.jsx — AI 参考回答 lives INSIDE the
            question card as a collapsed footer right under the question
            text. Reveal happens on click (per-turn state via resetKey).
            Previously this sat OUTSIDE the card under the response area,
            which made it easy to miss. */}
        {state.context.currentQuestion ? (
          <ReferencePanel
            reference={state.context.referenceAnswer}
            resetKey={state.context.currentTurnIndex}
            streamingText={currentTurnStreamingText ?? undefined}
          />
        ) : null}
      </section>

      {/* V32.M1.1.X-followup — design-reference/page-live.jsx splits the
          question and the response into TWO cards. Previously they
          shared a single `<section>` separated by a 1px divider; now
          the my-response card is its own card-pad section so the
          page reads as a structured turn-pair rather than one mega-card. */}
      {/* 2026-05-16:去掉 ds-card 边框,跟问题卡之间用 gap 间距区分而非两层卡片包裹 */}
      <section
        data-testid="my-response-card"
        style={{
          padding: "22px 4px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          className="row"
          style={{
            gap: 10,
            alignItems: "center",
          }}
          data-testid="my-response-header"
        >
          <div
            className="avatar"
            style={{
              background: "var(--brand-soft)",
              color: "var(--brand-ink)",
            }}
            aria-hidden="true"
          >
            W
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>我的回答</div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              {state.context.isRecording
                ? "正在录音 · 实时转写中"
                : isUserAnswering
                  ? inputMode === "voice"
                    ? "点击「开始录音」开始,再次点击停止"
                    : "在下方输入你的回答"
                  : "等待问题加载"}
            </div>
          </div>
        </div>

        <ModeToggle
          mode={inputMode}
          disabled={!isUserAnswering || state.context.isRecording}
          voiceDisabled={asrAvailable === false}
          onChange={(next) => {
            if (next === inputMode) return;
            if (state.context.isRecording) { void handleVoiceStop(); }
            setInputMode(next);
            setVoiceError(null);
          }}
        />

        {inputMode === "voice" ? (
          <>
            <div className="row" style={{ gap: 14, alignItems: "center" }}>
              <VoiceControl
                isRecording={state.context.isRecording}
                disabled={!isUserAnswering}
                partialTranscript={state.context.partialTranscript}
                onStart={() => {
                  void handleVoiceStart();
                }}
                onStop={() => { void handleVoiceStop(); }}
              />
              <WaveBars active={state.context.isRecording} />
            </div>
            <LiveCaption
              partialText={state.context.partialTranscript}
              finalText={state.context.finalTranscript}
              isCapturing={state.context.isRecording}
            />
            {voiceError ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--warn)",
                  padding: "8px 10px",
                  borderRadius: "var(--r-sm)",
                  background: "var(--warn-softer)",
                  border: "1px solid var(--warn)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <span>{voiceError.message}</span>
                {voiceError.kind === "mic_denied" ? (
                  <button
                    type="button"
                    onClick={() => {
                      // §A0 永久排除 Tauri: invoke("open_system_url") 路径已废弃。
                      // 暂时 no-op — 用户按提示文字手动打开"系统设置 → 隐私与安全性 → 麦克风"。
                      // TODO M5: 新增 Bridge 方法 system.openUrl(url) (Swift NSWorkspace.shared.open)
                      // 让按钮可一键打开;或改用 <a href="x-apple.systempreferences:..."> 锚点 +
                      // WKWebView 的 decidePolicyFor 在 Swift 端拦截转 NSWorkspace.open。
                    }}
                    style={{
                      alignSelf: "flex-start",
                      padding: "4px 10px",
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--warn)",
                      background: "var(--bg-elev)",
                      color: "var(--warn)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    打开系统设置
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <textarea
            value={state.context.draftAnswer}
            onChange={(e) => send({ type: "UPDATE_ANSWER", value: e.target.value })}
            placeholder="在这里输入你的回答..."
            disabled={!isUserAnswering}
            style={{
              width: "100%",
              minHeight: 140,
              padding: 14,
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line)",
              background: isUserAnswering ? "var(--bg-elev)" : "var(--bg-sunken)",
              color: "var(--ink-900)",
              fontFamily: "var(--f-sans)",
              fontSize: 14,
              lineHeight: 1.6,
              resize: "vertical",
            }}
          />
        )}

        {isUserAnswering ? <TurnStatRow stats={turnStats} /> : null}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              !isUserAnswering ||
              state.context.isRecording ||
              state.context.draftAnswer.trim().length === 0
            }
            style={{
              padding: "10px 20px",
              borderRadius: "var(--r-md)",
              border: "none",
              background:
                isUserAnswering &&
                !state.context.isRecording &&
                state.context.draftAnswer.trim().length > 0
                  ? "var(--brand)"
                  : "var(--ink-200)",
              color: "white",
              fontSize: 13.5,
              fontWeight: 500,
              cursor: isUserAnswering && !state.context.isRecording ? "pointer" : "not-allowed",
            }}
          >
            提交回答
          </button>
          <button
            type="button"
            onClick={() => setEndConfirmOpen(true)}
            disabled={state.matches("ended") || state.matches("idle")}
            style={{
              padding: "10px 18px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line)",
              background: "var(--bg-elev)",
              color: "var(--ink-900)",
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            提前结束
          </button>
        </div>
      </section>

      {/* V32.M1.1.X-followup — ReferencePanel relocated INSIDE the
          question card (above), per design-reference/page-live.jsx.
          The previous out-of-card render is removed. */}

      {/*
        Per-turn assessment summary intentionally suppressed in the live
        view: showing strengths/weaknesses immediately after each answer
        breaks the user's rhythm into the next question. The data is
        still pushed to context (SERVER_ASSESSED) so it can roll up into
        the final report; the live UI just doesn't render it. See the
        post-interview ReportPage for the consolidated review.
      */}

      <RecentRounds rounds={pastRounds} />
    </div>
  );

  const endConfirm = (
    <EndConfirmDialog
      open={endConfirmOpen}
      onCancel={() => setEndConfirmOpen(false)}
      onConfirm={handleEndSession}
    />
  );

  // V32.M1.1.X-followup — design-reference/page-live.jsx right rail has
  // 4 cards stacked: 本场节奏 → 提问方向进度 → AI 实时观察 → kbd hints.
  // The first two are net-new; the latter two were already wired via
  // LiveObservationCard + footerSlot. Build the rows defensively so a
  // session with no directions (legacy v3.1 row) still renders cleanly.
  const paceRateLabel: string = state.context.currentQuestion
    ? RATE_LABEL_ZH[turnStats.rateLabel]
    : "—";
  const paceRateTone: PaceTone =
    turnStats.rateLabel === "slow"
      ? "warn"
      : turnStats.rateLabel === "moderate"
        ? "good"
        : turnStats.rateLabel === "fast"
          ? "warn"
          : "muted";
  const directionRows: DirectionRow[] = (() => {
    const ids = sessionMeta.directions;
    if (ids.length === 0) return [];
    const perBudget = Math.max(1, Math.ceil(sessionMeta.totalTurns / ids.length));
    // Naive projection: charge progress against the first direction
    // (active) until its budget is full, then move on. Without a true
    // per-direction map we'd rather show plausible motion than fake
    // exact mapping.
    const turnsAnswered = state.context.currentTurnIndex; // 0-based
    return ids.map((id, idx) => {
      const consumedSoFar = idx * perBudget;
      const doneRaw = turnsAnswered - consumedSoFar;
      const done = Math.max(0, Math.min(perBudget, doneRaw));
      const isActive = doneRaw > 0 && done < perBudget;
      const isFirstUnstarted = idx === 0 && turnsAnswered === 0;
      return {
        id,
        label: DIRECTION_LABEL_ZH[id] ?? id,
        done,
        total: perBudget,
        active: isActive || isFirstUnstarted,
      };
    });
  })();

  const railTopSlot = (
    <>
      <SessionPaceCard
        elapsedSeconds={pageElapsedSeconds}
        durationMinutes={sessionMeta.durationMinutes}
        rateLabel={paceRateLabel}
        rateTone={paceRateTone}
        answeredTurns={progressTurn}
        totalTurns={sessionMeta.totalTurns}
      />
      {directionRows.length > 0 ? (
        <DirectionProgressCard rows={directionRows} />
      ) : null}
    </>
  );

  if (!showObserverPanel) {
    return (
      <>
        {mainColumn}
        {endConfirm}
      </>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: observerCollapsed ? "1fr 36px" : "minmax(0, 1fr) 280px",
        gap: 0,
        alignItems: "stretch",
        minHeight: "calc(100vh - 32px)",
      }}
    >
      <div style={{ minWidth: 0, paddingRight: 20 }}>{mainColumn}</div>
      <ObserverPanel
        observations={state.context.observations}
        collapsed={observerCollapsed}
        onToggle={() => setObserverCollapsed((v) => !v)}
        liveObservation={state.context.currentQuestion?.live_observation ?? null}
        showLiveObservationCard={state.context.currentQuestion !== null}
        topSlot={!observerCollapsed ? railTopSlot : null}
        footerSlot={!observerCollapsed ? <KeyboardShortcutHelper /> : null}
      />
      {endConfirm}
    </div>
  );
}

function ModeToggle({
  mode,
  disabled,
  voiceDisabled,
  onChange,
}: {
  mode: InputMode;
  disabled: boolean;
  voiceDisabled: boolean;
  onChange: (next: InputMode) => void;
}): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="回答方式"
      style={{
        display: "inline-flex",
        alignSelf: "flex-start",
        padding: 3,
        gap: 2,
        borderRadius: "var(--r-pill)",
        background: "var(--bg-sunken)",
        border: "1px solid var(--line)",
      }}
    >
      {(["voice", "text"] as const).map((value) => {
        const selected = mode === value;
        const isVoice = value === "voice";
        const effectiveDisabled =
          (disabled && !selected) || (isVoice && voiceDisabled && !selected);
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={effectiveDisabled}
            onClick={() => onChange(value)}
            style={{
              padding: "6px 14px",
              borderRadius: "var(--r-pill)",
              border: "none",
              background: selected ? "var(--bg-elev)" : "transparent",
              color: selected ? "var(--ink-900)" : "var(--ink-500)",
              fontSize: 12.5,
              fontWeight: selected ? 500 : 400,
              cursor: effectiveDisabled ? "not-allowed" : "pointer",
              boxShadow: selected ? "var(--shadow-xs)" : "none",
            }}
          >
            {value === "voice" ? "语音" : "文字"}
          </button>
        );
      })}
    </div>
  );
}

function StatusBar({ label, error }: { label: string; error: string | null }): JSX.Element {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: "var(--r-md)",
        background: error ? "var(--warn-softer)" : "var(--brand-softer)",
        color: error ? "var(--warn)" : "var(--brand-ink)",
        border: `1px solid ${error ? "var(--warn)" : "var(--brand)"}`,
        fontSize: 13,
        display: "flex",
        gap: 10,
      }}
    >
      <span>{label}</span>
      {error ? <span>· {error}</span> : null}
    </div>
  );
}

const RATE_LABEL_ZH: Record<"slow" | "moderate" | "fast", string> = {
  slow: "偏慢",
  moderate: "适中",
  fast: "偏快",
};

function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function TurnStatRow({
  stats,
}: {
  stats: { elapsedSeconds: number; rateLabel: "slow" | "moderate" | "fast"; fillerCount: number };
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        fontSize: 12,
        color: "var(--ink-500)",
        paddingTop: 4,
      }}
    >
      <span>⏱ 本题用时 {formatMmSs(stats.elapsedSeconds)}</span>
      <span>语速 {RATE_LABEL_ZH[stats.rateLabel]}</span>
      <span>填充词 {stats.fillerCount} 次</span>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        minHeight: 280,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}

// Statuses that mean the interview is unfinished and can be resumed.
// Statuses NOT in this list (ended / exited_early / report_generating /
// report_ready / failed) are terminal and shouldn't show a "继续" CTA.
const RESUMABLE_STATUSES: ReadonlySet<InterviewSessionStatus> = new Set<InterviewSessionStatus>([
  "created",
  "session_started",
  "turn_recording",
  "turn_transcribing",
  "turn_evaluating",
  "turn_compressing",
  "next_question_ready",
  "paused",
]);

function NoSessionPlaceholder(): JSX.Element {
  const navigate = useNavigate();
  const [resumableId, setResumableId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await getSessionList({ page: 1, page_size: 5 });
        if (cancelled) return;
        // Only consider THE most recent session — if it's resumable AND was
        // created within the last hour, offer to continue. Otherwise treat
        // as "no active session" (older bootstrap_failed / abandoned attempts
        // are dead, surfacing them is user-hostile).
        const newest = [...list.items].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        )[0];
        const ONE_HOUR_MS = 60 * 60 * 1000;
        const ageMs = newest ? Date.now() - new Date(newest.created_at).getTime() : Infinity;
        if (newest && RESUMABLE_STATUSES.has(newest.status) && ageMs <= ONE_HOUR_MS) {
          setResumableId(newest.id);
        } else {
          setResumableId(null);
        }
      } catch {
        /* soft-fail: just show no-resume state */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: 480,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      <img
        src="/no-session.png"
        alt=""
        width={200}
        height={200}
        style={{ opacity: 0.85 }}
      />
      {!loaded ? (
        <p style={{ color: "var(--ink-400)", fontSize: 13 }}>加载中...</p>
      ) : resumableId ? (
        <>
          <p style={{ color: "var(--ink-700)", fontSize: 14, margin: 0 }}>
            上一场面试还没结束,要继续吗?
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="btn btn-brand"
              onClick={() => navigate(`/interview/${resumableId}`)}
            >
              继续上一场面试
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => navigate("/config")}
            >
              开新面试
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ color: "var(--ink-500)", fontSize: 14, margin: 0 }}>
            还没有进行中的面试,先去「面试配置」开一场。
          </p>
          <button
            type="button"
            className="btn btn-brand"
            onClick={() => navigate("/config")}
          >
            去面试配置
          </button>
        </>
      )}
    </div>
  );
}
