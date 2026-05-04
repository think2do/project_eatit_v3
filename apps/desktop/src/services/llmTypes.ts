import { z } from "zod";

// §B9 dual-end contract: JS Zod schemas + Swift Codable structs updated in the same commit.
// §C / §A0.4: Pure type layer — no network calls, no Keychain access.
// Fields use snake_case to match ARK / OpenAI compat body directly (§4.3 decision).

// MARK: - ToolCall (forward-referenced by ChatMessage)

export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(), // JSON-encoded string per OpenAI compat
  }),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

// MARK: - ChatMessage

export const ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().nullable().optional(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// MARK: - ResponseFormat

export const ResponseFormatSchema = z.object({
  type: z.enum(["text", "json_object"]),
});
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

// MARK: - ToolDef + ToolChoice

export const ToolDefSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.unknown(), // JSONSchema (not validated here)
  }),
});
export type ToolDef = z.infer<typeof ToolDefSchema>;

export const ToolChoiceSchema = z.union([
  z.literal("auto"),
  z.literal("none"),
  z.object({
    type: z.literal("function"),
    function: z.object({ name: z.string() }),
  }),
]);
export type ToolChoice = z.infer<typeof ToolChoiceSchema>;

// MARK: - ChatCompletionRequest (snake_case body fields per ARK / OpenAI compat)

export const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema),
  stream: z.boolean(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  max_tokens: z.number().int().positive().optional(),
  stop: z.array(z.string()).optional(),
  tools: z.array(ToolDefSchema).optional(),
  tool_choice: ToolChoiceSchema.optional(),
  response_format: ResponseFormatSchema.optional(),
});
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

// MARK: - Usage

export const UsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof UsageSchema>;

// MARK: - ChatChoice + ChatCompletionResponse

export const ChatChoiceSchema = z.object({
  index: z.number().int().nonnegative(),
  message: ChatMessageSchema,
  finish_reason: z.string().nullable().optional(),
});
export type ChatChoice = z.infer<typeof ChatChoiceSchema>;

export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(ChatChoiceSchema),
  usage: UsageSchema.optional(),
});
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;

// MARK: - SSE chunk types

export const ToolCallDeltaSchema = z.object({
  index: z.number().int().optional(),
  id: z.string().optional(),
  type: z.string().optional(),
  function: z
    .object({
      name: z.string().optional(),
      arguments: z.string().optional(),
    })
    .optional(),
});
export type ToolCallDelta = z.infer<typeof ToolCallDeltaSchema>;

export const ChatChunkDeltaSchema = z.object({
  role: z.string().optional(),
  content: z.string().optional(),
  tool_calls: z.array(ToolCallDeltaSchema).optional(),
});
export type ChatChunkDelta = z.infer<typeof ChatChunkDeltaSchema>;

export const ChatChunkChoiceSchema = z.object({
  index: z.number().int().nonnegative(),
  delta: ChatChunkDeltaSchema,
  finish_reason: z.string().nullable().optional(),
});
export type ChatChunkChoice = z.infer<typeof ChatChunkChoiceSchema>;

export const ChatChunkSchema = z.object({
  id: z.string(),
  choices: z.array(ChatChunkChoiceSchema),
  usage: UsageSchema.optional(),
});
export type ChatChunk = z.infer<typeof ChatChunkSchema>;
