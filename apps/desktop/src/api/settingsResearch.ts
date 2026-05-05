// v3.4 — axios removed. Research opt-in is stored in the shared `app_settings`
// table under key "research_opt_in_enabled", reusing the db CRUD pattern
// established in appSettings.ts (§B9 Bridge dual-contract).
//
// Absence of a row → enabled: false (equivalent to the old HTTP 204 default).
import { getAppSetting, putAppSetting } from "@/api/appSettings";

export interface ResearchOptInState {
  enabled: boolean;
}

export async function getResearchOptIn(): Promise<ResearchOptInState> {
  const v = await getAppSetting<boolean>("research_opt_in_enabled");
  return { enabled: v ?? false };
}

export async function setResearchOptIn(
  enabled: boolean,
): Promise<ResearchOptInState> {
  await putAppSetting<boolean>("research_opt_in_enabled", enabled);
  return { enabled };
}
