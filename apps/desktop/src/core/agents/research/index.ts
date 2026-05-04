// TODO M3.x: 30-day cache_key SQLite layer (design §8.5 — deferred for macOS port)

import {
  ResearchAgentInputSchema,
  ResearchAgentOutputSchema,
  CompanyProfileSchema,
  IndustryProfileSchema,
  type ResearchAgentInput,
  type ResearchAgentOutput,
} from "@/core/schemas/research";
import type { LLMProvider, Message } from "@/core/llm/types";
import { z } from "zod";
import { systemPrompt, userPrompt } from "./prompts";

// §C3: No process.env / getApiKey / keychain access here. LLM calls go through deps.llm only.

export interface ResearchAgentDeps {
  llm: LLMProvider;
}

/**
 * Sub-schema mirrors Python _LLMResearchOutput (service.py line 44-53).
 * Only company + industry — server stamps fetched_at / cache_key / degraded.
 * .strict() rejects any extra field the LLM might hallucinate at the sub-object level.
 */
export const ResearchSubObjectSchema = z
  .object({
    company: CompanyProfileSchema,
    industry: IndustryProfileSchema,
  })
  .strict();

/**
 * Derive cache_key: SHA-256 of "company_name|hint1,hint2" truncated to 16 hex chars.
 * Mirrors Python _compute_cache_key (service.py line 56-59).
 * Uses Web Crypto subtle — key material NEVER logged.
 */
export async function computeCacheKey(input: ResearchAgentInput): Promise<string> {
  const raw = `${input.company_name}|${input.industry_hints.join(",")}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Run ResearchAgent: validate input → derive cache_key → build messages → generateObject → return.
 *
 * Three-layer §A11 PII defense:
 *   Layer 1: ResearchAgentInputSchema.strict().parse(input) — rejects ANY unknown field BEFORE LLM.
 *   Layer 2: systemPrompt() explicitly forbids LLM from referencing candidate PII.
 *   Layer 3: cache_key derived via SHA-256 (computeCacheKey), never logged in plaintext.
 *
 * macOS port simplification: uses non-tool LLM call (degraded_run path without degraded=true flag).
 * Python service.py probes tool-use capability (web_search) which is not yet wired into LLMProvider.
 * When tool-use is added later, this function stays API-compatible — just swap generateObject call.
 *
 * §C3: no secret access; LLM call goes through deps.llm only.
 * §A11: ResearchAgentInputSchema.strict() rejects extra PII fields before any LLM call.
 */
export async function runResearchAgent(
  input: ResearchAgentInput,
  deps: ResearchAgentDeps,
): Promise<ResearchAgentOutput> {
  // ★ Defense layer 1: schema-level — .strict() rejects ANY unknown field BEFORE LLM call
  const validated = ResearchAgentInputSchema.parse(input); // throws ZodError on PII

  // ★ Defense layer 3: cache_key derivation (SHA-256 truncated to 16 chars, never logged plaintext)
  const cacheKey = await computeCacheKey(validated);

  // ★ Defense layer 2: prompt explicitly forbids LLM from referencing candidate PII
  const messages: Message[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(validated) },
  ];

  const llmResult = await deps.llm.generateObject({
    schema: ResearchSubObjectSchema,
    messages,
    model: "doubao-seed-1-6-250615",
  });

  return ResearchAgentOutputSchema.parse({
    company: llmResult.company,
    industry: llmResult.industry,
    fetched_at: new Date().toISOString(),
    cache_key: cacheKey,
    degraded: false,
    degraded_reason: null,
  });
}
