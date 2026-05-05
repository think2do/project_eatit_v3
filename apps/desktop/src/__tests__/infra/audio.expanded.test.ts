/**
 * infra/audio.expanded — M5.2.c
 *
 * Augments services/__tests__/audio.test.ts (6 tests) with boundary and
 * edge-case tests NOT already covered.
 *
 * Existing coverage: start happy path, stop happy path, permission-denied BridgeError,
 *   engine-start-failed BridgeError, start sends correct streamId, §C3 shape contract.
 *
 * Added here (no duplication):
 *   - stop() propagates BridgeError (audio.stop-failed)
 *   - start() propagates bridge.handler-not-installed
 *   - stop() propagates bridge.handler-not-installed
 *   - stop() sends method='audio.stop' with empty params {}
 *   - audio.already-recording BridgeError on double-start
 *   - bridge envelope id is a UUID string (not empty)
 *   - audio.invalid-stream-id BridgeError propagation
 *
 * §A0: no Tauri.
 * §C3: no PCM over Bridge — audio service is start/stop only.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { audio } from "../../services/audio";
import { BridgeError } from "../../services/nativeBridge";

const UUID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UUID2 = "c50e8400-e29b-41d4-a716-446655440000";
const UUID3 = "cba7b810-9dad-41d1-80b4-00c04fd430c8";

describe("infra/audio.expanded — stop() error paths", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stop() propagates BridgeError on audio.stop-failed", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID,
        ok: false,
        error: { code: "audio.stop-failed", message: "engine not started" },
      });

    const err = await audio.stop().catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("audio.stop-failed");
  });

  it("start() propagates bridge.handler-not-installed when webkit missing", async () => {
    delete (window as unknown as Record<string, unknown>).webkit;
    const err = await audio.start("stream-x").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.handler-not-installed");
  });

  it("stop() propagates bridge.handler-not-installed when webkit missing", async () => {
    delete (window as unknown as Record<string, unknown>).webkit;
    const err = await audio.stop().catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.handler-not-installed");
  });

  it("start() BridgeError audio.already-recording propagated (double-start prevention)", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID2);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID2,
        ok: false,
        error: { code: "audio.already-recording", message: "AVAudioEngine already running" },
      });

    const err = await audio.start("stream-double").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("audio.already-recording");
  });
});

describe("infra/audio.expanded — bridge envelope assertions", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stop() sends method='audio.stop' with empty params object {}", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID3);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID3, ok: true, data: {} });

    await audio.stop();

    expect(mockPost).toHaveBeenCalledWith({
      id: UUID3,
      method: "audio.stop",
      params: {},
    });
  });

  it("bridge envelope id is a non-empty string (UUID format)", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID, ok: true, data: {} });

    await audio.start("stream-id-check");

    const calledWith = mockPost.mock.calls[0][0] as { id: string; method: string; params: unknown };
    expect(typeof calledWith.id).toBe("string");
    expect(calledWith.id.length).toBeGreaterThan(0);
    expect(calledWith.id).toBe(UUID);
  });

  it("start() with long streamId string (64 chars) succeeds without truncation", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID2);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID2, ok: true, data: {} });

    const longId = "a".repeat(64);
    await audio.start(longId);

    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({ params: { streamId: longId } })
    );
  });

  it("audio.invalid-stream-id BridgeError propagated correctly", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID3);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID3,
        ok: false,
        error: { code: "audio.invalid-stream-id", message: "streamId must not be empty" },
      });

    const err = await audio.start("").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("audio.invalid-stream-id");
  });
});
