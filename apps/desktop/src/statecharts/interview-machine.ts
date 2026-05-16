import { assign, createMachine } from "xstate";

export type GeneratedQuestion = {
  turn_index: number;
  question: string;
  intent: string;
  expected_depth: "surface" | "tactical" | "strategic";
  followup_hint: string | null;
  should_end: boolean;
  // F-319 v3.2+ chip list. Either empty (degraded; render no row) or
  // 2-3 ≤8-char strings (validated upstream by the Pydantic
  // `field_validator` in `interviewer/schemas.py`). Optional in the
  // type so v3.1 WS payloads — which omit the key — still parse.
  followup_hints?: string[];
  // F-309 v3.2+ — per-turn observation surfaced in LiveObservationCard
  // (right aside). Null on turn 0 by contract; ≤30 chars otherwise.
  // When null/missing, the page falls back to the latest entry from
  // `observations[]` (server.coach.observation legacy track, A13).
  live_observation?: string | null;
};

export type TurnAssessmentSummary = {
  turn_index: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
};

export type ObserverTone = "support" | "alert" | "pivot";

export type ObserverEntry = {
  id: string;
  turn_index: number;
  observation: string;
  tone: ObserverTone;
  actionable: boolean;
  received_at: string;
};

export type ReferenceAnswerHint = {
  turn_index: number;
  answer_outline: string[];
  ideal_answer: string;
  key_evaluation_points: string[];
  common_pitfalls: string[];
};

export type InterviewContext = {
  sessionId: string | null;
  currentTurnIndex: number;
  currentQuestion: GeneratedQuestion | null;
  draftAnswer: string;
  lastAssessment: TurnAssessmentSummary | null;
  observations: ObserverEntry[];
  error: string | null;
  isRecording: boolean;
  partialTranscript: string;
  finalTranscript: string;
  // Reference answer for the current turn. ReferenceAgent runs async after
  // turn.end so this lags the question by a few seconds; resets to null on
  // every new question. The payload carries its own turn_index so a late
  // arrival from the previous turn can be filtered out.
  referenceAnswer: ReferenceAnswerHint | null;
};

export type InterviewEvent =
  | { type: "CONNECT"; sessionId: string }
  | { type: "WS_OPEN" }
  | { type: "SERVER_QUESTION"; payload: GeneratedQuestion }
  | { type: "UPDATE_ANSWER"; value: string }
  | { type: "SUBMIT_ANSWER" }
  | { type: "SERVER_ASSESSED"; payload: TurnAssessmentSummary }
  | {
      type: "SERVER_OBSERVATION";
      payload: {
        turn_index: number;
        observation: string;
        tone: ObserverTone;
        actionable: boolean;
      };
    }
  | { type: "SERVER_REFERENCE"; payload: ReferenceAnswerHint }
  | { type: "AUDIO_START" }
  | { type: "AUDIO_STOP" }
  | { type: "TRANSCRIPT_PARTIAL"; text: string }
  | { type: "TRANSCRIPT_FINAL"; text: string }
  | { type: "END_SESSION" }
  | { type: "WS_ERROR"; message: string }
  | { type: "REFERENCE_STARTED"; turn_index: number };

function appendObservationToContext(
  context: InterviewContext,
  payload: {
    turn_index: number;
    observation: string;
    tone: ObserverTone;
    actionable: boolean;
  },
): ObserverEntry[] {
  const entry: ObserverEntry = {
    id: `${payload.turn_index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    turn_index: payload.turn_index,
    observation: payload.observation,
    tone: payload.tone,
    actionable: payload.actionable,
    received_at: new Date().toISOString(),
  };
  // Newest first so the panel doesn't scroll the user's active card out of view.
  return [entry, ...context.observations];
}

const appendObservation = assign<InterviewContext, InterviewEvent>({
  observations: ({ context, event }) => {
    if (event.type !== "SERVER_OBSERVATION") return context.observations;
    return appendObservationToContext(context, event.payload);
  },
});

/**
 * Lifecycle:
 *   idle -> connecting (WS opens, session.init goes out)
 *        -> ready      (waiting for first question from server)
 *        -> warming    (Q0: question set, waiting for REFERENCE_STARTED)
 *        -> user_answering (question delivered, user typing)
 *        -> scoring    (turn.end sent, waiting for assessment)
 *        -> next_question (waiting for the next server.question.generated)
 *        -> ended      (user or server ends; the page navigates to /report)
 *
 * Events originate either from WS messages (SERVER_*, WS_OPEN) or from UI
 * handlers (CONNECT, UPDATE_ANSWER, SUBMIT_ANSWER, END_SESSION). The
 * machine holds no WS reference; the React component owns the socket and
 * translates events in both directions.
 */
export const interviewMachine = createMachine({
  id: "interview",
  types: {} as {
    context: InterviewContext;
    events: InterviewEvent;
  },
  initial: "idle",
  context: {
    sessionId: null,
    currentTurnIndex: 0,
    currentQuestion: null,
    draftAnswer: "",
    lastAssessment: null,
    observations: [],
    error: null,
    isRecording: false,
    partialTranscript: "",
    finalTranscript: "",
    referenceAnswer: null,
  },
  on: {
    SERVER_OBSERVATION: {
      actions: appendObservation,
    },
    SERVER_REFERENCE: {
      actions: assign({
        referenceAnswer: ({ context, event, self }) => {
          if (event.type !== "SERVER_REFERENCE") return context.referenceAnswer;
          // Drop late arrivals that don't match the active turn so a stale
          // reference doesn't shadow the new question's hint.
          if (event.payload.turn_index !== context.currentTurnIndex) {
            return context.referenceAnswer;
          }
          // M9.1: freeze the reference snapshot only while the user is **actively**
          // answering (typing OR recording). 2026-05-15 修正:之前一进 user_answering
          // 就 freeze 太早,问题刚出来用户还在读题时也被 freeze,导致初始流式根本
          // 进不来 UI。改为:进 user_answering 但 draftAnswer 空且未录音时仍然允许
          // stream 更新;用户开始动作(打字或录音)后才 freeze。
          const snapshot = self.getSnapshot();
          const hasStartedAnswering =
            snapshot.context.draftAnswer.length > 0 ||
            snapshot.context.isRecording ||
            snapshot.context.partialTranscript.length > 0;
          if (snapshot.matches("user_answering") && hasStartedAnswering) {
            return context.referenceAnswer;
          }
          return event.payload;
        },
      }),
    },
  },
  states: {
    idle: {
      on: {
        CONNECT: {
          target: "connecting",
          actions: assign({
            sessionId: ({ event }) => event.sessionId,
            error: null,
          }),
        },
      },
    },
    connecting: {
      on: {
        WS_OPEN: "ready",
        WS_ERROR: {
          target: "idle",
          actions: assign({ error: ({ event }) => event.message }),
        },
      },
    },
    ready: {
      on: {
        SERVER_QUESTION: {
          target: "warming",
          actions: assign({
            currentQuestion: ({ event }) => event.payload,
            currentTurnIndex: ({ event }) => event.payload.turn_index,
            draftAnswer: "",
            partialTranscript: "",
            finalTranscript: "",
            isRecording: false,
            referenceAnswer: null,
          }),
        },
        END_SESSION: "ended",
        WS_ERROR: {
          actions: assign({ error: ({ event }) => event.message }),
        },
      },
    },
    warming: {
      on: {
        REFERENCE_STARTED: {
          guard: ({ context, event }) =>
            event.type === "REFERENCE_STARTED" &&
            event.turn_index === context.currentTurnIndex,
          target: "user_answering",
        },
        END_SESSION: { target: "ended" },
        WS_ERROR: {
          target: "user_answering",
          actions: assign({
            error: ({ event }) =>
              event.type === "WS_ERROR" ? event.message : null,
          }),
        },
      },
    },
    user_answering: {
      on: {
        UPDATE_ANSWER: {
          actions: assign({ draftAnswer: ({ event }) => event.value }),
        },
        SUBMIT_ANSWER: {
          target: "scoring",
          guard: ({ context }) => context.draftAnswer.trim().length > 0,
        },
        AUDIO_START: {
          actions: assign({
            isRecording: true,
            partialTranscript: "",
            finalTranscript: "",
          }),
        },
        AUDIO_STOP: {
          actions: assign({ isRecording: false }),
        },
        TRANSCRIPT_PARTIAL: {
          actions: assign({ partialTranscript: ({ event }) => event.text }),
        },
        TRANSCRIPT_FINAL: {
          // The final transcript is the authoritative answer text for this
          // turn — it replaces whatever draftAnswer currently holds.
          actions: assign({
            finalTranscript: ({ event }) => event.text,
            draftAnswer: ({ event }) => event.text,
            partialTranscript: "",
          }),
        },
        // ASR / WebSocket failures during recording (e.g. asr.credentials-missing
        // when volc-asr-credentials hasn't been saved to Keychain) used to be
        // dropped here — the machine had no WS_ERROR handler in user_answering,
        // so the StatusBar stayed silent while isRecording stuck on true and
        // "正在聆听..." dangled forever. Surface the message and roll back
        // the recording-state assignments AUDIO_START set, so the user sees
        // both the error and a clean idle UI.
        WS_ERROR: {
          actions: assign({
            error: ({ event }) => event.message,
            isRecording: false,
            partialTranscript: "",
          }),
        },
        END_SESSION: "ended",
      },
    },
    scoring: {
      on: {
        SERVER_ASSESSED: {
          target: "next_question",
          actions: assign({
            lastAssessment: ({ event }) => event.payload,
          }),
        },
        SERVER_QUESTION: {
          target: "user_answering",
          actions: assign({
            currentQuestion: ({ event }) => event.payload,
            currentTurnIndex: ({ event }) => event.payload.turn_index,
            draftAnswer: "",
            partialTranscript: "",
            finalTranscript: "",
            isRecording: false,
            referenceAnswer: null,
          }),
        },
        END_SESSION: "ended",
        WS_ERROR: {
          target: "user_answering",
          actions: assign({ error: ({ event }) => event.message }),
        },
      },
    },
    next_question: {
      on: {
        SERVER_QUESTION: [
          {
            target: "ended",
            guard: ({ event }) => event.payload.should_end,
            actions: assign({
              currentQuestion: ({ event }) => event.payload,
            }),
          },
          {
            target: "user_answering",
            actions: assign({
              currentQuestion: ({ event }) => event.payload,
              currentTurnIndex: ({ event }) => event.payload.turn_index,
              draftAnswer: "",
              referenceAnswer: null,
            }),
          },
        ],
        END_SESSION: "ended",
        // L1(2026-05-14):runInterviewSession 在生成下一题阶段任何 throw 都会
        // 通过 WS_ERROR 抵达。之前这里只 assign error 不 target,导致状态机永
        // 久卡在 next_question,UI 显示「等待问题加载」死锁。
        // 现在 target 回 user_answering,用户能看到红条错误且能再次提交触发重试。
        WS_ERROR: {
          target: "user_answering",
          actions: assign({ error: ({ event }) => event.message }),
        },
      },
    },
    ended: {
      type: "final",
    },
  },
});
