import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type {
  ClientTextEvent,
  ServerEvent,
} from "@eatit/shared-types";
import { API_BASE_URL } from "@/api/client";
import { getAppSetting } from "@/api/appSettings";
import { fetchASRHealth } from "@/api/asr";
import { loadLLMConfig, type LLMConfig } from "@/lib/llm/config";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { pushToast } from "@/stores/toast-store";
import {
  createAudioRecorder,
  requestMicPermission,
  type AudioRecorderHandle,
} from "@/lib/mic";
import { speakInterviewerLine, stopInterviewerLine } from "@/lib/tts";
import { FollowupHintChips } from "@/pages/interview/FollowupHintChips";
import { LiveCaption } from "@/pages/interview/LiveCaption";
import { ObserverPanel } from "@/pages/interview/ObserverPanel";
import { ReferencePanel } from "@/pages/interview/ReferencePanel";
import { useTurnStats } from "@/pages/interview/useTurnStats";
import { VoiceControl } from "@/pages/interview/VoiceControl";
import { interviewMachine } from "@/statecharts/interview-machine";

const OBSERVER_BREAKPOINT_PX = 1100;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BACKOFF_MS = 1000;

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
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
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

  useEffect(() => {
    let mounted = true;
    fetchASRHealth()
      .then((health) => {
        if (!mounted) return;
        setAsrAvailable(Boolean(health.available));
      })
      .catch(() => {
        if (mounted) setAsrAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Pre-warm the OS mic permission as soon as the page mounts, so the
  // first "按住说话" click doesn't sit on a TCC prompt mid-answer.
  // Failures are silent: the user will see the actionable banner the
  // moment they try to record. We also reuse the resulting stream to
  // skip a second getUserMedia call inside handleVoiceStart.
  useEffect(() => {
    if (inputMode !== "voice") return;
    if (asrAvailable === false) return;
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
  }, [inputMode, asrAvailable]);

  useEffect(() => {
    // If the server can't do ASR, voice mode is unusable. Flip to text and
    // explain in a banner. Deliberately a one-way transition — the user can
    // still flip back manually once they fix the server env.
    if (asrAvailable === false && inputMode === "voice") {
      setInputMode("text");
      setVoiceError({
        kind: "other",
        message: "语音模式不可用:服务端未配置 Azure Speech。已切换到文字模式。",
      });
    }
  }, [asrAvailable, inputMode]);

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
      // First frame must be client.session.init — see phase3-constraints A2.
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
        } else if (parsed.event === "server.transcript.partial") {
          send({ type: "TRANSCRIPT_PARTIAL", text: parsed.payload.text });
        } else if (parsed.event === "server.transcript.final") {
          send({ type: "TRANSCRIPT_FINAL", text: parsed.payload.text });
        } else if (parsed.event === "server.error") {
          if (parsed.code === "asr_unavailable") {
            // Backend rejected audio.start because Azure env isn't
            // configured. Fall back to text mode so the user can still
            // answer; banner explains what happened.
            setAsrAvailable(false);
            setInputMode("text");
            setVoiceError({
              kind: "other",
              message: `语音模式不可用:${parsed.message || "服务端未配置 Azure Speech"}。已切换到文字模式。`,
            });
            send({ type: "AUDIO_STOP" });
          } else {
            send({ type: "WS_ERROR", message: `${parsed.code}: ${parsed.message}` });
          }
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
      // Graceful end (session.end or 1000) = no reconnect. Read from the
      // ref so this branch sees the latest machine state without pinning
      // the effect to the state object.
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
    // Intentionally omit `state` from the dep list — we read it via
    // `stateRef` inside onclose. Including it would re-open the WS on
    // every XState transition.
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

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.stop();
    }
    recorderRef.current = null;
  }, []);

  const handleVoiceStart = useCallback(async () => {
    const question = state.context.currentQuestion;
    if (!question) return;
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

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setVoiceError({ kind: "other", message: "WebSocket 尚未连接,无法开始录音" });
      return;
    }

    const turnIndex = question.turn_index;
    const recorder = createAudioRecorder(
      stream,
      (chunk) => {
        chunk
          .arrayBuffer()
          .then((buffer) => {
            const s = socketRef.current;
            if (s && s.readyState === WebSocket.OPEN) {
              s.send(buffer);
            }
          })
          .catch(() => {
            /* chunk arrayBuffer failure is non-fatal for the stream */
          });
      },
      undefined,
      { timesliceMs: 100 },
    );
    recorderRef.current = recorder;

    sendClientFrame({ event: "client.audio.start", turn_index: turnIndex });
    recorder.start();
    send({ type: "AUDIO_START" });
  }, [state, sendClientFrame, send]);

  const handleVoiceStop = useCallback(() => {
    const question = state.context.currentQuestion;
    if (!question) return;
    if (!state.context.isRecording) return;
    stopRecording();
    sendClientFrame({ event: "client.audio.stop", turn_index: question.turn_index });
    send({ type: "AUDIO_STOP" });
  }, [state, sendClientFrame, send, stopRecording]);

  useEffect(() => {
    return () => {
      stopRecording();
      const stream = micStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
    };
  }, [stopRecording]);

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
    send({ type: "SUBMIT_ANSWER" });
  };

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
  const mainColumn = (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="eyebrow">04 · 实时面试</div>
        <h1
          className="h-serif"
          style={{
            margin: "10px 0 2px",
            fontSize: 36,
            lineHeight: 1.1,
            fontWeight: 400,
            color: "var(--ink-900)",
          }}
        >
          AI 模拟面试官
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>
          会话 · <span className="mono">{sessionId}</span>
        </p>
      </header>

      <StatusBar label={statusLabel} error={state.context.error} />

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
            <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
              第 {state.context.currentQuestion.turn_index} 轮 ·{" "}
              {state.context.currentQuestion.expected_depth}
            </div>
            <div
              className="h-serif"
              style={{
                fontSize: 24,
                lineHeight: 1.3,
                color: "var(--ink-900)",
                fontWeight: 400,
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

        <ModeToggle
          mode={inputMode}
          disabled={!isUserAnswering || state.context.isRecording}
          voiceDisabled={asrAvailable === false}
          onChange={(next) => {
            if (next === inputMode) return;
            if (state.context.isRecording) handleVoiceStop();
            setInputMode(next);
            setVoiceError(null);
          }}
        />

        {inputMode === "voice" ? (
          <>
            <VoiceControl
              isRecording={state.context.isRecording}
              disabled={!isUserAnswering}
              partialTranscript={state.context.partialTranscript}
              onStart={() => {
                void handleVoiceStart();
              }}
              onStop={handleVoiceStop}
            />
            <LiveCaption
              finalTranscript={state.context.finalTranscript}
              partialTranscript={state.context.partialTranscript}
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
                    onClick={async () => {
                      // WKWebView silently drops `location.href = "x-apple...:"`
                      // because its navigation handler never forwards unknown
                      // schemes to LaunchServices. The Rust `open_system_url`
                      // command shells out to `/usr/bin/open`, which always
                      // honours the handler registered for the scheme.
                      try {
                        const { invoke } = await import("@tauri-apps/api/core");
                        await invoke("open_system_url", {
                          url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
                        });
                      } catch {
                        /* not running under Tauri (plain vite dev): no-op, user reads the text instead */
                      }
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
            onClick={() => {
              sendClientFrame({ event: "client.session.end" });
              send({ type: "END_SESSION" });
            }}
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

      {state.context.currentQuestion ? (
        <ReferencePanel
          reference={state.context.referenceAnswer}
          resetKey={state.context.currentTurnIndex}
        />
      ) : null}

      {/*
        Per-turn assessment summary intentionally suppressed in the live
        view: showing strengths/weaknesses immediately after each answer
        breaks the user's rhythm into the next question. The data is
        still pushed to context (SERVER_ASSESSED) so it can roll up into
        the final report; the live UI just doesn't render it. See the
        post-interview ReportPage for the consolidated review.
      */}
    </div>
  );

  if (!showObserverPanel) {
    return mainColumn;
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
      />
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
