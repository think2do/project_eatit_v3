import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  DimensionNameSchema,
  PassLikelihoodSchema,
  FORBIDDEN_TONE_WORDS,
  scanForbiddenTone,
  sanitizeTone,
  DimensionScoreSchema,
  InterviewReportPayloadSchema,
  TriggerReportRequestSchema,
} from "../reports";
import {
  InterviewConfigRequestSchema,
  InterviewSessionStatusSchema,
} from "../sessions";
import {
  InterviewStyleV32Schema,
  InterviewDirectionV32Schema,
  InterviewDurationV32Schema,
} from "../frameworks";

// ===== Deterministic LCG RNG (seed=42) for N=50 fuzz — avoids CI flake =====
// LCG parameters: multiplier=1664525, increment=1013904223, modulus=2^32
function makeLcg(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = ((Math.imul(1664525, s) + 1013904223) >>> 0);
    return s / 0x100000000;
  };
}

const CHINESE_SAFE_CHARS = "继续努力加油好棒优秀表现进步成长提升学习";
const CHINESE_SAFE_WORDS = [
  "继续努力",
  "表现优秀",
  "进步显著",
  "成长很快",
  "值得肯定",
  "加油前进",
  "能力提升",
  "思路清晰",
];

function buildFuzzTextWithBanned(rng: () => number): string {
  const words = FORBIDDEN_TONE_WORDS as readonly string[];
  // pick 1-3 random banned words
  const count = 1 + Math.floor(rng() * 3);
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(words[Math.floor(rng() * words.length)]);
  }
  // interleave with safe chars
  const safe1 = CHINESE_SAFE_CHARS.slice(
    0,
    2 + Math.floor(rng() * (CHINESE_SAFE_CHARS.length - 2)),
  );
  const safe2 = CHINESE_SAFE_CHARS.slice(
    0,
    1 + Math.floor(rng() * 4),
  );
  return safe1 + picked.join(safe2);
}

function buildFuzzTextAllSafe(rng: () => number): string {
  const words = CHINESE_SAFE_WORDS;
  const count = 2 + Math.floor(rng() * 3);
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(words[Math.floor(rng() * words.length)]);
  }
  return picked.join("");
}

const VALID_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_ISO = "2024-01-15T10:30:00.000Z";

// ===== L0-1: 5 维度 name 锁 =====

describe("L0-1 — DimensionNameSchema: 5 维度 name 锁 (完全不可变)", () => {
  const DIMENSION_NAMES = [
    "专业深度",
    "结构化表达",
    "批判性思考",
    "业务直觉",
    "沟通节奏",
  ] as const;

  it("accepts 专业深度", () => {
    expect(DimensionNameSchema.parse("专业深度")).toBe("专业深度");
  });

  it("accepts 结构化表达", () => {
    expect(DimensionNameSchema.parse("结构化表达")).toBe("结构化表达");
  });

  it("accepts 批判性思考", () => {
    expect(DimensionNameSchema.parse("批判性思考")).toBe("批判性思考");
  });

  it("accepts 业务直觉", () => {
    expect(DimensionNameSchema.parse("业务直觉")).toBe("业务直觉");
  });

  it("accepts 沟通节奏", () => {
    expect(DimensionNameSchema.parse("沟通节奏")).toBe("沟通节奏");
  });

  it("rejects illegal dimension name", () => {
    expect(() => DimensionNameSchema.parse("沟通技巧")).toThrow(z.ZodError);
  });

  it("rejects English translation of dimension name", () => {
    expect(() => DimensionNameSchema.parse("Professional Depth")).toThrow(
      z.ZodError,
    );
  });

  it("DimensionNameSchema enum has exactly 5 values (constant lock)", () => {
    expect(DimensionNameSchema.options).toHaveLength(5);
    expect(DimensionNameSchema.options).toEqual([...DIMENSION_NAMES]);
  });
});

// ===== L0-2: 3 档 pass_likelihood 锁 =====

describe("L0-2 — PassLikelihoodSchema: 3 档 pass_likelihood 锁", () => {
  it("accepts 中上", () => {
    expect(PassLikelihoodSchema.parse("中上")).toBe("中上");
  });

  it("accepts 中", () => {
    expect(PassLikelihoodSchema.parse("中")).toBe("中");
  });

  it("accepts 中下", () => {
    expect(PassLikelihoodSchema.parse("中下")).toBe("中下");
  });

  it("rejects 'low' (English not in enum)", () => {
    expect(() => PassLikelihoodSchema.parse("low")).toThrow(z.ZodError);
  });

  it("rejects 'high' (English not in enum)", () => {
    expect(() => PassLikelihoodSchema.parse("high")).toThrow(z.ZodError);
  });
});

// ===== L0-3: 12 禁止词 fuzz =====

describe("L0-3 — FORBIDDEN_TONE_WORDS: 12 禁止词 fuzz (教学语气护栏)", () => {
  it("FORBIDDEN_TONE_WORDS constant has exactly 12 entries (lock against accidental edits)", () => {
    expect(FORBIDDEN_TONE_WORDS.length).toBe(12);
  });

  it("scanForbiddenTone returns single hit for '不建议你做这个'", () => {
    const hits = scanForbiddenTone("不建议你做这个");
    expect(hits).toEqual(["不建议"]);
  });

  it("scanForbiddenTone returns 3 hits for '差距很大,不合格,淘汰'", () => {
    const hits = scanForbiddenTone("差距很大,不合格,淘汰");
    expect(hits).toContain("差距很大");
    expect(hits).toContain("不合格");
    expect(hits).toContain("淘汰");
    expect(hits).toHaveLength(3);
  });

  it("scanForbiddenTone returns [] for clean text '继续努力'", () => {
    expect(scanForbiddenTone("继续努力")).toEqual([]);
  });

  it("sanitizeTone returns fallback when banned word present", () => {
    expect(sanitizeTone("不建议你做这个", "fallback text")).toBe("fallback text");
  });

  it("sanitizeTone returns original when no banned word present", () => {
    expect(sanitizeTone("继续努力", "fallback text")).toBe("继续努力");
  });

  it("all 12 forbidden words individually trigger scanForbiddenTone", () => {
    for (const word of FORBIDDEN_TONE_WORDS) {
      const hits = scanForbiddenTone(`前缀${word}后缀`);
      expect(hits).toContain(word);
    }
  });

  it("★ FUZZ N=50 ★ — texts containing banned words always return fallback from sanitizeTone", () => {
    const rng = makeLcg(42);
    for (let i = 0; i < 50; i++) {
      const text = buildFuzzTextWithBanned(rng);
      const result = sanitizeTone(text, "SAFE_FALLBACK");
      expect(result).toBe("SAFE_FALLBACK");
    }
  });

  it("★ FUZZ N=50 ★ — texts containing only safe chars always return original from sanitizeTone", () => {
    const rng = makeLcg(42);
    for (let i = 0; i < 50; i++) {
      const text = buildFuzzTextAllSafe(rng);
      const result = sanitizeTone(text, "SHOULD_NOT_APPEAR");
      expect(result).toBe(text);
    }
  });
});

// ===== L0-4: InterviewConfig 4+6+4 三轴锁 =====

describe("L0-4 — InterviewConfig: 4+6+4 三轴锁 (InterviewStyleV32 4 + InterviewDirectionV32 6 + InterviewDurationV32 4)", () => {
  describe("InterviewStyleV32Schema — 4 values lock", () => {
    it("accepts all 4 style values", () => {
      for (const v of ["structured", "pressure", "friendly", "expert"] as const) {
        expect(InterviewStyleV32Schema.parse(v)).toBe(v);
      }
    });

    it("rejects unknown style 'casual'", () => {
      expect(() => InterviewStyleV32Schema.parse("casual")).toThrow(z.ZodError);
    });
  });

  describe("InterviewDirectionV32Schema — 6 values lock", () => {
    it("accepts all 6 direction values", () => {
      const values = [
        "ai-insight",
        "data-driven",
        "cross-func",
        "zero-to-one",
        "user-research",
        "strategy",
      ] as const;
      for (const v of values) {
        expect(InterviewDirectionV32Schema.parse(v)).toBe(v);
      }
    });

    it("rejects unknown direction 'improv'", () => {
      expect(() => InterviewDirectionV32Schema.parse("improv")).toThrow(
        z.ZodError,
      );
    });
  });

  describe("InterviewDurationV32Schema — 4 values lock (15/30/45/60)", () => {
    it("accepts all 4 duration values: 15, 30, 45, 60", () => {
      for (const v of [15, 30, 45, 60] as const) {
        expect(InterviewDurationV32Schema.parse(v)).toBe(v);
      }
    });

    it("rejects duration 20 (not in {15,30,45,60})", () => {
      expect(() => InterviewDurationV32Schema.parse(20)).toThrow(z.ZodError);
    });

    it("rejects duration 90", () => {
      expect(() => InterviewDurationV32Schema.parse(90)).toThrow(z.ZodError);
    });
  });

  describe("InterviewConfigRequestSchema — directions 1-3 boundary (L0-4)", () => {
    const base = {
      style: "structured" as const,
      duration_minutes: 30 as const,
    };

    it("accepts directions with 1 item (min boundary)", () => {
      const result = InterviewConfigRequestSchema.parse({
        ...base,
        directions: ["ai-insight"],
      });
      expect(result.directions).toHaveLength(1);
    });

    it("accepts directions with 3 items (max boundary)", () => {
      const result = InterviewConfigRequestSchema.parse({
        ...base,
        directions: ["ai-insight", "data-driven", "cross-func"],
      });
      expect(result.directions).toHaveLength(3);
    });

    it("rejects directions with 4 items (above max 3)", () => {
      expect(() =>
        InterviewConfigRequestSchema.parse({
          ...base,
          directions: ["ai-insight", "data-driven", "cross-func", "zero-to-one"],
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects directions with 0 items (below min 1) when explicitly provided as empty array", () => {
      // directions has default=[], but when min(1) constraint is applied,
      // parsing an explicit empty array after default resolution should fail.
      // Note: Zod default kicks in only when field is undefined; explicit [] bypasses default.
      expect(() =>
        InterviewConfigRequestSchema.parse({
          ...base,
          directions: [],
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects unknown style 'casual'", () => {
      expect(() =>
        InterviewConfigRequestSchema.parse({
          ...base,
          style: "casual",
          directions: ["ai-insight"],
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects unknown direction 'improv' in directions array", () => {
      expect(() =>
        InterviewConfigRequestSchema.parse({
          ...base,
          directions: ["improv"],
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects duration_minutes=20 (not in {15,30,45,60})", () => {
      expect(() =>
        InterviewConfigRequestSchema.parse({
          ...base,
          duration_minutes: 20,
          directions: ["ai-insight"],
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        InterviewConfigRequestSchema.parse({
          ...base,
          directions: ["ai-insight"],
          extra: "evil",
        }),
      ).toThrow(z.ZodError);
    });
  });
});

// ===== DimensionScore evidence_chips boundary =====

describe("DimensionScoreSchema — evidence_chips boundary (min 1, max 6)", () => {
  const makeChip = (good: boolean) => ({ text: "表现良好", good });
  const makeChips = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `chip${i}`, good: i % 2 === 0 }));

  const baseScore = {
    name: "专业深度" as const,
    description: "技术深度评估",
    score: 75,
  };

  it("accepts 1 chip (min boundary)", () => {
    const result = DimensionScoreSchema.parse({
      ...baseScore,
      evidence_chips: [makeChip(true)],
    });
    expect(result.evidence_chips).toHaveLength(1);
  });

  it("accepts 6 chips (max boundary)", () => {
    const result = DimensionScoreSchema.parse({
      ...baseScore,
      evidence_chips: makeChips(6),
    });
    expect(result.evidence_chips).toHaveLength(6);
  });

  it("rejects 0 chips (below min 1)", () => {
    expect(() =>
      DimensionScoreSchema.parse({
        ...baseScore,
        evidence_chips: [],
      }),
    ).toThrow(z.ZodError);
  });

  it("rejects 7 chips (above max 6)", () => {
    expect(() =>
      DimensionScoreSchema.parse({
        ...baseScore,
        evidence_chips: makeChips(7),
      }),
    ).toThrow(z.ZodError);
  });
});

// ===== InterviewReportPayload dimensions =====

describe("InterviewReportPayloadSchema — dimensions array and L0-1 name lock", () => {
  const makeValidDimension = (name: z.infer<typeof DimensionNameSchema>) => ({
    name,
    description: "评估描述",
    score: 80,
    evidence_chips: [{ text: "表现不错", good: true }],
  });

  const validPayloadBase = {
    overall_summary: "整体表现良好",
  };

  it("accepts empty dimensions array (v3.1 backward compat)", () => {
    const result = InterviewReportPayloadSchema.parse({
      ...validPayloadBase,
      dimensions: [],
    });
    expect(result.dimensions).toHaveLength(0);
  });

  it("accepts exactly 5 dimensions with all 5 distinct L0-1 names", () => {
    const result = InterviewReportPayloadSchema.parse({
      ...validPayloadBase,
      dimensions: [
        makeValidDimension("专业深度"),
        makeValidDimension("结构化表达"),
        makeValidDimension("批判性思考"),
        makeValidDimension("业务直觉"),
        makeValidDimension("沟通节奏"),
      ],
    });
    expect(result.dimensions).toHaveLength(5);
    const names = result.dimensions.map((d) => d.name);
    expect(names).toContain("专业深度");
    expect(names).toContain("结构化表达");
    expect(names).toContain("批判性思考");
    expect(names).toContain("业务直觉");
    expect(names).toContain("沟通节奏");
  });

  it("rejects dimension with illegal name (typo protection via DimensionNameSchema)", () => {
    expect(() =>
      InterviewReportPayloadSchema.parse({
        ...validPayloadBase,
        dimensions: [
          {
            name: "专业度", // typo — not in enum
            description: "描述",
            score: 80,
            evidence_chips: [{ text: "x", good: true }],
          },
        ],
      }),
    ).toThrow(z.ZodError);
  });

  it("accepts dimensions with any length (service layer enforces 5-strict invariant)", () => {
    // Pydantic uses default_factory=list with no min/max; schema accepts any length
    const result = InterviewReportPayloadSchema.parse({
      ...validPayloadBase,
      dimensions: [
        makeValidDimension("专业深度"),
        makeValidDimension("结构化表达"),
        makeValidDimension("批判性思考"),
      ],
    });
    expect(result.dimensions).toHaveLength(3);
  });

  it("TriggerReportRequest force_regenerate defaults to false", () => {
    const result = TriggerReportRequestSchema.parse({});
    expect(result.force_regenerate).toBe(false);
  });

  it("InterviewReportPayload pass_likelihood nullable/optional accepts null", () => {
    const result = InterviewReportPayloadSchema.parse({
      ...validPayloadBase,
      pass_likelihood: null,
    });
    expect(result.pass_likelihood).toBeNull();
  });

  it("InterviewReportPayload pass_likelihood accepts L0-2 values", () => {
    for (const v of ["中上", "中", "中下"] as const) {
      const result = InterviewReportPayloadSchema.parse({
        ...validPayloadBase,
        pass_likelihood: v,
      });
      expect(result.pass_likelihood).toBe(v);
    }
  });
});

// ===== InterviewSessionStatus 13 values lock =====

describe("InterviewSessionStatusSchema — 13 values lock", () => {
  const ALL_STATUS = [
    "created",
    "session_started",
    "turn_recording",
    "turn_transcribing",
    "turn_evaluating",
    "turn_compressing",
    "next_question_ready",
    "paused",
    "ended",
    "exited_early",
    "report_generating",
    "report_ready",
    "failed",
  ] as const;

  it("accepts all 13 session status values", () => {
    for (const v of ALL_STATUS) {
      expect(InterviewSessionStatusSchema.parse(v)).toBe(v);
    }
  });

  it("has exactly 13 values in enum (lock against accidental edits)", () => {
    expect(InterviewSessionStatusSchema.options).toHaveLength(13);
  });

  it("rejects illegal status value", () => {
    expect(() =>
      InterviewSessionStatusSchema.parse("completed"),
    ).toThrow(z.ZodError);
  });

  it("rejects another illegal value 'in_progress'", () => {
    expect(() =>
      InterviewSessionStatusSchema.parse("in_progress"),
    ).toThrow(z.ZodError);
  });
});
