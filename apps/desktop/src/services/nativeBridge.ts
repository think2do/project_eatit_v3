import { z } from "zod";

// §B9 dual-end contract: Swift Codable + Zod schemas must be updated in the same commit.
// §C3: response.data MUST NOT contain secret material — handler-side discipline.
//      KeychainService (M2.2) returns { exists: bool }, never the secret itself.

// MARK: - BridgeResponse schema (discriminated union on `ok`)

export const BridgeResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    id: z.string(),
    ok: z.literal(true),
    data: z.unknown(),
  }),
  z.object({
    id: z.string(),
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);
export type BridgeResponse = z.infer<typeof BridgeResponseSchema>;

// MARK: - BridgeEvent schema

export const BridgeEventSchema = z.object({
  type: z.enum(["stream-chunk", "asr-partial", "asr-final", "asr-end", "file-dropped"]),
  streamId: z.string(),
  payload: z.unknown(),
});
export type BridgeEvent = z.infer<typeof BridgeEventSchema>;

// MARK: - BridgeError

export class BridgeError extends Error {
  readonly code: string;
  readonly originalMessage: string;
  constructor(payload: { code: string; message: string }) {
    super(`[${payload.code}] ${payload.message}`);
    this.name = "BridgeError";
    this.code = payload.code;
    this.originalMessage = payload.message;
  }
}

// MARK: - WKWebView type augmentation

interface NativePostMessage {
  postMessage(payload: unknown): Promise<unknown>;
}

declare global {
  interface Window {
    webkit?: { messageHandlers?: { eatit?: NativePostMessage } };
    eatitBridge?: { dispatch?: (event: unknown) => void };
  }
}

// MARK: - NativeBridge

type EventHandler = (event: BridgeEvent) => void;

class NativeBridge {
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();

  constructor() {
    if (typeof window !== "undefined") {
      // Wire dispatch hook so Swift can push events via evaluateJavaScript.
      window.eatitBridge = window.eatitBridge ?? {};
      window.eatitBridge.dispatch = (raw: unknown) => {
        const event = BridgeEventSchema.parse(raw);
        for (const h of this.eventHandlers.get(event.type) ?? []) h(event);
      };
    }
  }

  async call<R = unknown>(method: string, params: unknown = {}): Promise<R> {
    const handler = window?.webkit?.messageHandlers?.eatit;
    if (!handler) {
      throw new BridgeError({
        code: "bridge.handler-not-installed",
        message:
          "window.webkit.messageHandlers.eatit unavailable (not running in WKWebView?)",
      });
    }
    const id = crypto.randomUUID();
    const reply = await handler.postMessage({ id, method, params });
    const parsed = BridgeResponseSchema.parse(reply);
    if (!parsed.ok) throw new BridgeError(parsed.error);
    return parsed.data as R;
  }

  on(eventType: BridgeEvent["type"], handler: EventHandler): () => void {
    let set = this.eventHandlers.get(eventType);
    if (!set) {
      set = new Set();
      this.eventHandlers.set(eventType, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }
}

export const bridge = new NativeBridge();
