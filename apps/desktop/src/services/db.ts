import { bridge } from "./nativeBridge";
import { z } from "zod";

// §B9: Zod mirrors Swift Codable. Update both in the same commit.
// §A0.4 / §E3: Callers MUST NOT pass ARK_API_KEY / volc-asr-credentials / app-encryption-key
// as `params` values. Secrets stay in Keychain (see services/keychain.ts), never SQLite.

// MARK: - Schemas

export const DBValueSchema = z.union([
  z.null(),
  z.boolean(),
  // Number covers both Int64 (Number.isInteger) and Double on the Swift side.
  z.number(),
  z.string(),
]);
export type DBValue = z.infer<typeof DBValueSchema>;

export const ExecResultSchema = z.object({ rowsAffected: z.number().int() });
export type ExecResult = z.infer<typeof ExecResultSchema>;

// Column values from Swift may be: null, int64 (number), double (number), string, or base64 blob string.
export const RowSchema = z.record(
  z.string(),
  z.union([z.null(), z.number(), z.string(), z.boolean()])
);
export type Row = z.infer<typeof RowSchema>;

export interface TxStatement {
  sql: string;
  params?: DBValue[];
}

// MARK: - db service

export const db = {
  exec: async (sql: string, params: DBValue[] = []): Promise<ExecResult> => {
    const raw = await bridge.call("db.exec", { sql, params });
    return ExecResultSchema.parse(raw);
  },

  query: async (sql: string, params: DBValue[] = []): Promise<Row[]> => {
    const raw = await bridge.call("db.query", { sql, params });
    return z.array(RowSchema).parse(raw);
  },

  tx: async (statements: TxStatement[]): Promise<void> => {
    await bridge.call<void>("db.tx", { statements });
  },
};
