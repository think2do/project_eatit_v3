/**
 * G-15 domain/sessionSummary — M5.2.c
 *
 * Port of Python `_serialize_session_summary` projection from v3.3 backend.
 * In v3.4, the v3.4 equivalent is `SessionSummarySchema` in `core/schemas/sessions.ts`,
 * which is the API response shape.  These tests validate the schema contract
 * that the HistoryPage / SessionTable consume (see `__tests__/HistoryPage.test.tsx`).
 *
 * §A0: no Tauri import.
 * §C3: no secret material.
 * L0 locks: InterviewSessionStatusSchema 13 values — unchanged per §L0.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  SessionSummarySchema,
  SessionListResponseSchema,
  SessionDetailResponseSchema,
} from "../../core/schemas/sessions";

// Minimal valid SessionSummary fixture
const BASE_SUMMARY = {
  id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:30:00Z",
  user_id: "b1ccdc88-8d1a-5f99-bc7e-7bc0ce491b22",
  candidate_asset_id: "c2dddc99-1234-5678-ab12-9cc0ce491baa",
  status: "report_ready",
  turn_count: 5,
  config_snapshot: { style: "structured", duration_minutes: 30 },
};

describe("G-15 domain/sessionSummary — SessionSummarySchema contract", () => {
  it("happy path: minimal fields round-trip (no report fields)", () => {
    const parsed = SessionSummarySchema.parse(BASE_SUMMARY);
    expect(parsed.status).toBe("report_ready");
    expect(parsed.turn_count).toBe(5);
    expect(parsed.latest_overall_score).toBeUndefined();
    expect(parsed.latest_weaknesses).toEqual([]);
  });

  it("latest_overall_score nullable — null accepted (no report yet)", () => {
    const data = { ...BASE_SUMMARY, latest_overall_score: null };
    const parsed = SessionSummarySchema.parse(data);
    expect(parsed.latest_overall_score).toBeNull();
  });

  it("overall_score int range 0-100 enforced", () => {
    expect(() => SessionSummarySchema.parse({ ...BASE_SUMMARY, latest_overall_score: 85 })).not.toThrow();
    expect(() => SessionSummarySchema.parse({ ...BASE_SUMMARY, latest_overall_score: 0 })).not.toThrow();
    expect(() => SessionSummarySchema.parse({ ...BASE_SUMMARY, latest_overall_score: 100 })).not.toThrow();
    expect(() => SessionSummarySchema.parse({ ...BASE_SUMMARY, latest_overall_score: -1 })).toThrow(z.ZodError);
    expect(() => SessionSummarySchema.parse({ ...BASE_SUMMARY, latest_overall_score: 101 })).toThrow(z.ZodError);
  });

  it("float score is rejected — only integer accepted (Pydantic int field)", () => {
    expect(() => SessionSummarySchema.parse({ ...BASE_SUMMARY, latest_overall_score: 85.5 })).toThrow(z.ZodError);
  });

  it("latest_weaknesses max-length=2 enforced — 3 items throws ZodError", () => {
    const data = {
      ...BASE_SUMMARY,
      latest_overall_score: 60,
      latest_weaknesses: ["结构化表达", "业务直觉", "沟通节奏"],
    };
    expect(() => SessionSummarySchema.parse(data)).toThrow(z.ZodError);
  });

  it("latest_weaknesses: top-2 only — 2 items accepted at boundary", () => {
    const data = {
      ...BASE_SUMMARY,
      latest_overall_score: 65,
      latest_weaknesses: ["结构化表达", "业务直觉"],
    };
    const parsed = SessionSummarySchema.parse(data);
    expect(parsed.latest_weaknesses).toHaveLength(2);
    expect(parsed.latest_weaknesses[0]).toBe("结构化表达");
  });

  it("latest_weaknesses default = [] — absent field yields empty array", () => {
    const parsed = SessionSummarySchema.parse(BASE_SUMMARY);
    expect(parsed.latest_weaknesses).toEqual([]);
  });

  it("status L0 lock — all 13 InterviewSessionStatus values accepted", () => {
    const statuses = [
      "created", "session_started", "turn_recording", "turn_transcribing",
      "turn_evaluating", "turn_compressing", "next_question_ready", "paused",
      "ended", "exited_early", "report_generating", "report_ready", "failed",
    ];
    expect(statuses).toHaveLength(13);
    for (const status of statuses) {
      expect(() => SessionSummarySchema.parse({ ...BASE_SUMMARY, status })).not.toThrow();
    }
  });

  it("status L0 lock — unknown status throws ZodError", () => {
    expect(() => SessionSummarySchema.parse({ ...BASE_SUMMARY, status: "unknown_status" })).toThrow(z.ZodError);
  });

  it("turn_count must be non-negative integer — negative throws ZodError", () => {
    expect(() => SessionSummarySchema.parse({ ...BASE_SUMMARY, turn_count: -1 })).toThrow(z.ZodError);
  });

  it("turn_count=0 accepted — fresh session with no turns", () => {
    const parsed = SessionSummarySchema.parse({ ...BASE_SUMMARY, turn_count: 0, status: "session_started" });
    expect(parsed.turn_count).toBe(0);
  });

  it("started_at/ended_at nullable — both null accepted", () => {
    const data = { ...BASE_SUMMARY, started_at: null, ended_at: null };
    const parsed = SessionSummarySchema.parse(data);
    expect(parsed.started_at).toBeNull();
    expect(parsed.ended_at).toBeNull();
  });

  it("started_at/ended_at accept ISO datetime strings", () => {
    const data = {
      ...BASE_SUMMARY,
      started_at: "2024-01-15T10:05:00Z",
      ended_at: "2024-01-15T10:35:00Z",
    };
    const parsed = SessionSummarySchema.parse(data);
    expect(parsed.started_at).toBe("2024-01-15T10:05:00Z");
    expect(parsed.ended_at).toBe("2024-01-15T10:35:00Z");
  });

  it("strict mode — extra field throws ZodError", () => {
    const data = { ...BASE_SUMMARY, extra_field: "forbidden" };
    expect(() => SessionSummarySchema.parse(data)).toThrow(z.ZodError);
  });

  it("SessionListResponseSchema paginated structure accepted", () => {
    const listData = {
      items: [BASE_SUMMARY],
      page: 1,
      page_size: 20,
      total: 1,
    };
    const parsed = SessionListResponseSchema.parse(listData);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.page).toBe(1);
    expect(parsed.total).toBe(1);
  });

  it("SessionDetailResponseSchema extends SessionSummary with optional config/direction_framework", () => {
    const detailData = {
      ...BASE_SUMMARY,
      config: null,
      direction_framework: null,
    };
    const parsed = SessionDetailResponseSchema.parse(detailData);
    expect(parsed.config).toBeNull();
    expect(parsed.direction_framework).toBeNull();
  });

  it("config_snapshot accepts arbitrary record (no schema constraint)", () => {
    const data = {
      ...BASE_SUMMARY,
      config_snapshot: { style: "pressure", directions: ["ai-insight"], foo: 42 },
    };
    const parsed = SessionSummarySchema.parse(data);
    expect(parsed.config_snapshot["style"]).toBe("pressure");
  });
});
