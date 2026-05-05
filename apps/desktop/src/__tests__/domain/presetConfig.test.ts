/**
 * G-14 domain/presetConfig — M5.2.c
 *
 * The Python backend's `derive_preset_config` produces a `NextActions` (next_actions_v2)
 * object or null.  The v3.4 TS equivalent is the `NextActionsSchema` in
 * `core/schemas/reports.ts` + the `InterviewReportPayloadSchema.next_actions_v2` field.
 *
 * These tests verify the schema contract that drives the dark-CTA prefill flow
 * (ReportPage F-317) without touching product-code internals.
 *
 * §A0: no Tauri import.
 * §C3: no secret material.
 * L0 locks: DimensionNameSchema 5 values, InterviewStyleV32Schema 4 values,
 *   InterviewDirectionV32Schema 6 values, InterviewDurationV32Schema 4 values — unchanged.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  NextActionsSchema,
  InterviewReportPayloadSchema,
  DimensionScoreSchema,
} from "../../core/schemas/reports";
import {
  InterviewConfigRequestSchema,
} from "../../core/schemas/sessions";
import {
  InterviewStyleV32Schema,
  InterviewDirectionV32Schema,
  InterviewDurationV32Schema,
} from "../../core/schemas/frameworks";

// Minimal valid NextActions fixture — style/direction/duration from L0-locked enums.
const VALID_NEXT_ACTIONS = {
  headline: "专项训练",
  preset_config: {
    style: "pressure",
    directions: ["ai-insight"],
    duration_minutes: 30,
  },
  reason: "结构化表达偏弱，建议加强专项训练。",
};

describe("G-14 domain/presetConfig — NextActionsSchema contract", () => {
  it("NextActionsSchema happy path round-trips a valid preset_config", () => {
    const parsed = NextActionsSchema.parse(VALID_NEXT_ACTIONS);
    expect(parsed.headline).toBe("专项训练");
    expect(parsed.preset_config.style).toBe("pressure");
    expect(parsed.preset_config.directions).toEqual(["ai-insight"]);
    expect(parsed.preset_config.duration_minutes).toBe(30);
    expect(parsed.reason).toBe("结构化表达偏弱，建议加强专项训练。");
  });

  it("NextActionsSchema headline max-length=20 enforced — 21-char string throws ZodError", () => {
    const data = { ...VALID_NEXT_ACTIONS, headline: "a".repeat(21) };
    expect(() => NextActionsSchema.parse(data)).toThrow(z.ZodError);
  });

  it("NextActionsSchema headline 20-char string is accepted exactly at boundary", () => {
    const data = { ...VALID_NEXT_ACTIONS, headline: "a".repeat(20) };
    expect(() => NextActionsSchema.parse(data)).not.toThrow();
  });

  it("NextActionsSchema rejects missing reason field", () => {
    const { reason: _r, ...noReason } = VALID_NEXT_ACTIONS;
    expect(() => NextActionsSchema.parse(noReason)).toThrow(z.ZodError);
  });

  it("NextActionsSchema rejects extra unknown field (strict)", () => {
    const data = { ...VALID_NEXT_ACTIONS, extra_field: "forbidden" };
    expect(() => NextActionsSchema.parse(data)).toThrow(z.ZodError);
  });

  it("preset_config.style L0-4 lock — 4 valid values accepted (structured/pressure/friendly/expert)", () => {
    const validStyles = InterviewStyleV32Schema.options;
    expect(validStyles).toHaveLength(4);
    for (const style of validStyles) {
      const data = { ...VALID_NEXT_ACTIONS, preset_config: { ...VALID_NEXT_ACTIONS.preset_config, style } };
      expect(() => NextActionsSchema.parse(data)).not.toThrow();
    }
  });

  it("preset_config.style L0-4 lock — unknown style value throws ZodError", () => {
    const data = {
      ...VALID_NEXT_ACTIONS,
      preset_config: { ...VALID_NEXT_ACTIONS.preset_config, style: "unknown_style" },
    };
    expect(() => NextActionsSchema.parse(data)).toThrow(z.ZodError);
  });

  it("preset_config.directions L0-4 lock — 6 valid direction values each accepted", () => {
    const validDirs = InterviewDirectionV32Schema.options;
    expect(validDirs).toHaveLength(6);
    for (const dir of validDirs) {
      const data = {
        ...VALID_NEXT_ACTIONS,
        preset_config: { ...VALID_NEXT_ACTIONS.preset_config, directions: [dir] },
      };
      expect(() => NextActionsSchema.parse(data)).not.toThrow();
    }
  });

  it("preset_config.directions max=3 enforced — 4-item array throws ZodError", () => {
    const data = {
      ...VALID_NEXT_ACTIONS,
      preset_config: {
        ...VALID_NEXT_ACTIONS.preset_config,
        directions: ["ai-insight", "data-driven", "cross-func", "zero-to-one"],
      },
    };
    expect(() => NextActionsSchema.parse(data)).toThrow(z.ZodError);
  });

  it("preset_config.directions min=1 enforced — empty array throws ZodError", () => {
    const data = {
      ...VALID_NEXT_ACTIONS,
      preset_config: { ...VALID_NEXT_ACTIONS.preset_config, directions: [] },
    };
    expect(() => NextActionsSchema.parse(data)).toThrow(z.ZodError);
  });

  it("preset_config.duration_minutes L0-4 lock — 4 valid values accepted (15/30/45/60)", () => {
    const validDurations = [15, 30, 45, 60] as const;
    for (const d of validDurations) {
      const data = {
        ...VALID_NEXT_ACTIONS,
        preset_config: { ...VALID_NEXT_ACTIONS.preset_config, duration_minutes: d },
      };
      expect(() => NextActionsSchema.parse(data)).not.toThrow();
    }
  });

  it("preset_config.duration_minutes rejects unlocked value (e.g. 20)", () => {
    const data = {
      ...VALID_NEXT_ACTIONS,
      preset_config: { ...VALID_NEXT_ACTIONS.preset_config, duration_minutes: 20 },
    };
    expect(() => NextActionsSchema.parse(data)).toThrow(z.ZodError);
  });

  // InterviewReportPayloadSchema requires overall_summary (non-optional string field).
  const MINIMAL_PAYLOAD = { overall_summary: "Test summary" };

  it("InterviewReportPayloadSchema.next_actions_v2 nullable — null is accepted (derive returned null)", () => {
    const parsed = InterviewReportPayloadSchema.parse({ ...MINIMAL_PAYLOAD, next_actions_v2: null });
    expect(parsed.next_actions_v2).toBeNull();
  });

  it("InterviewReportPayloadSchema.next_actions_v2 absent — field is undefined (v3.1 legacy compat)", () => {
    const parsed = InterviewReportPayloadSchema.parse(MINIMAL_PAYLOAD);
    expect(parsed.next_actions_v2).toBeUndefined();
  });

  it("InterviewReportPayloadSchema round-trips valid next_actions_v2 object", () => {
    const parsed = InterviewReportPayloadSchema.parse({ ...MINIMAL_PAYLOAD, next_actions_v2: VALID_NEXT_ACTIONS });
    expect(parsed.next_actions_v2?.headline).toBe("专项训练");
    expect(parsed.next_actions_v2?.preset_config.style).toBe("pressure");
  });

  it("InterviewConfigRequestSchema directions 1-3 range: 1 item accepted", () => {
    const config = { style: "structured", directions: ["ai-insight"], duration_minutes: 30 };
    expect(() => InterviewConfigRequestSchema.parse(config)).not.toThrow();
  });

  it("InterviewConfigRequestSchema directions 1-3 range: 3 items accepted", () => {
    const config = {
      style: "friendly",
      directions: ["ai-insight", "data-driven", "strategy"],
      duration_minutes: 45,
    };
    expect(() => InterviewConfigRequestSchema.parse(config)).not.toThrow();
  });

  it("InterviewDurationV32Schema accepts only 15/30/45/60", () => {
    expect(() => InterviewDurationV32Schema.parse(15)).not.toThrow();
    expect(() => InterviewDurationV32Schema.parse(30)).not.toThrow();
    expect(() => InterviewDurationV32Schema.parse(45)).not.toThrow();
    expect(() => InterviewDurationV32Schema.parse(60)).not.toThrow();
    expect(() => InterviewDurationV32Schema.parse(90)).toThrow(z.ZodError);
    expect(() => InterviewDurationV32Schema.parse(0)).toThrow(z.ZodError);
  });

  it("DimensionScoreSchema score range 0-100 enforced", () => {
    const base = {
      name: "专业深度",
      description: "test",
      score: 75,
      evidence_chips: [{ text: "chip1", good: true }],
    };
    expect(() => DimensionScoreSchema.parse(base)).not.toThrow();
    expect(() => DimensionScoreSchema.parse({ ...base, score: -1 })).toThrow(z.ZodError);
    expect(() => DimensionScoreSchema.parse({ ...base, score: 101 })).toThrow(z.ZodError);
    expect(() => DimensionScoreSchema.parse({ ...base, score: 0 })).not.toThrow();
    expect(() => DimensionScoreSchema.parse({ ...base, score: 100 })).not.toThrow();
  });
});
