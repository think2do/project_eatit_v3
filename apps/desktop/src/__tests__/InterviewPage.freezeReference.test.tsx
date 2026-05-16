// M9.1 — freeze reference panel after user enters user_answering state.
//
// Tests the xstate machine's SERVER_REFERENCE guard that drops updates while
// the machine is in user_answering (boss feedback 00:13:15: "我念念着呢,你
// 突然给了我一个更完整的回答,但是你中断了我当时非常必要的一个操作").
//
// Strategy: use createActor to drive the machine through state transitions
// and assert referenceAnswer context changes (or non-changes) at each stage.

import { describe, it, expect, beforeEach } from "vitest";
import { createActor } from "xstate";
import { interviewMachine, type ReferenceAnswerHint } from "@/statecharts/interview-machine";

const MOCK_QUESTION = {
  turn_index: 0,
  question: "Tell me about yourself",
  intent: "opener",
  expected_depth: "surface" as const,
  followup_hint: null,
  should_end: false,
};

const MOCK_REFERENCE_V1: ReferenceAnswerHint = {
  turn_index: 0,
  answer_outline: ["intro", "experience"],
  ideal_answer: "I am a PM with 5 years experience",
  key_evaluation_points: ["clarity"],
  common_pitfalls: ["rambling"],
};

const MOCK_REFERENCE_V2: ReferenceAnswerHint = {
  turn_index: 0,
  answer_outline: ["intro", "experience", "motivation"],
  ideal_answer: "I am a PM with 5 years experience — more complete version",
  key_evaluation_points: ["clarity", "structure"],
  common_pitfalls: ["rambling", "off-topic"],
};

const MOCK_QUESTION_TURN1 = {
  turn_index: 1,
  question: "What is your greatest strength?",
  intent: "strength",
  expected_depth: "tactical" as const,
  followup_hint: null,
  should_end: false,
};

const MOCK_REFERENCE_TURN1: ReferenceAnswerHint = {
  turn_index: 1,
  answer_outline: ["strength", "example"],
  ideal_answer: "My greatest strength is data-driven thinking",
  key_evaluation_points: ["specificity"],
  common_pitfalls: ["generic answers"],
};

function advanceToUserAnswering() {
  const actor = createActor(interviewMachine);
  actor.start();
  actor.send({ type: "CONNECT", sessionId: "test-session" });
  actor.send({ type: "WS_OPEN" });
  actor.send({ type: "SERVER_QUESTION", payload: MOCK_QUESTION });
  actor.send({ type: "REFERENCE_STARTED", turn_index: 0 });
  return actor;
}

describe("M9.1 — reference freeze during user_answering", () => {
  it("SERVER_REFERENCE sets referenceAnswer before user starts answering (ready state)", () => {
    const actor = createActor(interviewMachine);
    actor.start();
    actor.send({ type: "CONNECT", sessionId: "test-session" });
    actor.send({ type: "WS_OPEN" });
    // In ready state: SERVER_REFERENCE should land normally
    // But turn_index check: context.currentTurnIndex is 0, payload.turn_index is 0 → pass
    actor.send({ type: "SERVER_REFERENCE", payload: MOCK_REFERENCE_V1 });
    expect(actor.getSnapshot().context.referenceAnswer).toEqual(MOCK_REFERENCE_V1);
    actor.stop();
  });

  it("SERVER_REFERENCE is dropped once the user is actively answering (freeze behavior)", () => {
    const actor = advanceToUserAnswering();
    // Verify we are in user_answering
    expect(actor.getSnapshot().matches("user_answering")).toBe(true);

    // M9.1 (e49c5b99 refinement): the freeze only engages once the user has
    // *started* answering (draftAnswer non-empty / recording). Simulate the
    // user typing so the snapshot is frozen.
    actor.send({ type: "UPDATE_ANSWER", value: "I am typing my own answer" });

    // First reference arrives while the user is actively answering — dropped.
    actor.send({ type: "SERVER_REFERENCE", payload: MOCK_REFERENCE_V1 });
    const snapshotAfterV1 = actor.getSnapshot().context.referenceAnswer;
    // The machine is now in user_answering; V1 should have been dropped
    expect(snapshotAfterV1).toBeNull();

    // A "more complete" V2 arrives while still in user_answering — must also be dropped
    actor.send({ type: "SERVER_REFERENCE", payload: MOCK_REFERENCE_V2 });
    const snapshotAfterV2 = actor.getSnapshot().context.referenceAnswer;
    expect(snapshotAfterV2).toBeNull();

    actor.stop();
  });

  it("SERVER_REFERENCE is accepted again after moving to scoring then next_question", () => {
    const actor = advanceToUserAnswering();
    // User starts answering → freeze engages (M9.1 e49c5b99 refinement)
    actor.send({ type: "UPDATE_ANSWER", value: "drafting my answer" });
    // Reference dropped while user is actively answering
    actor.send({ type: "SERVER_REFERENCE", payload: MOCK_REFERENCE_V1 });
    expect(actor.getSnapshot().context.referenceAnswer).toBeNull();

    // User submits → scoring
    actor.send({ type: "UPDATE_ANSWER", value: "My answer" });
    actor.send({ type: "SUBMIT_ANSWER" });
    expect(actor.getSnapshot().matches("scoring")).toBe(true);

    // Move to next_question
    actor.send({
      type: "SERVER_ASSESSED",
      payload: { turn_index: 0, summary: "good", strengths: [], weaknesses: [] },
    });
    expect(actor.getSnapshot().matches("next_question")).toBe(true);

    // Next question arrives — new turn; referenceAnswer resets to null on question
    actor.send({ type: "SERVER_QUESTION", payload: MOCK_QUESTION_TURN1 });
    expect(actor.getSnapshot().matches("user_answering")).toBe(true);
    expect(actor.getSnapshot().context.currentTurnIndex).toBe(1);
    // referenceAnswer was reset to null by the SERVER_QUESTION action
    expect(actor.getSnapshot().context.referenceAnswer).toBeNull();

    // SERVER_QUESTION reset draftAnswer to "" — the user must start answering
    // turn 1 before the freeze re-engages for the new turn.
    actor.send({ type: "UPDATE_ANSWER", value: "answering turn one" });
    // Reference for turn 1 arrives while user is actively answering → frozen
    actor.send({ type: "SERVER_REFERENCE", payload: MOCK_REFERENCE_TURN1 });
    expect(actor.getSnapshot().context.referenceAnswer).toBeNull();

    actor.stop();
  });

  it("late-arriving reference for a previous turn is always dropped (turn_index guard)", () => {
    const actor = advanceToUserAnswering();
    // Submit and move to scoring/next_question
    actor.send({ type: "UPDATE_ANSWER", value: "My answer" });
    actor.send({ type: "SUBMIT_ANSWER" });
    actor.send({
      type: "SERVER_ASSESSED",
      payload: { turn_index: 0, summary: "ok", strengths: [], weaknesses: [] },
    });
    actor.send({ type: "SERVER_QUESTION", payload: MOCK_QUESTION_TURN1 });
    // currentTurnIndex is now 1; send a stale reference for turn 0
    const staleRef: ReferenceAnswerHint = {
      turn_index: 0, // wrong turn
      answer_outline: [],
      ideal_answer: "stale",
      key_evaluation_points: [],
      common_pitfalls: [],
    };
    actor.send({ type: "SERVER_REFERENCE", payload: staleRef });
    // Should be dropped by turn_index guard (not user_answering freeze)
    expect(actor.getSnapshot().context.referenceAnswer).toBeNull();
    actor.stop();
  });
});
