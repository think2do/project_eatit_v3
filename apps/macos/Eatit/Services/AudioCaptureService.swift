import AVFoundation
import Foundation

/// AVAudioEngine-based microphone capture → 16kHz mono Int16 LE PCM → 200ms (6400-byte) chunks.
/// §C / §C3: PCM data is user voice (PII). NEVER log raw bytes; only log streamId at info level.
/// §A0.1: device.audio-input entitlement (M1.4) + NSMicrophoneUsageDescription (M1.4) cover this.
/// §K #4 / #7 / #8: no Web Worker ASR fallback, no disable-library-validation, no network.server.
///
/// pcmCallback is registered by M2.8 ASRGateway directly (Swift-internal); the Bridge layer
/// only exposes start/stop control. PCM never crosses the JS boundary.
final class AudioCaptureService {

    enum AudioError: Error, Equatable {
        case permissionDenied
        case engineStartFailed(String)
        case converterInitFailed
    }

    static let targetSampleRate: Double = 16000
    static let targetChunkBytes: Int = 6400  // 200ms @ 16kHz mono Int16 = 16000 × 0.2 × 2

    private let engine = AVAudioEngine()
    private var converter: AVAudioConverter?
    private var pcmCallback: ((Data) -> Void)?
    private var streamId: String?

    /// Lock for accumulator (tap callback runs on a real-time audio thread; not main).
    private let accumulatorLock = NSLock()
    private var accumulator = Data()

    /// Test seam: skip the AVCaptureDevice.requestAccess step in unit tests.
    var skipPermissionForTesting: Bool = false

    /// Starts capture. `onPCMChunk` is invoked on a background audio thread with exactly
    /// 6400-byte Data slices (16kHz mono Int16 LE). Caller must be thread-safe.
    func start(streamId: String, onPCMChunk: @escaping (Data) -> Void) async throws {
        if !skipPermissionForTesting {
            let granted = await AVCaptureDevice.requestAccess(for: .audio)
            guard granted else { throw AudioError.permissionDenied }
        }

        self.streamId = streamId
        self.pcmCallback = onPCMChunk

        accumulatorLock.lock()
        accumulator.removeAll(keepingCapacity: true)
        accumulatorLock.unlock()

        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard let outputFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: Self.targetSampleRate,
            channels: 1,
            interleaved: true
        ) else {
            throw AudioError.converterInitFailed
        }
        guard let conv = AVAudioConverter(from: inputFormat, to: outputFormat) else {
            throw AudioError.converterInitFailed
        }
        self.converter = conv

        // Tap buffer hint: 200ms @ inputFormat — system may ignore.
        let tapBufferSize = AVAudioFrameCount(inputFormat.sampleRate * 0.2)
        input.installTap(onBus: 0, bufferSize: tapBufferSize, format: inputFormat) { [weak self] buffer, _ in
            self?.handleInputBuffer(buffer, outputFormat: outputFormat)
        }

        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            self.converter = nil
            self.pcmCallback = nil
            throw AudioError.engineStartFailed("\(error)")
        }
    }

    func stop() {
        if engine.isRunning {
            engine.stop()
        }
        engine.inputNode.removeTap(onBus: 0)
        accumulatorLock.lock()
        accumulator.removeAll(keepingCapacity: false)
        accumulatorLock.unlock()
        converter = nil
        pcmCallback = nil
        streamId = nil
    }

    // MARK: - Internal: tap → convert → accumulate → drain

    /// Convert one input buffer to 16kHz/Int16, append to accumulator, drain in 6400-byte chunks.
    /// Exposed `internal` for unit-test reuse (tests skip the engine and feed buffers directly).
    func handleInputBuffer(_ inputBuffer: AVAudioPCMBuffer, outputFormat: AVAudioFormat) {
        guard let converter = converter else { return }
        // Allocate output buffer sized to the expected resampled frame count.
        let inputFrames = Double(inputBuffer.frameLength)
        let outputFrames = AVAudioFrameCount(
            (inputFrames * Self.targetSampleRate / inputBuffer.format.sampleRate).rounded(.up)
        )
        guard outputFrames > 0,
              let outputBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: outputFrames)
        else { return }

        var fed = false
        let inputBlock: AVAudioConverterInputBlock = { _, status in
            if fed {
                status.pointee = .noDataNow
                return nil
            }
            fed = true
            status.pointee = .haveData
            return inputBuffer
        }
        var convError: NSError?
        let convStatus = converter.convert(to: outputBuffer, error: &convError, withInputFrom: inputBlock)
        if convStatus == .error || convError != nil { return }

        guard let int16Channel = outputBuffer.int16ChannelData else { return }
        let bytesProduced = Int(outputBuffer.frameLength) * MemoryLayout<Int16>.size
        let pcmData = Data(bytes: int16Channel.pointee, count: bytesProduced)
        appendAndDrain(pcmData)
    }

    /// Internal: append bytes to accumulator + emit 6400-byte slices via pcmCallback.
    /// Exposed `internal` for testing in isolation from AVAudioEngine.
    func appendAndDrain(_ data: Data) {
        accumulatorLock.lock()
        accumulator.append(data)
        var slices: [Data] = []
        while accumulator.count >= Self.targetChunkBytes {
            slices.append(accumulator.subdata(in: 0..<Self.targetChunkBytes))
            accumulator.removeFirst(Self.targetChunkBytes)
        }
        accumulatorLock.unlock()
        let cb = pcmCallback
        for slice in slices { cb?(slice) }
    }

#if DEBUG
    /// Test seam: install the pcmCallback without going through start().
    internal func setTestCallback(_ cb: @escaping (Data) -> Void) {
        self.pcmCallback = cb
    }
#endif
}
