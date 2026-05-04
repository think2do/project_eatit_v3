import { z } from "zod";
import type { ChatRequest, ChatResponse, Message } from "./types";

// §K anti-pattern: this module NEVER calls ai@4's generateObject —
// that function expects a fetch-based provider object, incompatible with our Bridge wrapper.
// We implement the Instructor-equivalent pattern directly per architect spec line 1547-1557.

/**
 * Template appended as a user message when Zod validation or JSON parse fails.
 * Exported so tests can assert exact message text (spec acceptance).
 */
export const INSTRUCTOR_VALIDATION_ERROR_TEMPLATE =
  "Validation error: {error}. Please correct and re-emit JSON only.";

/**
 * generateObjectWithRetry — Instructor-equivalent structured output with retry-on-validation-fail.
 *
 * Strategy per architect spec line 1547-1557:
 *   1. Call provider.chat() with response_format: {type: "json_object"}.
 *   2. JSON.parse res.content; if parse fails, feed error back as user message, retry.
 *   3. schema.safeParse(parsed); if invalid, feed ZodError back as user message, retry.
 *   4. On success: return parsed.data.
 *   5. After maxAttempts: throw last error.
 *
 * @param provider   Any object exposing chat() — allows use without a full LLMProvider instance.
 * @param params     schema + initial messages + optional model override.
 * @param options    maxAttempts defaults to 3.
 */
export async function generateObjectWithRetry<T>(
  provider: { chat: (req: ChatRequest) => Promise<ChatResponse> },
  params: {
    schema: z.ZodSchema<T>;
    messages: Message[];
    model?: string;
  },
  options: { maxAttempts?: number } = {}
): Promise<T> {
  const { schema, model } = params;
  const maxAttempts = options.maxAttempts ?? 3;

  let messages = [...params.messages];
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const req: ChatRequest = {
      model: model ?? "doubao-seed-1-6-250615",
      messages,
      response_format: { type: "json_object" },
    };

    const res = await provider.chat(req);

    if (res.content == null) {
      throw new Error("LLM returned null content; expected JSON");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(res.content);
    } catch (parseErr) {
      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      const feedback = INSTRUCTOR_VALIDATION_ERROR_TEMPLATE.replace("{error}", errMsg);
      lastError = new Error(errMsg);
      messages = [...messages, { role: "user", content: feedback }];
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data;

    const zodMsg = result.error.message;
    const feedback = INSTRUCTOR_VALIDATION_ERROR_TEMPLATE.replace("{error}", zodMsg);
    lastError = result.error;
    messages = [...messages, { role: "user", content: feedback }];
  }

  throw lastError ?? new Error("generateObjectWithRetry failed");
}
