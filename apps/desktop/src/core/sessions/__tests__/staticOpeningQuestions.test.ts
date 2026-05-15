/**
 * staticOpeningQuestions.test.ts — M9.2 / F-508
 *
 * 4 persona × 2 questions = 8 cases.
 * Verifies field completeness and invariants for every static opening template.
 *
 * §L0 persona lock: Sarah / Marcus / Lin / Daniel only.
 * §A0: no Tauri import, no LLM calls, no network.
 */

import { describe, it, expect } from "vitest";
import { staticOpeningQuestion } from "@/core/sessions/staticOpeningQuestions";
import type { ReadableAnswerPersona } from "@/core/agents/coach/prompts";

const PERSONAS: ReadableAnswerPersona[] = ["Sarah", "Marcus", "Lin", "Daniel"];

const VALID_EXPECTED_DEPTHS = ["surface", "tactical", "strategic"] as const;

describe("staticOpeningQuestion — 4 persona × 2 idx = 8 cases", () => {
  for (const persona of PERSONAS) {
    describe(`persona: ${persona}`, () => {
      it(`${persona} Q0 — self-intro: question non-empty, intent=open_warmup, depth=surface, should_end=false`, () => {
        const result = staticOpeningQuestion(0, persona);

        expect(result.question).toBeTruthy();
        expect(result.question.length).toBeGreaterThan(0);
        expect(result.intent).toBe("open_warmup");
        expect(result.expected_depth).toBe("surface");
        expect(result.should_end).toBe(false);
        expect(result.followup_hints).toEqual([]);
        expect(result.followup_hint).toBeNull();
        expect(result.live_observation).toBeNull();
        expect(VALID_EXPECTED_DEPTHS).toContain(result.expected_depth);
      });

      it(`${persona} Q1 — core project: question non-empty, intent=core_project_discovery, depth=tactical, should_end=false`, () => {
        const result = staticOpeningQuestion(1, persona);

        expect(result.question).toBeTruthy();
        expect(result.question.length).toBeGreaterThan(0);
        expect(result.intent).toBe("core_project_discovery");
        expect(result.expected_depth).toBe("tactical");
        expect(result.should_end).toBe(false);
        expect(result.followup_hints).toEqual([]);
        expect(result.followup_hint).toBeNull();
        expect(result.live_observation).toBeNull();
        expect(VALID_EXPECTED_DEPTHS).toContain(result.expected_depth);
      });
    });
  }

  it("each persona has distinct Q0 questions (no template collision)", () => {
    const q0s = PERSONAS.map((p) => staticOpeningQuestion(0, p).question);
    const unique = new Set(q0s);
    expect(unique.size).toBe(PERSONAS.length);
  });

  it("each persona has distinct Q1 questions (no template collision)", () => {
    const q1s = PERSONAS.map((p) => staticOpeningQuestion(1, p).question);
    const unique = new Set(q1s);
    expect(unique.size).toBe(PERSONAS.length);
  });

  it("Q0 and Q1 for same persona are different questions", () => {
    for (const persona of PERSONAS) {
      const q0 = staticOpeningQuestion(0, persona).question;
      const q1 = staticOpeningQuestion(1, persona).question;
      expect(q0).not.toBe(q1);
    }
  });
});
