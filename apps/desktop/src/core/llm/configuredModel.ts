// Single source of truth for "which Doubao model do agents call right now?".
// Reads `app_settings.llm-meta.model` (written by SettingsPage / StepLLM via
// saveLLMConfig).  Falls back to FALLBACK_MODEL when:
//   - app_settings has no row yet (fresh install / dev shell)
//   - the bridge is unavailable (vitest / SSR)
//   - the stored value is empty
//
// Cached in-process so each agent invocation is one O(1) memory read instead
// of an SQLite round-trip per turn.  saveLLMConfig / deleteLLMConfig call
// resetConfiguredModelCache() to invalidate.

import { getAppSetting } from "@/api/appSettings";

const FALLBACK_MODEL = "doubao-seed-2-0-lite-260215";

interface LLMMeta {
  model?: string;
  [key: string]: unknown;
}

let cached: string | null = null;

export async function getConfiguredModel(): Promise<string> {
  if (cached) return cached;
  try {
    const meta = await getAppSetting<LLMMeta>("llm-meta");
    const model = meta?.model?.trim();
    cached = model && model.length > 0 ? model : FALLBACK_MODEL;
    return cached;
  } catch {
    return FALLBACK_MODEL;
  }
}

export function resetConfiguredModelCache(): void {
  cached = null;
}

export const __FALLBACK_MODEL = FALLBACK_MODEL;
