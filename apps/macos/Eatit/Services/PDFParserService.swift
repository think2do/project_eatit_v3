import Foundation
import PDFKit

// §B9 dual-end mirror of JS PDFExtractResultSchema (pdf.ts).
struct PDFExtractResult: Codable, Equatable {
    let text: String
    let pageCount: Int
}

/// PDF text extraction via PDFKit (system framework — no SPM dep, no entitlement).
/// §A0.1: PDFDocument(data:) operates entirely in memory; no filesystem read required.
/// §C3: text content is user resume/transcript, not secrets.
///       Callers (Bridge handler in WebViewController) must NOT log base64 input or extracted text.
final class PDFParserService {

    enum PDFParseError: Error, Equatable {
        case invalidBase64
        case invalidPDF
    }

    /// Extracts plain text from a base64-encoded PDF.
    /// Throws PDFParseError.invalidBase64 when the string is not valid base64.
    /// Throws PDFParseError.invalidPDF when the decoded data is not a valid PDF document.
    func extractText(base64: String) throws -> PDFExtractResult {
        guard let data = Data(base64Encoded: base64) else {
            throw PDFParseError.invalidBase64
        }
        guard let pdf = PDFDocument(data: data) else {
            throw PDFParseError.invalidPDF
        }
        var text = ""
        for i in 0..<pdf.pageCount {
            text += pdf.page(at: i)?.string ?? ""
        }
        return PDFExtractResult(text: text, pageCount: pdf.pageCount)
    }
}
