// M3.4.1.dev — volcStreamAsr controller tests
//
// Test file location: core/asr/__tests__/ (matches agent convention per spec
// override §8, "Test file location decision").
//
// Mock strategy: vi.mock("@/services/asr") replaces useASRStream with a factory
// that returns manually-controlled AsyncGenerators. No real Bridge calls happen.
//
// §A11 PII: tests inspect text content only for equality assertions; no logging.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVolcStreamAsr } from "../volcStreamAsr";
import type { ASRStreamChunk } from "@/services/asr";

// MARK: - AsyncGenerator factory

// Builds a controllable generator. push()/end()/throwErr() enqueue items.
// The return() spy does NOT enqueue end immediately — it defers after the
// current microtask queue drains, so any queued chunks (including a final
// that was pushed before return() is called) are consumed first.
//
// This mirrors real behavior: useASRStream.return() triggers audio.stop →
// asrStop (both async), and Volc may emit the final before the WS actually
// closes. The queue acts as that in-flight window.
function makeControllableGenerator(): {
  gen: AsyncGenerator<ASRStreamChunk, void, unknown>;
  push: (chunk: ASRStreamChunk) => void;
  end: () => void;
  throwErr: (err: Error) => void;
  returnSpy: ReturnType<typeof vi.fn>;
} {
  type QueueItem =
    | { kind: "chunk"; value: ASRStreamChunk }
    | { kind: "end" }
    | { kind: "error"; error: Error };

  const queue: QueueItem[] = [];
  let pendingResolve: (() => void) | null = null;

  const wake = () => {
    const r = pendingResolve;
    pendingResolve = null;
    r?.();
  };

  const returnSpy = vi.fn(async () => {
    // Enqueue end AFTER current synchronous work, so any already-queued items
    // (e.g. a final chunk that was pushed just before endCapture() called return())
    // are processed first by runLoop.
    await Promise.resolve();
    queue.push({ kind: "end" });
    wake();
    return { value: undefined as void, done: true as const };
  });

  const gen = {
    [Symbol.asyncIterator]() {
      return gen;
    },
    async next(): Promise<IteratorResult<ASRStreamChunk, void>> {
      while (queue.length === 0) {
        await new Promise<void>((resolve) => {
          pendingResolve = resolve;
        });
      }
      const item = queue.shift()!;
      if (item.kind === "chunk") return { value: item.value, done: false };
      if (item.kind === "error") throw item.error;
      return { value: undefined, done: true };
    },
    return: returnSpy,
    throw: vi.fn(async (err: unknown) => {
      throw err;
    }),
  } as unknown as AsyncGenerator<ASRStreamChunk, void, unknown>;

  return {
    gen,
    push: (chunk: ASRStreamChunk) => {
      queue.push({ kind: "chunk", value: chunk });
      wake();
    },
    end: () => {
      queue.push({ kind: "end" });
      wake();
    },
    throwErr: (err: Error) => {
      queue.push({ kind: "error", error: err });
      wake();
    },
    returnSpy,
  };
}

// Flush microtask queue several levels deep.
// Does NOT use setTimeout to avoid interference with fake-timer tests.
const flushMicrotasks = () =>
  Promise.resolve()
    .then(() => Promise.resolve())
    .then(() => Promise.resolve())
    .then(() => Promise.resolve());

// MARK: - Mocks

vi.mock("@/services/asr", () => ({
  useASRStream: vi.fn(),
}));

import { useASRStream } from "@/services/asr";
const mockUseASRStream = vi.mocked(useASRStream);

beforeEach(() => {
  mockUseASRStream.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// MARK: - Test cases

describe("createVolcStreamAsr", () => {
  // Case 1: happy path — 3 partials → final in queue → endCapture resolves
  it("happy path: 3 partials, final queued before endCapture, resolves with CaptureResult", async () => {
    const ctrl = makeControllableGenerator();
    mockUseASRStream.mockReturnValue(ctrl.gen);

    const controller = createVolcStreamAsr();
    expect(controller.state).toBe("idle");

    const onPartial = vi.fn();
    controller.beginCapture({ onPartial });
    expect(controller.state).toBe("capturing");

    // Yield 3 partials
    ctrl.push({ type: "partial", text: "你" });
    await flushMicrotasks();
    ctrl.push({ type: "partial", text: "你好" });
    await flushMicrotasks();
    ctrl.push({ type: "partial", text: "你好世界" });
    await flushMicrotasks();

    expect(onPartial).toHaveBeenCalledTimes(3);
    expect(onPartial.mock.calls.map((c) => c[0])).toEqual([
      "你",
      "你好",
      "你好世界",
    ]);

    // Push final into the queue BEFORE endCapture calls return()
    // (mimics Volc sending the final before WS is closed)
    ctrl.push({ type: "final", text: "你好世界。", startTime: 100, endTime: 1500 });
    // endCapture() → draining → calls iter.return() (async via spy)
    // The final is already in the queue; runLoop drains it before end sentinel arrives
    const endPromise = controller.endCapture();
    expect(controller.state).toBe("draining");

    const result = await endPromise;
    expect(result.finalText).toBe("你好世界。");
    expect(result.startTime).toBe(100);
    expect(result.endTime).toBe(1500);
    expect(controller.state).toBe("done");
  });

  // Case 2: partial replace semantic — each call REPLACES previous, not appends
  it("partial replace semantic: onPartial calls carry exact texts (no concatenation)", async () => {
    const ctrl = makeControllableGenerator();
    mockUseASRStream.mockReturnValue(ctrl.gen);

    const controller = createVolcStreamAsr();
    const onPartial = vi.fn();
    controller.beginCapture({ onPartial });

    const partials = ["A", "AB", "ABC", "ABCD"];
    for (const text of partials) {
      ctrl.push({ type: "partial", text });
      await flushMicrotasks();
    }

    // Assert exact array equality — no concatenation
    expect(onPartial.mock.calls.map((c) => c[0])).toEqual(partials);
    // Second call must be "AB", not "AAB"
    expect(onPartial.mock.calls[1][0]).toBe("AB");

    ctrl.end();
    await flushMicrotasks();
  });

  // Case 3: error during capture — onError called; state = errored; endCapture rejects
  it("error during capture: onError fires, state=errored, endCapture rejects not_capturing", async () => {
    const ctrl = makeControllableGenerator();
    mockUseASRStream.mockReturnValue(ctrl.gen);

    const controller = createVolcStreamAsr();
    const onPartial = vi.fn();
    const onError = vi.fn();
    controller.beginCapture({ onPartial, onError });

    ctrl.push({ type: "partial", text: "first" });
    await flushMicrotasks();
    ctrl.push({ type: "partial", text: "second" });
    await flushMicrotasks();

    expect(onPartial).toHaveBeenCalledTimes(2);

    const captureError = new Error("asr bridge failure");
    ctrl.throwErr(captureError);
    await flushMicrotasks();

    expect(controller.state).toBe("errored");
    expect(onError).toHaveBeenCalledWith(captureError);

    // endCapture after errored state should reject with not_capturing
    const err = await controller.endCapture().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("asr.not_capturing");
  });

  // Case 4: abort during capture — iterator.return triggered; state = errored
  it("abort during capture: state=errored, iterator.return called", async () => {
    const ctrl = makeControllableGenerator();
    mockUseASRStream.mockReturnValue(ctrl.gen);

    const controller = createVolcStreamAsr();
    const onPartial = vi.fn();
    controller.beginCapture({ onPartial });

    ctrl.push({ type: "partial", text: "hello" });
    await flushMicrotasks();

    controller.abort();
    expect(controller.state).toBe("errored");
    expect(ctrl.returnSpy).toHaveBeenCalled();

    ctrl.end();
    await flushMicrotasks();
  });

  // Case 5: endCapture without beginCapture — rejects "asr.not_capturing" (Promise, not throw)
  it("endCapture without beginCapture: returns rejected Promise (not synchronous throw)", async () => {
    const controller = createVolcStreamAsr();
    expect(controller.state).toBe("idle");

    // Must return a rejected Promise, not throw synchronously
    let didThrow = false;
    let promise: Promise<unknown>;
    try {
      promise = controller.endCapture();
    } catch {
      didThrow = true;
      promise = Promise.reject(new Error("synchronous throw"));
    }
    expect(didThrow).toBe(false);
    expect(promise!).toBeInstanceOf(Promise);

    const err = await promise!.catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("asr.not_capturing");
  });

  // Case 6: endCapture after done — rejects "asr.not_capturing"
  it("endCapture after done: rejects asr.not_capturing", async () => {
    const ctrl = makeControllableGenerator();
    mockUseASRStream.mockReturnValue(ctrl.gen);

    const controller = createVolcStreamAsr();
    controller.beginCapture({ onPartial: vi.fn() });

    // Final arrives before endCapture → fast path (cachedFinal)
    ctrl.push({ type: "final", text: "done text" });
    await flushMicrotasks();

    const result = await controller.endCapture();
    expect(result.finalText).toBe("done text");
    expect(controller.state).toBe("done");

    // Second endCapture should reject
    const err = await controller.endCapture().catch((e) => e);
    expect((err as Error).message).toBe("asr.not_capturing");
  });

  // Case 7: 1500ms timeout — endCapture never gets final → rejects "asr.no-final-received"
  it("1500ms timeout: no final received → rejects asr.no-final-received", async () => {
    vi.useFakeTimers();
    try {
      const ctrl = makeControllableGenerator();
      mockUseASRStream.mockReturnValue(ctrl.gen);

      const controller = createVolcStreamAsr();
      controller.beginCapture({ onPartial: vi.fn() });

      // Attach .catch() BEFORE advancing timers so the rejection is handled immediately
      let capturedErr: Error | null = null;
      const endPromise = controller.endCapture().catch((e: Error) => {
        capturedErr = e;
      });
      expect(controller.state).toBe("draining");

      // Advance fake timers by 1500ms without yielding a final
      await vi.advanceTimersByTimeAsync(1500);
      await endPromise;

      expect(capturedErr).toBeInstanceOf(Error);
      expect(capturedErr!.message).toBe("asr.no-final-received");
      expect(controller.state).toBe("errored");
    } finally {
      vi.useRealTimers();
    }
  });

  // Case 8: final-already-cached fast path — final arrives BEFORE endCapture is called
  it("cached final fast path: final arrives before endCapture → resolves immediately", async () => {
    const ctrl = makeControllableGenerator();
    mockUseASRStream.mockReturnValue(ctrl.gen);

    const controller = createVolcStreamAsr();
    controller.beginCapture({ onPartial: vi.fn() });

    // Yield final before calling endCapture
    ctrl.push({ type: "final", text: "early final", startTime: 0, endTime: 800 });
    await flushMicrotasks();

    // Now call endCapture — cachedFinal is set, so resolves from fast path
    const result = await controller.endCapture();
    expect(result.finalText).toBe("early final");
    expect(result.startTime).toBe(0);
    expect(result.endTime).toBe(800);
    expect(controller.state).toBe("done");
  });

  // Case 9: options propagation — useASRStream called with provided options
  it("options propagation: useASRStream called with enableITN + enablePunc", async () => {
    const ctrl = makeControllableGenerator();
    mockUseASRStream.mockReturnValue(ctrl.gen);

    const controller = createVolcStreamAsr({ enableITN: true, enablePunc: false });
    controller.beginCapture({ onPartial: vi.fn() });

    expect(mockUseASRStream).toHaveBeenCalledWith({
      enableITN: true,
      enablePunc: false,
    });

    ctrl.end();
    await flushMicrotasks();
  });

  // Case 10: state transitions idle→capturing→draining→done (via fast path)
  it("state machine: idle → capturing → draining → done (cached-final path)", async () => {
    const ctrl = makeControllableGenerator();
    mockUseASRStream.mockReturnValue(ctrl.gen);

    const controller = createVolcStreamAsr();
    expect(controller.state).toBe("idle");

    controller.beginCapture({ onPartial: vi.fn() });
    expect(controller.state).toBe("capturing");

    // Cache the final before endCapture
    ctrl.push({ type: "final", text: "state test" });
    await flushMicrotasks();

    const endPromise = controller.endCapture();
    expect(controller.state).toBe("done"); // fast path resolves synchronously

    await endPromise;
    expect(controller.state).toBe("done");
  });

  // Case 11: state transitions idle→capturing→errored (via abort)
  it("state machine: idle → capturing → errored (via abort)", async () => {
    const ctrl = makeControllableGenerator();
    mockUseASRStream.mockReturnValue(ctrl.gen);

    const controller = createVolcStreamAsr();
    expect(controller.state).toBe("idle");

    controller.beginCapture({ onPartial: vi.fn() });
    expect(controller.state).toBe("capturing");

    controller.abort();
    expect(controller.state).toBe("errored");

    ctrl.end();
    await flushMicrotasks();
  });

  // Case 12: abort from idle is a no-op; state stays idle
  it("abort from idle is no-op; state stays idle", () => {
    const controller = createVolcStreamAsr();
    expect(controller.state).toBe("idle");
    controller.abort(); // must not throw
    expect(controller.state).toBe("idle");
  });

  // Case 13: controller is reusable after errored state
  it("controller reusable after errored: beginCapture re-enters capturing", async () => {
    const ctrl1 = makeControllableGenerator();
    const ctrl2 = makeControllableGenerator();
    mockUseASRStream
      .mockReturnValueOnce(ctrl1.gen)
      .mockReturnValueOnce(ctrl2.gen);

    const controller = createVolcStreamAsr();
    const onPartial1 = vi.fn();
    controller.beginCapture({ onPartial: onPartial1 });
    controller.abort();
    expect(controller.state).toBe("errored");

    const onPartial2 = vi.fn();
    controller.beginCapture({ onPartial: onPartial2 });
    expect(controller.state).toBe("capturing");

    ctrl2.push({ type: "partial", text: "reused" });
    await flushMicrotasks();

    expect(onPartial2).toHaveBeenCalledWith("reused");

    ctrl2.end();
    await flushMicrotasks();
  });
});
