import { describe, it, expect, vi, beforeEach } from "vitest";
import { keychain } from "../keychain";

// Valid UUID v4 used as mock IDs throughout.
const UUID1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UUID2 = "550e8400-e29b-41d4-a716-446655440000";
const UUID3 = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const UUID4 = "6ba7b811-9dad-41d1-80b4-00c04fd430c9";
const UUID5 = "6ba7b812-9dad-41d1-80b4-00c04fd430ca";
const UUID6 = "6ba7b813-9dad-41d1-80b4-00c04fd430cb";

describe("keychain service", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: {
        eatit: { postMessage: vi.fn() },
      },
    };
  });

  it("save() happy path resolves without throwing", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID1);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID1, ok: true, data: {} });

    // bridge.call<void> resolves to the raw data payload ({}); the key invariant is no throw.
    await expect(keychain.save("ark-api-key", "sk-test-value")).resolves.not.toThrow();
  });

  it("exists() returns { exists: true } when key is present", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID2);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID2, ok: true, data: { exists: true } });

    const result = await keychain.exists("ark-api-key");
    expect(result).toEqual({ exists: true });
  });

  it("exists() returns { exists: false } when key is absent", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID3);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID3, ok: true, data: { exists: false } });

    const result = await keychain.exists("volc-asr-credentials");
    expect(result).toEqual({ exists: false });
  });

  it("delete() happy path resolves without throwing", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID4);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: UUID4, ok: true, data: {} });

    // bridge.call<void> resolves to the raw data payload ({}); the key invariant is no throw.
    await expect(keychain.delete("app-encryption-key")).resolves.not.toThrow();
  });

  it("save() propagates BridgeError when Swift returns ok=false", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID5);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID5,
      ok: false,
      error: { code: "keychain.save-failed", message: "OSStatus -25293" },
    });

    const { BridgeError } = await import("../nativeBridge");
    const err = await keychain.save("ark-api-key", "sk-test-value").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect(err.code).toBe("keychain.save-failed");
  });

  it("§C3 contract: keychain object has no get or read method", () => {
    // §C3 red line: secrets must never cross the Bridge boundary.
    expect((keychain as Record<string, unknown>).get).toBeUndefined();
    expect((keychain as Record<string, unknown>).read).toBeUndefined();
  });

  it("save() sends correct method and params to bridge", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID6);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID6, ok: true, data: {} });

    await keychain.save("ark-api-key", "sk-secret");

    expect(mockPost).toHaveBeenCalledWith({
      id: UUID6,
      method: "keychain.save",
      params: { account: "ark-api-key", secret: "sk-secret" },
    });
  });
});
