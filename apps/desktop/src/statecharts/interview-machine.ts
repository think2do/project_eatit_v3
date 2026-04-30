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
  | { type: "WS_ERROR"; message: string };

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
        referenceAnswer: ({ context, event }) => {
          if (event.type !== "SERVER_REFERENCE") return context.referenceAnswer;
          // Drop late arrivals that don't match the active turn so a stale
          // reference doesn't shadow the new question's hint.
          if (event.payload.turn_index !== context.currentTurnIndex) {
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
          actions: assign({ error: ({ event }) => event.message }),
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
        WS_ERROR: {
          actions: assign({ error: ({ event }) => event.message }),
        },
      },
    },
    ended: {
      type: "final",
    },
  },
});
