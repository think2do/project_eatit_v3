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
  // Latest partial text — used as fallback "final" if user stops mid-sentence
  // and Volc never marks the trailing utterance as definite. result.text is
  // always cumulative, so the latest partial IS a valid full transcript.
  let latestPartialText: string = "";
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Volc Seed ASR 2.0 server sends `result.text` as the FULL CUMULATIVE
  // transcript on every frame (not deltas). The Swift ASRGateway emits one
  // event per frame using that text. So each chunk.text we receive is already
  // the complete transcript so far — just track the latest, no accumulation.
  // (Earlier accumulation attempt produced the "我这边叫丁诗轩 repeated 10x"
  // catastrophe because we were re-adding the same prefix on every frame.)

  async function runLoop(cb: VolcStreamAsrCallbacks): Promise<void> {
    try {
      for await (const chunk of iter!) {
        if (chunk.type === "partial") {
          latestPartialText = chunk.text;
          cb.onPartial(chunk.text);
        } else if (chunk.type === "final") {
          latestPartialText = chunk.text;  // a final is also our latest text
          cachedFinal = {
            finalText: chunk.text,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
          };
          // Don't resolve pendingFinal on every final — server may keep
          // sending incremental updates (interim definites, then more
          // partials for the next segment). Wait for iterator to end
          // (last_packet drain / server close).
        }
      }
      // Iterator ended (last_packet drain complete OR server close).
      // Three cases:
      //   1. We have cachedFinal → resolve with it
      //   2. We have only latestPartialText (server never sent definite) →
      //      resolve with it as the answer (it's the cumulative transcript)
      //   3. Truly empty session → reject no-final-received
      if (pendingFinal) {
        const finalResult = cachedFinal ?? (latestPartialText.length > 0
          ? { finalText: latestPartialText, startTime: undefined, endTime: undefined }
          : null);
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        if (finalResult !== null) {
          _state = "done";
          pendingFinal.resolve(finalResult);
          pendingFinal = null;
        } else {
          _state = "errored";
          const r = pendingFinal.reject;
          pendingFinal = null;
          r(new Error("asr.no-final-received"));
        }
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
      latestPartialText = "";
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
        // Bumped 1500 → 3500ms to give the server enough drain budget after
        // we send last_packet (Swift disconnect waits 1s + server may emit
        // 5~20 finals over the next 500ms~1s for long answers).
        timeoutId = setTimeout(() => {
          if (pendingFinal) {
            // Resolve with whatever we have: prefer cachedFinal (server-marked
            // definite); otherwise use the latest partial (still cumulative
            // and complete per Volc's wire format). Only reject if BOTH are
            // empty — meaning user spoke literally nothing.
            const finalResult = cachedFinal ?? (latestPartialText.length > 0
              ? { finalText: latestPartialText, startTime: undefined, endTime: undefined }
              : null);
            if (finalResult !== null) {
              _state = "done";
              const r = pendingFinal.resolve;
              pendingFinal = null;
              r(finalResult);
            } else {
              _state = "errored";
              const r = pendingFinal.reject;
              pendingFinal = null;
              r(new Error("asr.no-final-received"));
            }
          }
        }, 3500);
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
