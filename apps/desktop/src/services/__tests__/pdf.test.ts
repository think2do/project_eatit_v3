import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pdf } from "../pdf";
import { BridgeError } from "../nativeBridge";

const UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const SAMPLE_BASE64 = "dGVzdA=="; // "test" in base64

describe("pdf service", () => {
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

  it("extractText() happy path returns PDFExtractResult", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: true,
      data: { text: "Hello PDF World", pageCount: 1 },
    });

    const result = await pdf.extractText(SAMPLE_BASE64);
    expect(result).toEqual({ text: "Hello PDF World", pageCount: 1 });
  });

  it("extractText() throws BridgeError 'pdf.invalid-base64' on ok=false", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: false,
      error: { code: "pdf.invalid-base64", message: "params.base64 is not valid base64" },
    });

    const err = await pdf.extractText("!!!bad!!!").catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("pdf.invalid-base64");
  });

  it("extractText() throws BridgeError 'pdf.invalid-pdf' on ok=false", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: false,
      error: { code: "pdf.invalid-pdf", message: "decoded data is not a valid PDF" },
    });

    const err = await pdf.extractText(SAMPLE_BASE64).catch((e) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe("pdf.invalid-pdf");
  });

  it("extractText() throws ZodError when pageCount is negative", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: true,
      data: { text: "hello", pageCount: -1 },
    });

    const { ZodError } = await import("zod");
    const err = await pdf.extractText(SAMPLE_BASE64).catch((e) => e);
    expect(err).toBeInstanceOf(ZodError);
  });

  it("extractText() throws ZodError when pageCount is missing", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: true,
      data: { text: "hello" },
    });

    const { ZodError } = await import("zod");
    const err = await pdf.extractText(SAMPLE_BASE64).catch((e) => e);
    expect(err).toBeInstanceOf(ZodError);
  });

  it("extractText() multi-page happy path returns correct pageCount", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
    (
      window.webkit!.messageHandlers!.eatit!.postMessage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: UUID,
      ok: true,
      data: { text: "Page1Alpha\nPage2Beta\nPage3Gamma", pageCount: 3 },
    });

    const result = await pdf.extractText(SAMPLE_BASE64);
    expect(result.pageCount).toBe(3);
    expect(result.text).toContain("Page1Alpha");
    expect(result.text).toContain("Page3Gamma");
  });

  it("§C3 contract: pdf object has no read or internal properties", () => {
    expect((pdf as Record<string, unknown>).read).toBeUndefined();
    expect((pdf as Record<string, unknown>).internal).toBeUndefined();
  });
});
