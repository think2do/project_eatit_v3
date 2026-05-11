/**
 * coach-streaming.contract.test.ts — M8.3
 *
 * Validates the streamDraftReadableAnswer streaming contract:
 *   1. chunks are yielded in order (pure delta passthrough)
 *   2. break / iterator.return() cancels the stream (simulated via for-await break)
 *   3. all 4 locked personas are accepted without throwing
 *
 * §A0: no Tauri import.
 * §C3: no secret material; MockStreamLLM fulfills LLMProvider interface.
 * §A0.3: tests only the JS generator boundary — actual ARK SSE is tested
 *         end-to-end in integration; this contract is unit-level.
 */

import { describe, it, expect, vi } from "vitest";
import { streamDraftReadableAnswer } from "@/core/agents/coach";
import type { LLMProvider, ChatChunk, ChatRequest, ChatResponse, Message } from "@/core/llm/types";
import type { z } from "zod";

// ─── Mock LLM ────────────────────────────────────────────────────────────────

class MockStreamLLM implements LLMProvider {
  chat = vi.fn<[ChatRequest], Promise<ChatResponse>>();
  generateObject = vi.fn<
    [{ schema: z.ZodSchema<unknown>; messages: Message[]; model?: string }],
    Promise<unknown>
  >();

  private deltas: string[];

  constructor(deltas: string[]) {
    this.deltas = deltas;
  }

  async *chatStream(): AsyncIterableIterator<ChatChunk> {
    for (const d of this.deltas) {
      yield { content: d };
    }
    yield { finishReason: "stop" };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("streamDraftReadableAnswer — streaming contract", () => {
  it("yields chunks in order", async () => {
    const llm = new MockStreamLLM(["**专业**", "深度", "..."]);
    const out: string[] = [];

    for await (const chunk of streamDraftReadableAnswer(
      { question: "q", persona: "Sarah" },
      { llm },
    )) {
      out.push(chunk);
    }

    expect(out).toEqual(["**专业**", "深度", "..."]);
  });

  it("stops when iterator.return() called (cancel via break)", async () => {
    const llm = new MockStreamLLM(["a", "b", "c", "d", "e", "f"]);
    const collected: string[] = [];

    for await (const chunk of streamDraftReadableAnswer(
      { question: "q", persona: "Sarah" },
      { llm },
    )) {
      collected.push(chunk);
      if (collected.length === 2) break; // simulate cancel
    }

    expect(collected).toHaveLength(2);
  });

  it("persona 4 名锁 — all 4 personas accepted without throw", async () => {
    for (const p of ["Sarah", "Marcus", "Lin", "Daniel"] as const) {
      const llm = new MockStreamLLM(["x"]);
      const iter = streamDraftReadableAnswer({ question: "q", persona: p }, { llm });
      for await (const _ of iter) {
        // drain
      }
    }
  });

  it("yields nothing for empty delta stream (only finishReason)", async () => {
    const llm = new MockStreamLLM([]);
    const out: string[] = [];

    for await (const chunk of streamDraftReadableAnswer(
      { question: "q", persona: "Marcus" },
      { llm },
    )) {
      out.push(chunk);
    }

    expect(out).toHaveLength(0);
  });

  it("does not yield finishReason chunk as text", async () => {
    const llm = new MockStreamLLM(["hello", "world"]);
    const out: string[] = [];

    for await (const chunk of streamDraftReadableAnswer(
      { question: "q", persona: "Lin" },
      { llm },
    )) {
      out.push(chunk);
    }

    // finishReason chunk should NOT appear in the output
    expect(out).toEqual(["hello", "world"]);
    expect(out.every((c) => typeof c === "string")).toBe(true);
  });
});
