import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { file } from "../file";

// Valid UUID v4 used as mock IDs throughout.
const UUID1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UUID2 = "550e8400-e29b-41d4-a716-446655440000";
const UUID3 = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const UUID4 = "6ba7b811-9dad-41d1-80b4-00c04fd430c9";
const UUID5 = "6ba7b812-9dad-41d1-80b4-00c04fd430ca";
const UUID6 = "6ba7b813-9dad-41d1-80b4-00c04fd430cb";
const UUID7 = "6ba7b814-9dad-41d1-80b4-00c04fd430cc";

const SAMPLE_FILE = { name: "resume.pdf", size: 4, base64: "dGVzdA==" };

describe("file service", () => {
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

  it("pick() happy path returns array of PickedFile", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID1);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID1, ok: true, data: [SAMPLE_FILE] });

    const result = await file.pick(["pdf"], false);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(SAMPLE_FILE);
  });

  it("pick() cancel path returns empty array", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID2);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID2, ok: true, data: [] });

    const result = await file.pick(["pdf", "docx"], true);
    expect(result).toEqual([]);
  });

  it("pick() throws ZodError on malformed response", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID3);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID3,
      ok: true,
      // name is missing — invalid per PickedFileSchema
      data: [{ size: 4, base64: "dGVzdA==" }],
    });

    const { ZodError } = await import("zod");
    const err = await file.pick().catch((e) => e);
    expect(err).toBeInstanceOf(ZodError);
  });

  it("dropEnable(true) happy path resolves without throwing", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID4);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID4, ok: true, data: {} });

    await expect(file.dropEnable(true)).resolves.not.toThrow();
  });

  it("onDrop() registers handler; dispatching mock BridgeEvent invokes handler", () => {
    const handler = vi.fn();
    file.onDrop(handler);

    // Simulate Swift pushing a file-dropped BridgeEvent via window.eatitBridge.dispatch.
    window.eatitBridge!.dispatch!({
      type: "file-dropped",
      streamId: UUID5,
      payload: { files: [SAMPLE_FILE] },
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ files: [SAMPLE_FILE] });
  });

  it("onDrop() returns unsubscribe that stops further calls", () => {
    const handler = vi.fn();
    const unsubscribe = file.onDrop(handler);

    // First dispatch — should fire.
    window.eatitBridge!.dispatch!({
      type: "file-dropped",
      streamId: UUID6,
      payload: { files: [SAMPLE_FILE] },
    });

    unsubscribe();

    // Second dispatch after unsubscribe — should NOT fire.
    window.eatitBridge!.dispatch!({
      type: "file-dropped",
      streamId: UUID7,
      payload: { files: [SAMPLE_FILE] },
    });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("§C3 contract: file object has no read or internal properties", () => {
    expect((file as Record<string, unknown>).read).toBeUndefined();
    expect((file as Record<string, unknown>).internal).toBeUndefined();
  });
});
