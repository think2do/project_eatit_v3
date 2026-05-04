import XCTest
import AppKit
@testable import Eatit

final class PDFParserServiceTests: XCTestCase {

    private var sut: PDFParserService!

    override func setUp() {
        super.setUp()
        sut = PDFParserService()
    }

    override func tearDown() {
        sut = nil
        super.tearDown()
    }

    // MARK: - Fixture: programmatic PDF generation via CGContext PDF API.
    // No binary fixture in git — deterministic, no xcodegen Resources config needed.

    private func makePDF(pageTexts: [String]) -> Data {
        let pdfData = NSMutableData()
        guard let consumer = CGDataConsumer(data: pdfData) else {
            fatalError("CGDataConsumer init failed")
        }
        var mediaBox = CGRect(x: 0, y: 0, width: 612, height: 792)
        guard let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
            fatalError("CGContext PDF init failed")
        }
        for text in pageTexts {
            context.beginPDFPage(nil)
            let attributes: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 14)
            ]
            let attrString = NSAttributedString(string: text, attributes: attributes)
            let line = CTLineCreateWithAttributedString(attrString)
            context.textPosition = CGPoint(x: 100, y: 700)
            CTLineDraw(line, context)
            context.endPDFPage()
        }
        context.closePDF()
        return pdfData as Data
    }

    // MARK: - Tests

    func testExtractTextSinglePage() throws {
        let pdfData = makePDF(pageTexts: ["Hello PDF World"])
        let base64 = pdfData.base64EncodedString()
        let result = try sut.extractText(base64: base64)
        XCTAssertTrue(
            result.text.contains("Hello PDF World"),
            "Expected text to contain 'Hello PDF World', got: \(result.text)"
        )
        XCTAssertEqual(result.pageCount, 1)
    }

    func testExtractTextMultiPage() throws {
        let pdfData = makePDF(pageTexts: ["Page1Alpha", "Page2Beta", "Page3Gamma"])
        let result = try sut.extractText(base64: pdfData.base64EncodedString())
        XCTAssertTrue(result.text.contains("Page1Alpha"))
        XCTAssertTrue(result.text.contains("Page2Beta"))
        XCTAssertTrue(result.text.contains("Page3Gamma"))
        XCTAssertEqual(result.pageCount, 3)
    }

    func testExtractTextRejectsInvalidBase64() {
        XCTAssertThrowsError(try sut.extractText(base64: "!!!not_base64!!!")) { error in
            XCTAssertEqual(error as? PDFParserService.PDFParseError, .invalidBase64)
        }
    }

    func testExtractTextRejectsValidBase64NonPDF() {
        let nonPDFData = "this is not a pdf".data(using: .utf8)!
        let base64 = nonPDFData.base64EncodedString()
        XCTAssertThrowsError(try sut.extractText(base64: base64)) { error in
            XCTAssertEqual(error as? PDFParserService.PDFParseError, .invalidPDF)
        }
    }

    func testExtractTextEmptyBase64ReturnsInvalidPDF() {
        // "" decodes to empty Data; PDFDocument(data: empty) fails → invalidPDF.
        XCTAssertThrowsError(try sut.extractText(base64: "")) { error in
            XCTAssertEqual(error as? PDFParserService.PDFParseError, .invalidPDF)
        }
    }
}
