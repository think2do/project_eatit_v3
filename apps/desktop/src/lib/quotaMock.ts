// F-315 quota mock — frontend-only localStorage placeholder.
// L0 A18: backend MUST NOT learn about this. No API/schema/DB touches.
// Replace this file wholesale when commerce wiring lands.

const STORAGE_KEY = "eatit:quota:mock";
const DEFAULT_LIMIT = 10;

export interface QuotaMockState {
  used: number;
  limit: number;
  resetAt: string;
}

function nextMonthFirstUTC(now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)).toISOString();
}

function defaultState(now: Date = new Date()): QuotaMockState {
  return { used: 0, limit: DEFAULT_LIMIT, resetAt: nextMonthFirstUTC(now) };
}

function safeParse(raw: string | null): QuotaMockState | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<QuotaMockState>;
    if (
      typeof obj.used !== "number" ||
      typeof obj.limit !== "number" ||
      typeof obj.resetAt !== "string"
    ) {
      return null;
    }
    return { used: obj.used, limit: obj.limit, resetAt: obj.resetAt };
  } catch {
    return null;
  }
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function write(state: QuotaMockState): QuotaMockState {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // quota / disabled storage — return state as-is
    }
  }
  return state;
}

export function readQuotaMock(now: Date = new Date()): QuotaMockState {
  const storage = getStorage();
  const parsed = storage ? safeParse(storage.getItem(STORAGE_KEY)) : null;
  if (!parsed) return write(defaultState(now));

  // Cross-month auto-reset.
  if (Date.parse(parsed.resetAt) <= now.getTime()) {
    return write({ used: 0, limit: parsed.limit, resetAt: nextMonthFirstUTC(now) });
  }
  return parsed;
}

export function incrementQuotaMock(now: Date = new Date()): QuotaMockState {
  const current = readQuotaMock(now);
  return write({ ...current, used: current.used + 1 });
}

export function resetQuotaMock(now: Date = new Date()): QuotaMockState {
  return write(defaultState(now));
}

export function getRemainingQuotaMock(now: Date = new Date()): number {
  const { used, limit } = readQuotaMock(now);
  return Math.max(0, limit - used);
}

export const __quotaMockInternal = { STORAGE_KEY, DEFAULT_LIMIT };
