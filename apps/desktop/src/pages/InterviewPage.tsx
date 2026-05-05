import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Pause, Volume2, ChevronRight as ChevronRightIcon } from "lucide-react";
import type {
  ClientTextEvent,
  ServerEvent,
} from "@eatit/shared-types";
import { API_BASE_URL } from "@/api/client";
import { getAppSetting } from "@/api/appSettings";
import { loadLLMConfig, type LLMConfig } from "@/lib/llm/config";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { pushToast } from "@/stores/toast-store";
import {
  requestMicPermission,
} from "@/lib/mic";
import { speakInterviewerLine, stopInterviewerLine } from "@/lib/tts";
import { useGlobalKeymap } from "@/lib/useGlobalKeymap";
import { EndConfirmDialog } from "@/components/EndConfirmDialog";
import { getSession } from "@/api/sessions";
import { getParseResult } from "@/api/assets";
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
import {
  createVolcStreamAsr,
  type VolcStreamAsrController,
} from "@/core/asr/volcStreamAsr";

const OBSERVER_BREAKPOINT_PX = 1100;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BACKOFF_MS = 1000;

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

// Rough turns/duration heuristic — backend's FrameworkAgent doesn't
// surface the planned turn count separately, so we approximate from the
// duration. 3 minutes/turn matches the PRD §6.3.4 pacing guidance.
function estimateTotalTurns(durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 5;
  return Math.max(3, Math.round(durationMinutes / 3));
}

type InputMode = "voice" | "text";

function getViewportWidth(): number {
  if (typeof window === "undefined") return OBSERVER_BREAKPOINT_PX;
  return window.innerWidth;
}

function toWs(baseUrl: string): string {
  return baseUrl.startsWith("https://")
    ? baseUrl.replace("https://", "wss://")
    : baseUrl.replace("http://", "ws://");
}

export function InterviewPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [state, send] = useMachine(interviewMachine);
  const socketRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const controllerRef = useRef<VolcStreamAsrController | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const setConnectivity = useConnectivityStore((s) => s.set);
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

  // The WebSocket effect reads `state` inside its onclose handler to decide
  // whether to reconnect after the session ended normally. Putting `state`
  // on the effect's dep list would tear down + rebuild the socket on every
  // XState transition (including incoming question / assessment events),
  // which is why we saw three WS connections open-then-close in the backend
  // log. Stash the latest state on a ref instead so the effect reads fresh
  // values without re-running.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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

  // Speak each new interviewer line once, keyed by turn_index so a stale
  // re-render of the same question doesn't replay. `stopInterviewerLine`
  // on cleanup handles navigation away / component unmount / user starting
  // to record (handleVoiceStart calls it explicitly too, belt-and-braces).
  const currentQuestionText = state.context.currentQuestion?.question;
  const currentTurnIndex = state.context.currentQuestion?.turn_index;
  useEffect(() => {
    if (!ttsEnabled) return;
    if (!currentQuestionText) return;
    speakInterviewerLine(currentQuestionText);
    return () => {
      stopInterviewerLine();
    };
  }, [ttsEnabled, currentQuestionText, currentTurnIndex]);

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

  // Pre-warm the OS mic permission as soon as the page mounts, so the
  // first "按住说话" click doesn't sit on a TCC prompt mid-answer.
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

  useEffect(() => {
    if (!sessionId || configLoading) return;
    if (!llmConfig) {
      send({ type: "WS_ERROR", message: "尚未配置 LLM,请先前往「设置」。" });
      return;
    }

    send({ type: "CONNECT", sessionId });

    let closedByCleanup = false;
    const url = `${toWs(API_BASE_URL)}/ws/sessions/${sessionId}?token=mock`;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setConnectivity("online");
      const initFrame: ClientTextEvent = {
        event: "client.session.init",
        config: {
          provider: llmConfig.provider,
          api_key: llmConfig.api_key,
          model: llmConfig.model,
          base_url: llmConfig.base_url ?? null,
        },
      };
      socket.send(JSON.stringify(initFrame));
      send({ type: "WS_OPEN" });
    };

    socket.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as ServerEvent;
        if (parsed.event === "server.question.generated") {
          send({ type: "SERVER_QUESTION", payload: parsed.payload });
        } else if (parsed.event === "server.turn.assessed") {
          send({ type: "SERVER_ASSESSED", payload: parsed.payload });
        } else if (parsed.event === "server.coach.observation") {
          send({ type: "SERVER_OBSERVATION", payload: parsed.payload });
        } else if (parsed.event === "server.reference.ready") {
          send({ type: "SERVER_REFERENCE", payload: parsed.payload });
        } else if (parsed.event === "server.error") {
          send({ type: "WS_ERROR", message: `${parsed.code}: ${parsed.message}` });
        }
      } catch (err) {
        send({
          type: "WS_ERROR",
          message: err instanceof Error ? err.message : "无法解析服务器消息",
        });
      }
    };

    socket.onerror = () => {
      // onerror fires before onclose; defer user-facing messaging to the
      // close handler so we only surface one narrative per outage.
    };

    socket.onclose = (event) => {
      socketRef.current = null;
      if (closedByCleanup) return;
      if (event.code === 1000 || stateRef.current.matches("ended")) {
        setConnectivity("online");
        return;
      }
      const nextAttempt = reconnectAttemptsRef.current + 1;
      if (nextAttempt > MAX_RECONNECT_ATTEMPTS) {
        setConnectivity(
          "offline",
          `已尝试重连 ${MAX_RECONNECT_ATTEMPTS} 次仍未成功`,
        );
        pushToast({
          tone: "error",
          title: "WebSocket 连接中断",
          message: `已尝试重连 ${MAX_RECONNECT_ATTEMPTS} 次仍未成功,请稍后刷新页面重试。`,
          ttlMs: 0,
        });
        send({ type: "WS_ERROR", message: "连接中断,请刷新页面。" });
        return;
      }
      reconnectAttemptsRef.current = nextAttempt;
      setConnectivity(
        "reconnecting",
        `连接断开,正在第 ${nextAttempt} / ${MAX_RECONNECT_ATTEMPTS} 次重连`,
      );
      reconnectTimerRef.current = window.setTimeout(() => {
        setReconnectNonce((n) => n + 1);
      }, RECONNECT_BACKOFF_MS * nextAttempt);
    };

    return () => {
      closedByCleanup = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ event: "client.session.end" }));
        }
      } catch {
        /* socket already closed */
      }
      socket.close(1000, "client cleanup");
      socketRef.current = null;
    };
  }, [sessionId, configLoading, llmConfig, send, reconnectNonce, setConnectivity]);

  useEffect(() => {
    if (state.matches("ended") && sessionId) {
      navigate(`/report/${sessionId}`, { replace: true });
    }
  }, [state, sessionId, navigate]);

  const sendClientFrame = useCallback((frame: ClientTextEvent) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(frame));
    }
  }, []);

  const handleVoiceStart = useCallback(async () => {
    if (!state.context.currentQuestion) return;
    if (state.context.isRecording) return;
    // Cut the interviewer mid-sentence so the user's own voice isn't
    // mixed with the playback through the mic feedback loop.
    stopInterviewerLine();
    setVoiceError(null);

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
    sendClientFrame({
      event: "client.turn.end",
      turn_index: question.turn_index,
      question: question.question,
      answer,
    });
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
        // V32.M1.1.X-followup — totalTurns must match the backend's
        // actual budget (sum of `direction_framework.stages[*]`
        // .question_budget). Otherwise the progress strip lies (10/10
        // while the FrameworkAgent planned 12). The backend's
        // `_total_question_budget` guard ends the interview at this
        // sum, so frontend + backend stay in sync.
        // Fall back to the duration estimate when the framework hasn't
        // landed yet (first GET race) or stages are missing.
        const stages =
          detail.direction_framework &&
          Array.isArray(detail.direction_framework.stages)
            ? detail.direction_framework.stages
            : [];
        const frameworkBudget = stages.reduce<number>((sum, stage) => {
          const budget = (stage as { question_budget?: unknown })
            .question_budget;
          return sum + (typeof budget === "number" && budget > 0 ? budget : 0);
        }, 0);
        const totalTurns =
          frameworkBudget > 0 ? frameworkBudget : estimateTotalTurns(duration);
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
        // Chain a parse-result fetch so the strip can show
        // "{company} · {role}" exactly like design-reference. 404 here
        // is fine (parse not run yet, or stale id) — we keep the
        // placeholder.
        if (!detail.candidate_asset_id) return;
        getParseResult(detail.candidate_asset_id)
          .then((parse) => {
            if (cancelled) return;
            const company = parse.payload.jd_company_name?.trim() ?? "";
            const role = parse.payload.jd_role_title?.trim() ?? "";
            const composed =
              company && role
                ? `${company} · ${role}`
                : role || company || null;
            if (composed) {
              setSessionMeta((prev) => ({ ...prev, jobTitle: composed }));
            }
          })
          .catch(() => {
            /* parse missing — keep the placeholder */
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

  const handleReplay = useCallback(() => {
    if (!ttsEnabled) return;
    if (!currentQuestionText) return;
    speakInterviewerLine(currentQuestionText);
  }, [ttsEnabled, currentQuestionText]);

  const handleEndSession = useCallback(() => {
    setEndConfirmOpen(false);
    sendClientFrame({ event: "client.session.end" });
    send({ type: "END_SESSION" });
  }, [sendClientFrame, send]);

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
    return (
      <Center>
        <p style={{ color: "var(--ink-500)" }}>缺少 session_id,请从「面试配置」开始。</p>
      </Center>
    );
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
            结束面试. For hold-to-talk mode the button mostly acts as a
            quick-release affordance; in text mode it simply disables. */}
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
                      speakInterviewerLine(state.context.currentQuestion.question);
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
          />
        ) : null}
      </section>

      {/* V32.M1.1.X-followup — design-reference/page-live.jsx splits the
          question and the response into TWO cards. Previously they
          shared a single `<section>` separated by a 1px divider; now
          the my-response card is its own card-pad section so the
          page reads as a structured turn-pair rather than one mega-card. */}
      <section
        className="ds-card"
        data-testid="my-response-card"
        style={{
          padding: 22,
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
                    ? "按下「按住说话」开始"
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
