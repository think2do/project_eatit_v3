/**
 * infra/file.expanded — M5.2.c
 *
 * Augments services/__tests__/file.test.ts (7 tests) with boundary and
 * edge-case tests NOT already covered.
 *
 * Existing coverage: pick happy path, cancel empty array, ZodError on malformed,
 *   dropEnable true, onDrop handler fires, onDrop unsubscribe, §C3 shape contract.
 *
 * Added here:
 *   - pick() BridgeError propagation (file.picker-cancelled-by-system)
 *   - dropEnable(false) happy path
 *   - pick() sends correct accept/multiple params
 *   - pick() with no args sends accept=null, multiple=false
 *   - PickedFileSchema: size=0 accepted (empty file)
 *   - PickedFileSchema: negative size rejected
 *   - PickedFileSchema: missing base64 throws ZodError
 *   - FileDroppedPayloadSchema: empty files array accepted
 *   - FileDroppedPayloadSchema: missing files field throws ZodError
 *   - bridge.handler-not-installed on pick() when webkit missing
 *
 * §A0: no Tauri.
 * §C3: base64 content is user file data, not secret.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { file, PickedFileSchema, FileDroppedPayloadSchema } from "../../services/file";
import { BridgeError } from "../../services/nativeBridge";
import { z } from "zod";

const UUID1 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UUID2 = "b50e8400-e29b-41d4-a716-446655440000";
const UUID3 = "bba7b810-9dad-41d1-80b4-00c04fd430c8";
const UUID4 = "bba7b811-9dad-41d1-80b4-00c04fd430c9";
const UUID5 = "bba7b812-9dad-41d1-80b4-00c04fd430ca";

const SAMPLE_FILE = { name: "resume.pdf", size: 4096, base64: "dGVzdA==" };

describe("infra/file.expanded — PickedFileSchema and FileDroppedPayloadSchema", () => {
  it("PickedFileSchema: size=0 accepted (zero-byte file)", () => {
    const parsed = PickedFileSchema.parse({ name: "empty.pdf", size: 0, base64: "" });
    expect(parsed.size).toBe(0);
  });

  it("PickedFileSchema: negative size throws ZodError", () => {
    expect(() => PickedFileSchema.parse({ name: "f.pdf", size: -1, base64: "dA==" }))
      .toThrow(z.ZodError);
  });

  it("PickedFileSchema: float size throws ZodError (must be integer)", () => {
    expect(() => PickedFileSchema.parse({ name: "f.pdf", size: 4096.5, base64: "dA==" }))
      .toThrow(z.ZodError);
  });

  it("PickedFileSchema: missing base64 throws ZodError", () => {
    expect(() => PickedFileSchema.parse({ name: "f.pdf", size: 100 }))
      .toThrow(z.ZodError);
  });

  it("PickedFileSchema: missing name throws ZodError", () => {
    expect(() => PickedFileSchema.parse({ size: 100, base64: "dA==" }))
      .toThrow(z.ZodError);
  });

  it("FileDroppedPayloadSchema: empty files array accepted", () => {
    const parsed = FileDroppedPayloadSchema.parse({ files: [] });
    expect(parsed.files).toHaveLength(0);
  });

  it("FileDroppedPayloadSchema: missing files field throws ZodError", () => {
    expect(() => FileDroppedPayloadSchema.parse({})).toThrow(z.ZodError);
  });

  it("FileDroppedPayloadSchema: multiple files in array accepted", () => {
    const files = [SAMPLE_FILE, { ...SAMPLE_FILE, name: "jd.pdf" }];
    const parsed = FileDroppedPayloadSchema.parse({ files });
    expect(parsed.files).toHaveLength(2);
    expect(parsed.files[1].name).toBe("jd.pdf");
  });
});

describe("infra/file.expanded — service error paths and bridge envelope", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pick() propagates BridgeError on file.picker-cancelled-by-system", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID1);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID1,
        ok: false,
        error: { code: "file.picker-cancelled-by-system", message: "NSOpenPanel returned nil" },
      });

    const err = await file.pick(["pdf"]).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("file.picker-cancelled-by-system");
  });

  it("dropEnable(false) happy path resolves without throwing", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID2);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: UUID2, ok: true, data: {} });

    await expect(file.dropEnable(false)).resolves.not.toThrow();
  });

  it("pick() sends accept=['pdf','docx'] and multiple=true correctly", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID3);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID3, ok: true, data: [] });

    await file.pick(["pdf", "docx"], true);

    expect(mockPost).toHaveBeenCalledWith({
      id: UUID3,
      method: "file.pick",
      params: { accept: ["pdf", "docx"], multiple: true },
    });
  });

  it("pick() with no args sends accept=null and multiple=false", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID4);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID4, ok: true, data: [] });

    await file.pick();

    expect(mockPost).toHaveBeenCalledWith({
      id: UUID4,
      method: "file.pick",
      params: { accept: null, multiple: false },
    });
  });

  it("pick() propagates bridge.handler-not-installed when webkit missing", async () => {
    delete (window as unknown as Record<string, unknown>).webkit;
    const err = await file.pick(["pdf"]).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.handler-not-installed");
  });

  it("onDrop() handler receives FileDroppedPayload with correct files array", () => {
    const handler = vi.fn();
    const unsub = file.onDrop(handler);

    window.eatitBridge!.dispatch!({
      type: "file-dropped",
      streamId: UUID5,
      payload: { files: [SAMPLE_FILE] },
    });

    expect(handler).toHaveBeenCalledWith({ files: [SAMPLE_FILE] });
    unsub();
  });

  it("dropEnable() sends method='file.dropEnable' with correct enabled param", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID5);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID5, ok: true, data: {} });

    await file.dropEnable(true);

    expect(mockPost).toHaveBeenCalledWith({
      id: UUID5,
      method: "file.dropEnable",
      params: { enabled: true },
    });
  });
});
