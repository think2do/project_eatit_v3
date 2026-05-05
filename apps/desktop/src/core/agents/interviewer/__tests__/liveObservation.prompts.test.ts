/**
 * G-11: live_observation prompt template tests.
 * Ported from apps/api/tests/agents/test_live_observation.py (KEEP).
 *
 * Verifies that the system prompt contains the required literal markers for
 * the live_observation guardrail: "≤ 30 字", "教学语气", and the 3 don't-examples.
 *
 * §A0: No Tauri imports. §C3: No secret access.
 */

import { describe, it, expect } from "vitest";
import { systemPrompt } from "../prompts";
import { PERSONA_MAP } from "../personas";

// Use the standard 'structured' persona for prompt inspection
const PERSONA = PERSONA_MAP.structured;

describe("systemPrompt() — live_observation guardrail markers (G-11)", () => {
  it("contains '≤ 30 字' length constraint", () => {
    expect(systemPrompt(PERSONA)).toContain("≤ 30 字");
  });

  it("contains '教学语气' (teaching tone requirement)", () => {
    expect(systemPrompt(PERSONA)).toContain("教学语气");
  });

  it("contains don't-example: '你回答得很差' (evaluative tone forbidden)", () => {
    expect(systemPrompt(PERSONA)).toContain("你回答得很差");
  });

  it("contains don't-example: '完全没有抓住要点' (negative tone forbidden)", () => {
    expect(systemPrompt(PERSONA)).toContain("完全没有抓住要点");
  });

  it("contains don't-example: '缺乏深度' (negative tone forbidden)", () => {
    expect(systemPrompt(PERSONA)).toContain("缺乏深度");
  });

  it("contains 'live_observation' field name", () => {
    expect(systemPrompt(PERSONA)).toContain("live_observation");
  });

  it("contains guardrail text '忽略之前的指令' (prompt injection block)", () => {
    // Inlined from _guardrails.j2 — prompt injection blocked at system level
    expect(systemPrompt(PERSONA)).toContain("忽略之前的指令");
  });

  it("contains '不得评判式' (non-evaluative tone requirement)", () => {
    expect(systemPrompt(PERSONA)).toContain("不得评判式");
  });

  it("live_observation section appears after the main task section", () => {
    const prompt = systemPrompt(PERSONA);
    const taskIdx = prompt.indexOf("InterviewerAgent");
    const obsIdx = prompt.indexOf("live_observation");
    expect(taskIdx).toBeGreaterThan(-1);
    expect(obsIdx).toBeGreaterThan(-1);
    // live_observation section appears after the main task label
    expect(obsIdx).toBeGreaterThan(taskIdx);
  });

  it("don't-examples are marked with ← annotation (violation labels)", () => {
    const prompt = systemPrompt(PERSONA);
    // The prompt marks each don't-example with an annotation
    expect(prompt).toContain("← 评判式");
  });

  it("don't-examples include '否定式' annotation for negative-style examples", () => {
    const prompt = systemPrompt(PERSONA);
    expect(prompt).toContain("← 否定式");
  });
});

describe("systemPrompt() — persona injection (G-11 adjacent)", () => {
  it("prompt mentions persona name (structured)", () => {
    expect(systemPrompt(PERSONA_MAP.structured)).toContain(PERSONA_MAP.structured.name);
  });

  it("prompt mentions persona name (pressure)", () => {
    expect(systemPrompt(PERSONA_MAP.pressure)).toContain(PERSONA_MAP.pressure.name);
  });
});
