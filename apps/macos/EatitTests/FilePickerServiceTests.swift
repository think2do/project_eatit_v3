import XCTest
@testable import Eatit

final class FilePickerServiceTests: XCTestCase {

    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try! FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        tempDir = nil
        super.tearDown()
    }

    // MARK: - makePickedFile

    func testMakePickedFileWithRealTempFile() throws {
        let content = "hello"
        let url = tempDir.appendingPathComponent("hello.txt")
        try content.write(to: url, atomically: true, encoding: .utf8)

        let result = FilePickerService.makePickedFile(from: url)

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.name, "hello.txt")
        XCTAssertEqual(result?.size, 5)
        // "hello" → base64 → "aGVsbG8="
        XCTAssertEqual(result?.base64, Data("hello".utf8).base64EncodedString())
    }

    func testMakePickedFileWithMissingFileReturnsNil() {
        let url = tempDir.appendingPathComponent("does-not-exist.pdf")
        let result = FilePickerService.makePickedFile(from: url)
        XCTAssertNil(result)
    }

    func testMakePickedFileWithBinaryContent() throws {
        let bytes: [UInt8] = [0x00, 0xFF, 0x10]
        let data = Data(bytes)
        let url = tempDir.appendingPathComponent("binary.bin")
        try data.write(to: url)

        let result = FilePickerService.makePickedFile(from: url)

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.size, 3)
        XCTAssertEqual(result?.base64, "AP8Q")
    }

    // MARK: - Encodable

    func testPickedFileEncodesToExpectedJSON() throws {
        let file = PickedFile(name: "a.txt", size: 3, base64: "YWJj")
        let data = try JSONEncoder().encode(file)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(dict.count, 3)
        XCTAssertEqual(dict["name"] as? String, "a.txt")
        XCTAssertEqual(dict["size"] as? Int, 3)
        XCTAssertEqual(dict["base64"] as? String, "YWJj")
    }
}
