export * from "./types";
export * from "./arkProvider";
export * from "./instructor";

import { ArkProvider } from "./arkProvider";

/**
 * Default singleton LLMProvider instance.
 * Uses defaultModel "doubao-seed-2-0-lite-260215" (Doubao Seed 2.0 lite — current default).
 *
 * Callers that need a different model: `new ArkProvider({ defaultModel: "..." })`.
 */
export const llm = new ArkProvider();
