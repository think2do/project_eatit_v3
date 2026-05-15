// §C1 + §C3: account name locked to "volc-asr-credentials" (Swift
// VolcAsrCreds.apiKey decoded from the Keychain JSON).
// JS never reads the secret back — only saves and probes existence.
//
// 新版控制台单 key 鉴权(2026-05 起):AppID + AccessToken 已合并为单条
// X-Api-Key,一把 key 同时驱动 ASR 与 TTS。文档:
// https://console.volcengine.com/speech/new/setting/apikeys
//
// JSON shape (matching apps/macos/Eatit/Bridge/Models/ASRMessages.swift:VolcAsrCreds):
//   { "apiKey": "...",
//     "resourceId": "..." | undefined,    // optional override of Swift default
//     "endpointPath": "..." | undefined } // optional override of Swift default

import { keychain } from "@/services/keychain";

const KEYCHAIN_ACCOUNT = "volc-asr-credentials";

export interface ASRCredentials {
  apiKey: string;
  /** Optional. Overrides Swift `volc.bigasr.sauc.duration` default. */
  resourceId?: string;
  /** Optional. Overrides Swift default endpoint path
   *  (`/api/v3/sauc/bigmodel_async`).  Path only — host pinned by §A0.3. */
  endpointPath?: string;
}

/** JSON-serialise the creds and write to the macOS Keychain.
 *  Empty/whitespace-only override fields are dropped from the JSON so the
 *  Swift side reliably falls back to its built-in defaults.
 */
export async function saveASRCredentials(creds: ASRCredentials): Promise<void> {
  const payload: Record<string, string> = {
    apiKey: creds.apiKey,
  };
  const trimmedResourceId = creds.resourceId?.trim();
  if (trimmedResourceId) payload.resourceId = trimmedResourceId;
  const trimmedEndpointPath = creds.endpointPath?.trim();
  if (trimmedEndpointPath) payload.endpointPath = trimmedEndpointPath;
  await keychain.save(KEYCHAIN_ACCOUNT, JSON.stringify(payload));
}

/** Returns true when the Keychain has a `volc-asr-credentials` entry. */
export async function hasASRCredentials(): Promise<boolean> {
  try {
    const { exists } = await keychain.exists(KEYCHAIN_ACCOUNT);
    return exists;
  } catch {
    return false;
  }
}

/** Idempotent: succeeds even when nothing is stored. */
export async function deleteASRCredentials(): Promise<void> {
  await keychain.delete(KEYCHAIN_ACCOUNT);
}
