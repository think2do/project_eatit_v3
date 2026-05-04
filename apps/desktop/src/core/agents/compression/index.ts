import {
  CompressionAgentInputSchema,
  CompressionAgentOutputSchema,
  type CompressionAgentInput,
  type CompressionAgentOutput,
} from "@/core/schemas/turns";
import type { LLMProvider, Message } from "@/core/llm/types";
import { systemPrompt, userPrompt } from "./prompts";

/** ★ Spec line 1684 ★ — 3s hard timeout per Python COMPRESSION_TIMEOUT_SECONDS = 3.0 */
export const COMPRESSION_TIMEOUT_MS = 3000;

// Minimal logger interface — inline for M3.2.3; can migrate to shared utility later.
interface Logger {
  warn(msg: string, ...args: unknown[]): void;
}

export interface CompressionAgentDeps {
  llm: LLMProvider;
  logger?: Logger;
}

/**
 * Deterministic, no-LLM summary from the last 2 turns.
 * Used when LLM call exceeds COMPRESSION_TIMEOUT_MS.
 * preserved_keywords + open_threads are always [] so downstream can detect degraded state.
 * Translated from Python _degraded_summary() in apps/api/app/agents/compression/service.py.
 */
export function degradedSummary(input: CompressionAgentInput): CompressionAgentOutput {
  const tail = input.turns.slice(-2);
  let text: string;
  if (tail.length === 0) {
    text = "（本次压缩未生成:无对话可压缩）";
  } else {
    const lines = tail.map((t, i) => `Q${i}: ${t.question} / A${i}: ${t.answer}`);
    text = "压缩超时,降级保留最近两轮原文:\n" + lines.join("\n");
  }
  return { summary: text, preserved_keywords: [], open_threads: [] };
}

/**
 * Run CompressionAgent: validate input → build messages → race LLM vs 3s timeout → return output.
 * On timeout: returns degradedSummary(input) — NEVER throws (spec line 1684).
 * On LLM error (network / validation): propagates as Error — different failure mode from timeout.
 *
 * ★ Promise.race + AbortController per spec line 1684 ★
 * (asyncio.wait_for 3s → Promise.race + AbortController translation pattern)
 *
 * §A0.4 + §C: No secret access; LLM call goes through deps.llm (ArkProvider → Swift Bridge → Keychain).
 * §A11 privacy: turn Q/A are user-provided text inputs only; agent layer reads no secrets.
 */
export async function runCompressionAgent(
  input: CompressionAgentInput,
  deps: CompressionAgentDeps,
): Promise<CompressionAgentOutput> {
  const validated = CompressionAgentInputSchema.parse(input);

  const messages: Message[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(validated) },
  ];

  // ★ Promise.race + AbortController per spec line 1684 ★
  const controller = new AbortController();
  const timeoutSentinel = Symbol("compression_timeout");

  const timeoutPromise = new Promise<typeof timeoutSentinel>((resolve) => {
    setTimeout(() => {
      controller.abort();
      resolve(timeoutSentinel);
    }, COMPRESSION_TIMEOUT_MS);
  });

  const llmPromise = deps.llm.generateObject({
    schema: CompressionAgentOutputSchema,
    messages,
    model: "doubao-seed-1-6-250615",
    // TODO M3.x: pass `signal: controller.signal` once LLMProvider.generateObject
    // supports AbortSignal — for now, AbortController only halts the timeoutPromise
    // side; the LLM call's result is dropped if it loses the race.
  });

  const result = await Promise.race([llmPromise, timeoutPromise]);

  if (result === timeoutSentinel) {
    deps.logger?.warn("compression_agent_timeout", {
      turn_count: validated.turns.length,
      timeout_ms: COMPRESSION_TIMEOUT_MS,
    });
    return degradedSummary(validated);
  }

  return result;
}
