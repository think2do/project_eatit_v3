// v3.4 — axios removed. All settings are persisted to the local `app_settings`
// SQLite table via the db Bridge (§B9 dual-contract: Swift GRDB + Zod schema).
//
// §A0.4 reminder: NEVER pass ARK_API_KEY / volc-asr-credentials /
// app-encryption-key as `params` here. Secrets live in Keychain only.
import { db } from "@/services/db";

export interface AppSettingValue<T = unknown> {
  value: T;
}

/**
 * Reads a value from the `app_settings` table.
 * Returns null when the key has no row (equivalent to the old HTTP 404 behaviour).
 * Any db / bridge error is re-thrown so the caller can surface it.
 *
 * The `value` column stores JSON text (matching the Python sa.JSON() backend).
 * We JSON.parse it back to T; callers must use compatible JSON-serialisable types.
 */
export async function getAppSetting<T = unknown>(key: string): Promise<T | null> {
  const rows = await db.query(
    "SELECT value FROM app_settings WHERE key = ?",
    [key],
  );
  if (rows.length === 0) return null;
  return JSON.parse(rows[0].value as string) as T;
}

/**
 * Upserts a value into the `app_settings` table (INSERT … ON CONFLICT DO UPDATE).
 * Returns the value that was written — identical to what the old HTTP PUT returned.
 *
 * `value` is JSON-serialised before storage to match the TEXT column contract.
 */
export async function putAppSetting<T>(key: string, value: T): Promise<T> {
  await db.exec(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), new Date().toISOString()],
  );
  return value;
}
