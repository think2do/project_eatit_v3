/**
 * G-3: config-v32-migration tests.
 * Ported from apps/api/tests/agents/test_config_v32.py (KEEP).
 *
 * In v3.4 TS, InterviewStyleV32Schema and InterviewDirectionV32Schema are the current schemas.
 * The v3.1 legacy values (style="standard_professional", direction="role_match") are rejected
 * by the v3.2 schemas with ZodError. The v3.4 source of truth is the TS schema.
 *
 * §A0: No Tauri imports. §C3: No secret access.
 */

import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  InterviewStyleV32Schema,
  InterviewDirectionV32Schema,
  InterviewStyleSchema,
  InterviewDirectionSchema,
} from "../frameworks";
import { InterviewConfigRequestSchema } from "../sessions";

// MARK: - Legacy style upgrade (G-3)

describe("InterviewStyleV32Schema — legacy v3.1 style values rejected (G-3)", () => {
  it("v3.1 'standard_professional' rejected by InterviewStyleV32Schema (ZodError)", () => {
    expect(() => InterviewStyleV32Schema.parse("standard_professional")).toThrow(ZodError);
  });

  it("v3.1 'friendly_guided' rejected by InterviewStyleV32Schema (ZodError)", () => {
    expect(() => InterviewStyleV32Schema.parse("friendly_guided")).toThrow(ZodError);
  });

  it("v3.1 'high_pressure_followup' rejected by InterviewStyleV32Schema (ZodError)", () => {
    expect(() => InterviewStyleV32Schema.parse("high_pressure_followup")).toThrow(ZodError);
  });

  it("v3.2 'structured' accepted by InterviewStyleV32Schema", () => {
    expect(InterviewStyleV32Schema.parse("structured")).toBe("structured");
  });

  it("v3.2 'pressure' accepted by InterviewStyleV32Schema", () => {
    expect(InterviewStyleV32Schema.parse("pressure")).toBe("pressure");
  });

  it("v3.2 'friendly' accepted by InterviewStyleV32Schema", () => {
    expect(InterviewStyleV32Schema.parse("friendly")).toBe("friendly");
  });

  it("v3.2 'expert' accepted by InterviewStyleV32Schema", () => {
    expect(InterviewStyleV32Schema.parse("expert")).toBe("expert");
  });
});

// MARK: - Legacy direction field promotion (G-3)

describe("InterviewDirectionV32Schema — legacy v3.1 direction values rejected (G-3)", () => {
  it("v3.1 'role_match' rejected by InterviewDirectionV32Schema (ZodError)", () => {
    expect(() => InterviewDirectionV32Schema.parse("role_match")).toThrow(ZodError);
  });

  it("v3.1 'project_deep_dive' rejected by InterviewDirectionV32Schema (ZodError)", () => {
    expect(() => InterviewDirectionV32Schema.parse("project_deep_dive")).toThrow(ZodError);
  });

  it("v3.1 'behavioral_comprehensive' rejected by InterviewDirectionV32Schema (ZodError)", () => {
    expect(() => InterviewDirectionV32Schema.parse("behavioral_comprehensive")).toThrow(ZodError);
  });

  it("v3.2 'cross-func' accepted by InterviewDirectionV32Schema", () => {
    expect(InterviewDirectionV32Schema.parse("cross-func")).toBe("cross-func");
  });

  it("v3.2 'ai-insight' accepted by InterviewDirectionV32Schema", () => {
    expect(InterviewDirectionV32Schema.parse("ai-insight")).toBe("ai-insight");
  });

  it("v3.2 'zero-to-one' accepted by InterviewDirectionV32Schema", () => {
    expect(InterviewDirectionV32Schema.parse("zero-to-one")).toBe("zero-to-one");
  });
});

// MARK: - v3.1 schemas still accept their own values (L0 backward compat)

describe("InterviewStyleSchema (v3.1) — still accepts v3.1 values (L0 backward compat)", () => {
  it("'standard_professional' accepted by v3.1 InterviewStyleSchema", () => {
    expect(InterviewStyleSchema.parse("standard_professional")).toBe("standard_professional");
  });

  it("'friendly_guided' accepted by v3.1 InterviewStyleSchema", () => {
    expect(InterviewStyleSchema.parse("friendly_guided")).toBe("friendly_guided");
  });

  it("'high_pressure_followup' accepted by v3.1 InterviewStyleSchema", () => {
    expect(InterviewStyleSchema.parse("high_pressure_followup")).toBe("high_pressure_followup");
  });
});

describe("InterviewDirectionSchema (v3.1) — still accepts v3.1 values (L0 backward compat)", () => {
  it("'role_match' accepted by v3.1 InterviewDirectionSchema", () => {
    expect(InterviewDirectionSchema.parse("role_match")).toBe("role_match");
  });

  it("'project_deep_dive' accepted by v3.1 InterviewDirectionSchema", () => {
    expect(InterviewDirectionSchema.parse("project_deep_dive")).toBe("project_deep_dive");
  });

  it("'behavioral_comprehensive' accepted by v3.1 InterviewDirectionSchema", () => {
    expect(InterviewDirectionSchema.parse("behavioral_comprehensive")).toBe("behavioral_comprehensive");
  });
});

// MARK: - InterviewConfigRequest rejects legacy style

describe("InterviewConfigRequestSchema — rejects legacy style values (G-3)", () => {
  const baseConfig = {
    style: "structured",
    directions: ["cross-func"],
    duration_minutes: 30,
  };

  it("rejects style='standard_professional' (legacy v3.1 → ZodError)", () => {
    expect(() =>
      InterviewConfigRequestSchema.parse({ ...baseConfig, style: "standard_professional" }),
    ).toThrow(ZodError);
  });

  it("accepts style='structured' (v3.2)", () => {
    const result = InterviewConfigRequestSchema.parse({ ...baseConfig, style: "structured" });
    expect(result.style).toBe("structured");
  });

  it("accepts legacy direction field alongside v3.2 directions", () => {
    const result = InterviewConfigRequestSchema.parse({
      ...baseConfig,
      direction: "role_match",
      directions: ["cross-func"],
    });
    expect(result.direction).toBe("role_match");
    expect(result.directions).toContain("cross-func");
  });
});
