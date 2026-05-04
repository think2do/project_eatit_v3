import { describe, it, expect, vi } from "vitest";
import { ZodError, z } from "zod";
import { runResearchAgent, computeCacheKey, ResearchSubObjectSchema, type ResearchAgentDeps } from "../index";
import { systemPrompt, userPrompt } from "../prompts";
import {
  ResearchAgentInputSchema,
  ResearchAgentOutputSchema,
  type ResearchAgentInput,
} from "@/core/schemas/research";
import type { LLMProvider, Message } from "@/core/llm/types";

// MARK: - Fixtures

const VALID_INPUT: ResearchAgentInput = {
  company_name: "Acme Corp",
  role_title: "Product Manager",
  industry_hints: ["B2C", "SaaS"],
};

const VALID_LLM_SUB_OBJECT = {
  company: {
    name: "Acme Corp",
    business_model: "Acme Corp 是一家面向企业客户提供 SaaS 解决方案的科技公司。",
    stage: "growth" as const,
    recent_signals: [
      {
        type: "funding" as const,
        summary: "Acme Corp 完成 B 轮融资 5000 万美元。",
        occurred_at: null,
        source_url: "https://example.com/acme-funding",
      },
    ],
    evidence_links: ["https://example.com/acme-funding"],
    confidence: "mid" as const,
  },
  industry: {
    name: "B2C SaaS",
    landscape_summary: "B2C SaaS 市场持续增长,竞争加剧,用户留存是核心挑战。",
    key_metrics: ["月活跃用户 MAU", "净推荐值 NPS", "客户获取成本 CAC"],
    typical_pain_points: ["用户留存率低", "获客成本高"],
    competitors_in_jd_ctx: ["Salesforce", "HubSpot"],
  },
};

// MARK: - Mock LLMProvider

class MockLLMProvider implements LLMProvider {
  private generateObjectImpl: () => Promise<unknown>;

  constructor(generateObjectImpl: () => Promise<unknown>) {
    this.generateObjectImpl = generateObjectImpl;
  }

  chat = vi.fn();
  chatStream = vi.fn();

  generateObject<T>(_req: {
    schema: z.ZodSchema<T>;
    messages: Message[];
    model?: string;
  }): Promise<T> {
    return this.generateObjectImpl() as Promise<T>;
  }
}

function makeProvider(output: typeof VALID_LLM_SUB_OBJECT): ResearchAgentDeps {
  return {
    llm: new MockLLMProvider(() => Promise.resolve(output)) as LLMProvider,
  };
}

// MARK: - runResearchAgent tests

describe("runResearchAgent", () => {
  // Case 1: Happy path — full ResearchAgentOutput with correct shape

  it("happy path — mock LLM returns sub-object → output has cache_key, fetched_at, degraded=false", async () => {
    const deps = makeProvider(VALID_LLM_SUB_OBJECT);
    const result = await runResearchAgent(VALID_INPUT, deps);

    expect(result.company.name).toBe("Acme Corp");
    expect(result.industry.name).toBe("B2C SaaS");
    expect(result.degraded).toBe(false);
    expect(result.degraded_reason).toBeNull();
    expect(result.fetched_at).toBeDefined();
    expect(result.cache_key).toBeDefined();
    // Validate overall shape via schema
    expect(() => ResearchAgentOutputSchema.parse(result)).not.toThrow();
  });

  // Case 2: cache_key stability — same input → same cache_key

  it("cache_key stability — same input always produces same cache_key", async () => {
    const deps = makeProvider(VALID_LLM_SUB_OBJECT);
    const result1 = await runResearchAgent(VALID_INPUT, deps);
    const result2 = await runResearchAgent(VALID_INPUT, deps);

    expect(result1.cache_key).toBe(result2.cache_key);
  });

  // Case 3: cache_key differs for different company_name

  it("cache_key differs when company_name changes", async () => {
    const deps1 = makeProvider(VALID_LLM_SUB_OBJECT);
    const deps2 = makeProvider(VALID_LLM_SUB_OBJECT);
    const result1 = await runResearchAgent(VALID_INPUT, deps1);
    const result2 = await runResearchAgent({ ...VALID_INPUT, company_name: "OtherCorp" }, deps2);

    expect(result1.cache_key).not.toBe(result2.cache_key);
  });

  // Case 4: cache_key differs for different industry_hints

  it("cache_key differs when industry_hints changes", async () => {
    const deps1 = makeProvider(VALID_LLM_SUB_OBJECT);
    const deps2 = makeProvider(VALID_LLM_SUB_OBJECT);
    const result1 = await runResearchAgent(VALID_INPUT, deps1);
    const result2 = await runResearchAgent({ ...VALID_INPUT, industry_hints: ["B2B", "Enterprise"] }, deps2);

    expect(result1.cache_key).not.toBe(result2.cache_key);
  });

  // Case 5: cache_key length === 16

  it("cache_key length is exactly 16 characters", async () => {
    const deps = makeProvider(VALID_LLM_SUB_OBJECT);
    const result = await runResearchAgent(VALID_INPUT, deps);

    expect(result.cache_key).toHaveLength(16);
  });

  // Case 6: cache_key only [0-9a-f] hex chars

  it("cache_key contains only lowercase hex characters [0-9a-f]", async () => {
    const deps = makeProvider(VALID_LLM_SUB_OBJECT);
    const result = await runResearchAgent(VALID_INPUT, deps);

    expect(result.cache_key).toMatch(/^[0-9a-f]{16}$/);
  });

  // Case 7: LLM error propagates (not swallowed)

  it("LLM error propagates without being swallowed", async () => {
    const errorLLM = new MockLLMProvider(() => Promise.reject(new Error("LLM network timeout")));
    const deps: ResearchAgentDeps = { llm: errorLLM as LLMProvider };

    await expect(runResearchAgent(VALID_INPUT, deps)).rejects.toThrow("LLM network timeout");
  });

  // Case 8: ZodError on invalid input — empty company_name (min 1 violated)

  it("ZodError on invalid input — empty company_name rejected (min 1)", async () => {
    const deps = makeProvider(VALID_LLM_SUB_OBJECT);

    await expect(
      runResearchAgent({ ...VALID_INPUT, company_name: "" }, deps),
    ).rejects.toThrow(ZodError);
  });

  // Case 9: ZodError on input with extra PII field (explicit Layer 1 sanity check)

  it("ZodError on input with extra PII field (Layer 1 defense)", async () => {
    const deps = makeProvider(VALID_LLM_SUB_OBJECT);

    await expect(
      runResearchAgent(
        { ...VALID_INPUT, resume_text: "candidate personal data" } as never,
        deps,
      ),
    ).rejects.toThrow(ZodError);
  });

  // Case 10: Layer 1 stops LLM from being called when PII field present

  it("Layer 1 stops LLM call — generateObject NOT called when PII field in input", async () => {
    const generateObject = vi.fn();
    const mockLLM = { chat: vi.fn(), chatStream: vi.fn(), generateObject } as unknown as LLMProvider;

    try {
      await runResearchAgent(
        { ...VALID_INPUT, candidate_email: "test@example.com" } as never,
        { llm: mockLLM },
      );
    } catch {
      // expected ZodError
    }

    expect(generateObject).not.toHaveBeenCalled();
  });
});

// MARK: - ResearchSubObjectSchema tests

describe("ResearchSubObjectSchema", () => {
  // Case 11: .strict() rejects extra fields at sub-level

  it(".strict() rejects extra field on LLM sub-object", () => {
    expect(() =>
      ResearchSubObjectSchema.parse({
        ...VALID_LLM_SUB_OBJECT,
        extra_field: "should not be here",
      }),
    ).toThrow(ZodError);
  });

  it("accepts valid company + industry sub-object", () => {
    expect(() => ResearchSubObjectSchema.parse(VALID_LLM_SUB_OBJECT)).not.toThrow();
  });
});

// MARK: - computeCacheKey direct tests

describe("computeCacheKey", () => {
  it("returns 16-char hex string", async () => {
    const key = await computeCacheKey(VALID_INPUT);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic — same input gives same key", async () => {
    const key1 = await computeCacheKey(VALID_INPUT);
    const key2 = await computeCacheKey(VALID_INPUT);
    expect(key1).toBe(key2);
  });

  it("changes with different company_name", async () => {
    const key1 = await computeCacheKey(VALID_INPUT);
    const key2 = await computeCacheKey({ ...VALID_INPUT, company_name: "BetaCorp" });
    expect(key1).not.toBe(key2);
  });

  it("changes with different industry_hints", async () => {
    const key1 = await computeCacheKey(VALID_INPUT);
    const key2 = await computeCacheKey({ ...VALID_INPUT, industry_hints: ["FinTech"] });
    expect(key1).not.toBe(key2);
  });

  it("is NOT affected by role_title (matches Python _compute_cache_key behavior)", async () => {
    const key1 = await computeCacheKey(VALID_INPUT);
    const key2 = await computeCacheKey({ ...VALID_INPUT, role_title: "Engineer" });
    expect(key1).toBe(key2);
  });
});

// MARK: - prompts.ts tests

describe("systemPrompt()", () => {
  it('contains "ResearchAgent"', () => {
    expect(systemPrompt()).toContain("ResearchAgent");
  });

  it('contains "company_name"', () => {
    expect(systemPrompt()).toContain("company_name");
  });

  it('contains "role_title"', () => {
    expect(systemPrompt()).toContain("role_title");
  });

  it('contains "industry_hints"', () => {
    expect(systemPrompt()).toContain("industry_hints");
  });

  it('contains "L0 A11" (privacy guard label)', () => {
    expect(systemPrompt()).toContain("L0 A11");
  });

  it('inlines _guardrails.j2: contains "忽略之前的指令"', () => {
    expect(systemPrompt()).toContain("忽略之前的指令");
  });

  it('inlines _guardrails.j2: contains "严格符合目标 schema 的结构化 JSON"', () => {
    expect(systemPrompt()).toContain("严格符合目标 schema 的结构化 JSON");
  });
});

describe("userPrompt()", () => {
  it("includes company_name in output", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain(VALID_INPUT.company_name);
  });

  it("includes role_title in output", () => {
    const content = userPrompt(VALID_INPUT);
    expect(content).toContain(VALID_INPUT.role_title);
  });

  it("hints joined with Chinese 、 separator (2 hints → 1 separator)", () => {
    const content = userPrompt(VALID_INPUT);
    // VALID_INPUT has ["B2C", "SaaS"] → "B2C、SaaS"
    expect(content).toContain("B2C、SaaS");
  });

  it("single hint produces no 、 separator", () => {
    const content = userPrompt({ ...VALID_INPUT, industry_hints: ["SaaS"] });
    expect(content).toContain("SaaS");
    expect(content).not.toContain("、");
  });

  it("3 hints produce 2 、 separators", () => {
    const content = userPrompt({ ...VALID_INPUT, industry_hints: ["A", "B", "C"] });
    // "A、B、C" contains exactly 2 instances of 、
    const separatorCount = (content.match(/、/g) ?? []).length;
    expect(separatorCount).toBe(2);
  });
});

// MARK: - ResearchAgentInputSchema guard tests (redundant with fuzz, explicit for readability)

describe("ResearchAgentInputSchema Layer 1 guard", () => {
  it("accepts valid 3-field input", () => {
    expect(() => ResearchAgentInputSchema.parse(VALID_INPUT)).not.toThrow();
  });

  it("rejects empty industry_hints (min 1)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({ ...VALID_INPUT, industry_hints: [] }),
    ).toThrow(ZodError);
  });

  it("rejects 6 industry_hints (max 5)", () => {
    expect(() =>
      ResearchAgentInputSchema.parse({
        ...VALID_INPUT,
        industry_hints: ["A", "B", "C", "D", "E", "F"],
      }),
    ).toThrow(ZodError);
  });
});
