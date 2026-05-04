import { z } from "zod";
import { bridge } from "./nativeBridge";

// §B9 dual-end mirror of Swift PDFExtractResult Codable (PDFParserService.swift).
// §C3: base64 input may contain candidate PII — callers must not log it.
export const PDFExtractResultSchema = z.object({
  text: z.string(),
  pageCount: z.number().int().nonnegative(),
});
export type PDFExtractResult = z.infer<typeof PDFExtractResultSchema>;

export const pdf = {
  /// Extract plain text from a base64-encoded PDF.
  /// Throws BridgeError("pdf.invalid-base64") when base64 is malformed.
  /// Throws BridgeError("pdf.invalid-pdf") when data is not a valid PDF.
  extractText: async (base64: string): Promise<PDFExtractResult> => {
    const raw = await bridge.call("pdf.extractText", { base64 });
    return PDFExtractResultSchema.parse(raw);
  },
};
