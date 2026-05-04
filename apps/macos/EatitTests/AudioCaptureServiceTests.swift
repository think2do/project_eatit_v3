import XCTest
import AVFoundation
@testable import Eatit

final class AudioCaptureServiceTests: XCTestCase {

    private var sut: AudioCaptureService!

    override func setUp() {
        super.setUp()
        sut = AudioCaptureService()
        sut.skipPermissionForTesting = true
    }

    override func tearDown() {
        sut.stop()
        sut = nil
        super.tearDown()
    }

    // MARK: - Constants lock

    func testTargetChunkBytesIs6400() {
        XCTAssertEqual(AudioCaptureService.targetChunkBytes, 6400,
                       "200ms @ 16kHz mono Int16 must be exactly 6400 bytes")
    }

    func testTargetSampleRateIs16000() {
        XCTAssertEqual(AudioCaptureService.targetSampleRate, 16000)
    }

    // MARK: - Accumulator drain (chunk size = 6400)

    func testAppendAndDrainEmitsExactlyOneChunkOnExact6400Bytes() {
        var emitted: [Data] = []
        sut.setTestCallback { emitted.append($0) }
        sut.appendAndDrain(Data(repeating: 0xAB, count: 6400))
        XCTAssertEqual(emitted.count, 1)
        XCTAssertEqual(emitted[0].count, 6400)
        XCTAssertTrue(emitted[0].allSatisfy { $0 == 0xAB })
    }

    func testAppendAndDrainEmitsTwoChunksOnExact12800Bytes() {
        var emitted: [Data] = []
        sut.setTestCallback { emitted.append($0) }
        sut.appendAndDrain(Data(repeating: 0x01, count: 12800))
        XCTAssertEqual(emitted.count, 2)
        XCTAssertTrue(emitted.allSatisfy { $0.count == 6400 })
    }

    func testAppendAndDrainHoldsRemainder() {
        var emitted: [Data] = []
        sut.setTestCallback { emitted.append($0) }
        // 6400 + 100 bytes → emit 1 chunk, hold 100 in accumulator
        sut.appendAndDrain(Data(repeating: 0x02, count: 6500))
        XCTAssertEqual(emitted.count, 1)
        // Push another 6300 bytes → 100 + 6300 = 6400 → emit 1 more chunk
        sut.appendAndDrain(Data(repeating: 0x03, count: 6300))
        XCTAssertEqual(emitted.count, 2)
        XCTAssertEqual(emitted[1].count, 6400)
    }

    func testAppendAndDrainEmitsNothingBelowThreshold() {
        var emitted: [Data] = []
        sut.setTestCallback { emitted.append($0) }
        sut.appendAndDrain(Data(repeating: 0x04, count: 6399))
        XCTAssertEqual(emitted.count, 0, "Sub-threshold input must not emit a chunk")
    }

    func testStopClearsAccumulator() {
        var emitted: [Data] = []
        sut.setTestCallback { emitted.append($0) }
        sut.appendAndDrain(Data(repeating: 0x05, count: 1000))
        sut.stop()
        // After stop, push another 5400 bytes — would have completed a chunk if accumulator persisted.
        // But stop() cleared it, so this stays sub-threshold:
        sut.setTestCallback { emitted.append($0) }
        sut.appendAndDrain(Data(repeating: 0x06, count: 5400))
        XCTAssertEqual(emitted.count, 0)
    }
}
