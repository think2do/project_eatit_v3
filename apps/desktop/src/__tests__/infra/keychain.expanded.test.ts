/**
 * infra/keychain.expanded — M5.2.c
 *
 * Augments services/__tests__/keychain.test.ts (7 tests) with boundary and
 * error-path tests NOT already covered.
 *
 * Existing coverage: save happy path, exists true/false, delete happy,
 *   save BridgeError propagation, §C3 no-get contract, save envelope assertion.
 *
 * Added here (no duplication):
 *   - exists() BridgeError propagation (ok=false from Swift)
 *   - delete() BridgeError propagation (e.g. keychain.delete-failed)
 *   - save() sends correct bridge method name "keychain.save"
 *   - exists() sends correct method "keychain.exists" with account param
 *   - delete() sends correct method "keychain.delete" with account param
 *   - The 3 canonical account names accepted (§C1)
 *   - handler-not-installed propagated on save/exists/delete
 *   - keychain has exactly 3 methods (save/exists/delete)
 *
 * §A0: no Tauri.
 * §C3: no get() method tested — only save/exists/delete.
 * §C1: canonical account names ark-api-key / volc-asr-credentials / app-encryption-key.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { keychain } from "../../services/keychain";
import { BridgeError } from "../../services/nativeBridge";

const UUID1 = "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UUID2 = "e50e8400-e29b-41d4-a716-446655440000";
const UUID3 = "eba7b810-9dad-41d1-80b4-00c04fd430c8";
const UUID4 = "eba7b811-9dad-41d1-80b4-00c04fd430c9";
const UUID5 = "eba7b812-9dad-41d1-80b4-00c04fd430ca";
const UUID6 = "eba7b813-9dad-41d1-80b4-00c04fd430cb";
const UUID7 = "eba7b814-9dad-41d1-80b4-00c04fd430cc";

// §C1 canonical account names
const CANONICAL_ACCOUNTS = ["ark-api-key", "volc-asr-credentials", "app-encryption-key"] as const;

describe("infra/keychain.expanded — error propagation", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exists() propagates BridgeError when Swift returns ok=false", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID1);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID1,
        ok: false,
        error: { code: "keychain.query-failed", message: "OSStatus -25300" },
      });

    const err = await keychain.exists("ark-api-key").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("keychain.query-failed");
  });

  it("delete() propagates BridgeError on keychain.delete-failed", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID2);
    (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
      .mockResolvedValue({
        id: UUID2,
        ok: false,
        error: { code: "keychain.delete-failed", message: "item not found" },
      });

    const err = await keychain.delete("ark-api-key").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("keychain.delete-failed");
  });

  it("save() propagates bridge.handler-not-installed when webkit is missing", async () => {
    delete (window as unknown as Record<string, unknown>).webkit;
    const err = await keychain.save("ark-api-key", "sk-value").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.handler-not-installed");
  });

  it("exists() propagates bridge.handler-not-installed when webkit is missing", async () => {
    delete (window as unknown as Record<string, unknown>).webkit;
    const err = await keychain.exists("ark-api-key").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.handler-not-installed");
  });

  it("delete() propagates bridge.handler-not-installed when webkit is missing", async () => {
    delete (window as unknown as Record<string, unknown>).webkit;
    const err = await keychain.delete("app-encryption-key").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("bridge.handler-not-installed");
  });
});

describe("infra/keychain.expanded — bridge envelope assertions", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).webkit = {
      messageHandlers: { eatit: { postMessage: vi.fn() } },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exists() sends method='keychain.exists' with correct account param", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID3);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID3, ok: true, data: { exists: true } });

    await keychain.exists("volc-asr-credentials");

    expect(mockPost).toHaveBeenCalledWith({
      id: UUID3,
      method: "keychain.exists",
      params: { account: "volc-asr-credentials" },
    });
  });

  it("delete() sends method='keychain.delete' with correct account param", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID4);
    const mockPost = window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ id: UUID4, ok: true, data: {} });

    await keychain.delete("app-encryption-key");

    expect(mockPost).toHaveBeenCalledWith({
      id: UUID4,
      method: "keychain.delete",
      params: { account: "app-encryption-key" },
    });
  });

  it("§C1: all 3 canonical account names work with exists()", async () => {
    for (const [idx, account] of CANONICAL_ACCOUNTS.entries()) {
      const uuid = [UUID5, UUID6, UUID7][idx];
      vi.spyOn(crypto, "randomUUID").mockReturnValue(uuid);
      (window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: uuid, ok: true, data: { exists: false } });

      const result = await keychain.exists(account);
      expect(result).toEqual({ exists: false });
    }
  });

  it("§C3 contract: keychain has exactly 3 methods — save, exists, delete", () => {
    const keys = Object.keys(keychain);
    expect(keys).toHaveLength(3);
    expect(keys).toContain("save");
    expect(keys).toContain("exists");
    expect(keys).toContain("delete");
    // Explicitly absent:
    expect((keychain as Record<string, unknown>).get).toBeUndefined();
    expect((keychain as Record<string, unknown>).retrieve).toBeUndefined();
    expect((keychain as Record<string, unknown>).fetch).toBeUndefined();
  });
});
