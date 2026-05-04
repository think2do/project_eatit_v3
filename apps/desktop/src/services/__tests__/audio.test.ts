import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { audio } from "../audio";
import { BridgeError } from "../nativeBridge";

const UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("audio service", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: {
        eatit: { postMessage: vi.fn() },
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("start() happy path resolves without throwing", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID, ok: true, data: {} });

    await expect(audio.start("stream-1")).resolves.not.toThrow();
  });

  it("stop() happy path resolves without throwing", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID, ok: true, data: {} });

    await expect(audio.stop()).resolves.not.toThrow();
  });

  it("start() throws BridgeError on audio.permission-denied", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: false,
      error: { code: "audio.permission-denied", message: "microphone permission denied" },
    });

    const err = await audio.start("stream-1").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("audio.permission-denied");
  });

  it("start() throws BridgeError on audio.engine-start-failed", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: false,
      error: { code: "audio.engine-start-failed", message: "AVAudioEngine failed to start" },
    });

    const err = await audio.start("stream-2").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("audio.engine-start-failed");
  });

  it("start() sends correct streamId param in bridge call", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    const postMessageMock = vi
      .fn()
      .mockResolvedValue({ id: UUID, ok: true, data: {} });
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: postMessageMock } },
    };

    await audio.start("my-stream-id");

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "audio.start",
        params: { streamId: "my-stream-id" },
      })
    );
  });

  it("§C3 contract: audio object has only start and stop, no read / internal / PCM methods", () => {
    const keys = Object.keys(audio);
    expect(keys).toContain("start");
    expect(keys).toContain("stop");
    expect((audio as Record<string, unknown>).read).toBeUndefined();
    expect((audio as Record<string, unknown>).internal).toBeUndefined();
    expect((audio as Record<string, unknown>).pcm).toBeUndefined();
    expect((audio as Record<string, unknown>).onChunk).toBeUndefined();
  });
});
