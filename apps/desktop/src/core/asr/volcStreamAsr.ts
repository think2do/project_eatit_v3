// M3.4.1.dev — VolcStreamAsr controller
//
// §K #4: PCM stays in Swift. This file NEVER imports MediaRecorder /
// AudioContext / any browser audio API. Text-only consumption via useASRStream.
// §C3: options MUST NOT accept apiKey / accessToken / appId (credentials live
// in Keychain, injected Swift-side via ASRGateway).
// 反模式 #4: No browser WebSocket to Volc here. Only useASRStream AsyncGenerator.

import { useASRStream } from "@/services/asr";
import type { ASRStreamChunk } from "@/services/asr";

// MARK: - Public API (§4.1 verbatim)

export interface CaptureResult {
  finalText: string;
  startTime?: number;
  endTime?: number;
}

export interface VolcStreamAsrCallbacks {
  onPartial(text: string): void;
  onError?(err: Error): void;
}

export type VolcStreamAsrState =
  | "idle"
  | "capturing"
  | "draining"
  | "done"
  | "errored";

export interface VolcStreamAsrController {
  beginCapture(callbacks: VolcStreamAsrCallbacks): void;
  endCapture(): Promise<CaptureResult>;
  abort(): void;
  readonly state: VolcStreamAsrState;
}

// MARK: - Factory

export function createVolcStreamAsr(
  options?: { enableITN?: boolean; enablePunc?: boolean },
): VolcStreamAsrController {
  let iter: AsyncGenerator<ASRStreamChunk, void, unknown> | null = null;
  let pendingFinal: {
    resolve: (r: CaptureResult) => void;
    reject: (err: Error) => void;
  } | null = null;
  let _state: VolcStreamAsrState = "idle";
  let cachedFinal: CaptureResult | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  async function runLoop(cb: VolcStreamAsrCallbacks): Promise<void> {
    try {
      for await (const chunk of iter!) {
        if (chunk.type === "partial") {
          cb.onPartial(chunk.text);
        } else if (chunk.type === "final") {
          cachedFinal = {
            finalText: chunk.text,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
          };
          if (pendingFinal) {
            _state = "done";
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            pendingFinal.resolve(cachedFinal);
            pendingFinal = null;
            return;
          }
        }
      }
      // Iterator ended without a final being consumed by pendingFinal
      if (pendingFinal) {
        _state = "errored";
        const r = pendingFinal.reject;
        pendingFinal = null;
        r(new Error("asr.no-final-received"));
      } else {
        _state = "done";
      }
    } catch (err) {
      _state = "errored";
      if (pendingFinal) {
        const r = pendingFinal.reject;
        pendingFinal = null;
        r(err as Error);
      }
      cb.onError?.(err as Error);
    }
  }

  const controller: VolcStreamAsrController = {
    get state(): VolcStreamAsrState {
      return _state;
    },

    beginCapture(callbacks: VolcStreamAsrCallbacks): void {
      if (
        _state !== "idle" &&
        _state !== "errored" &&
        _state !== "done"
      ) {
        return;
      }
      _state = "capturing";
      cachedFinal = null;
      pendingFinal = null;
      timeoutId = null;
      iter = useASRStream(options);
      void runLoop(callbacks);
    },

    endCapture(): Promise<CaptureResult> {
      if (_state !== "capturing") {
        return Promise.reject(new Error("asr.not_capturing"));
      }
      _state = "draining";
      // Fast path: final already arrived before endCapture was called
      if (cachedFinal) {
        _state = "done";
        return Promise.resolve(cachedFinal);
      }
      return new Promise<CaptureResult>((resolve, reject) => {
        pendingFinal = { resolve, reject };
        timeoutId = setTimeout(() => {
          if (pendingFinal) {
            _state = "errored";
            const r = pendingFinal.reject;
            pendingFinal = null;
            r(new Error("asr.no-final-received"));
          }
        }, 1500);
        // Triggers useASRStream finally block → audio.stop → asrStop
        void iter!.return(undefined as unknown as void);
      });
    },

    abort(): void {
      if (_state === "done" || _state === "idle") return;
      _state = "errored";
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (pendingFinal) {
        const r = pendingFinal.reject;
        pendingFinal = null;
        r(new Error("asr.aborted"));
      }
      void iter?.return(undefined as unknown as void);
    },
  };

  return controller;
}
