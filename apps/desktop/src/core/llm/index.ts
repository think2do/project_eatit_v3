export * from "./types";
export * from "./arkProvider";
export * from "./instructor";

import { ArkProvider } from "./arkProvider";

/**
 * Default singleton LLMProvider instance.
 * Uses defaultModel "doubao-seed-1-6-250615" (architect §M2.7 recommendation).
 *
 * Callers that need a different model: `new ArkProvider({ defaultModel: "..." })`.
 */
export const llm = new ArkProvider();
