import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { interviewMachine, type GeneratedQuestion } from "@/statecharts/interview-machine";

const MOCK_Q0: GeneratedQuestion = {
  turn_index: 0,
  question: "Tell me about yourself",
  intent: "opener",
  expected_depth: "surface",
  followup_hint: null,
  should_end: false,
};

function readyActor() {
  const a = createActor(interviewMachine);
  a.start();
  a.send({ type: "CONNECT", sessionId: "s" });
  a.send({ type: "WS_OPEN" });
  return a;
}

describe("M10.3 — warming state", () => {
  it("ready + SERVER_QUESTION → warming (currentQuestion is set)", () => {
    const actor = readyActor();
    actor.send({ type: "SERVER_QUESTION", payload: MOCK_Q0 });
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches("warming")).toBe(true);
    expect(snapshot.context.currentQuestion).toEqual(MOCK_Q0);
    expect(snapshot.context.currentTurnIndex).toBe(0);
    actor.stop();
  });

  it("warming + REFERENCE_STARTED (turn_index matches) → user_answering", () => {
    const actor = readyActor();
    actor.send({ type: "SERVER_QUESTION", payload: MOCK_Q0 });
    expect(actor.getSnapshot().matches("warming")).toBe(true);
    actor.send({ type: "REFERENCE_STARTED", turn_index: 0 });
    expect(actor.getSnapshot().matches("user_answering")).toBe(true);
    actor.stop();
  });

  it("warming + REFERENCE_STARTED (turn_index mismatch) → stays in warming", () => {
    const actor = readyActor();
    actor.send({ type: "SERVER_QUESTION", payload: MOCK_Q0 });
    expect(actor.getSnapshot().matches("warming")).toBe(true);
    actor.send({ type: "REFERENCE_STARTED", turn_index: 99 });
    expect(actor.getSnapshot().matches("warming")).toBe(true);
    actor.stop();
  });

  it("warming + WS_ERROR → user_answering with error in context", () => {
    const actor = readyActor();
    actor.send({ type: "SERVER_QUESTION", payload: MOCK_Q0 });
    expect(actor.getSnapshot().matches("warming")).toBe(true);
    actor.send({ type: "WS_ERROR", message: "connection lost" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches("user_answering")).toBe(true);
    expect(snapshot.context.error).toBe("connection lost");
    actor.stop();
  });

  it("warming + END_SESSION → ended", () => {
    const actor = readyActor();
    actor.send({ type: "SERVER_QUESTION", payload: MOCK_Q0 });
    expect(actor.getSnapshot().matches("warming")).toBe(true);
    actor.send({ type: "END_SESSION" });
    expect(actor.getSnapshot().matches("ended")).toBe(true);
    actor.stop();
  });
});
