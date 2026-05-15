import AVFoundation
import Foundation
import os.log

private let audioDiag = OSLog(subsystem: "com.eatit.desktop.asr", category: "audio")

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

    // [DIAG-ASR] Dump first ≤30s of converted PCM to /tmp/eatit_diag.pcm so we can
    // verify with `ffplay -f s16le -ar 16000 -ac 1 /tmp/eatit_diag.pcm` whether
    // the converter is actually producing voice or silence/garbage. Remove after
    // ASR diagnosis complete.
    private var diagPCMHandle: FileHandle?
    private var diagPCMBytes: Int = 0
    private static let diagPCMMaxBytes = 30 * 16000 * 2  // 30s @ 16kHz mono Int16
    // Static counter for input-buffer diagnostic (shared across start cycles since tap closure captures static).
    private static var diagBufferCounter: Int = 0

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
        Self.diagBufferCounter = 0

        // [DIAG-ASR] (re)open PCM dump file in container tmp (sandbox blocks /tmp directly).
        // Resolves to ~/Library/Containers/com.eatit.desktop/Data/tmp/eatit_diag.pcm
        let diagURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("eatit_diag.pcm")
        try? FileManager.default.removeItem(at: diagURL)
        FileManager.default.createFile(atPath: diagURL.path, contents: nil)
        self.diagPCMHandle = try? FileHandle(forWritingTo: diagURL)
        self.diagPCMBytes = 0
        os_log("%{public}@", log: audioDiag, type: .info, "diag PCM dump path: \(diagURL.path)")

        let input = engine.inputNode
        // CRITICAL: disable Voice Processing IO before any tap install.
        // On macOS 26 / Apple silicon, AVAudioEngine's default input chain auto-
        // enables Voice Isolation DSP for any "voice-flavored" app (detected via
        // bundle id heuristics). This causes:
        //   a) inputNode.outputFormat initially returns a 48kHz / 3-channel
        //      format from a non-input device (device 102 in our trace),
        //   b) HAL renegotiates to the real mic (device 148, mono input)
        //      ~30s later, during which capture is silent,
        //   c) the negotiation can interrupt mid-session causing WS cancel
        //      → JS asr.not_capturing toast.
        // We don't need echo cancellation (no simultaneous playback during
        // interview turns) so disabling VP is pure win:
        //   - input format becomes the mic's native mono 16/24-bit stream
        //   - tap fires immediately, no 30s warm-up
        //   - no random device-switching mid-session
        try? input.setVoiceProcessingEnabled(false)
        // Defensive: remove any pre-existing tap on bus 0. AVFoundation throws
        // an uncaught ObjC NSException ("required condition is false: nullptr == Tap()")
        // → SIGABRT → app dead, if installTap is called while a tap is still
        // installed. Real-world trigger we hit: ASR errored with
        // asr.no-final-received, JS rejected the Promise without dispatching
        // `audio.stop`, so the previous tap from the first recording was still
        // alive when the user pressed record a second time. Calling
        // removeTap on a bus with no tap is a no-op, so this is safe to do
        // unconditionally.
        input.removeTap(onBus: 0)
        if engine.isRunning { engine.stop() }
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
        // NOTE: previous attempt set conv.channelMap = [NSNumber(-1)] thinking it
        // would mix all channels — wrong. Apple's API: -1 means "output channel
        // is silent". Removing that and letting AVAudioConverter use its default
        // multi-to-mono behavior. If default is still silent the real fix is a
        // manual sum in handleInputBuffer (see diagnostic below).
        self.converter = conv

        // Tap buffer hint: 200ms @ inputFormat — system may ignore.
        let tapBufferSize = AVAudioFrameCount(inputFormat.sampleRate * 0.2)
        os_log("%{public}@", log: audioDiag, type: .info, "start streamId=\(streamId) inputFmt rate=\(inputFormat.sampleRate) ch=\(inputFormat.channelCount) tapBuf=\(tapBufferSize)")
        var tapCallCount = 0
        input.installTap(onBus: 0, bufferSize: tapBufferSize, format: inputFormat) { [weak self] buffer, _ in
            tapCallCount += 1
            if tapCallCount == 1 || tapCallCount % 10 == 0 {
                os_log("%{public}@", log: audioDiag, type: .info, "tap fire #\(tapCallCount) frames=\(buffer.frameLength)")
            }
            self?.handleInputBuffer(buffer, outputFormat: outputFormat)
        }

        do {
            try engine.start()
            os_log("%{public}@", log: audioDiag, type: .info, "engine started")
        } catch {
            input.removeTap(onBus: 0)
            self.converter = nil
            self.pcmCallback = nil
            os_log("%{public}@", log: audioDiag, type: .error, "engine.start FAILED: \(error)")
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
        // [DIAG-ASR] Per-channel max-abs probe — first buffer + every 25th
        // (~5s @ 200ms). Reveals whether mic-side data is silent (all channels=0
        // → engine/sandbox/permission upstream issue) vs whether some channels
        // do have signal that converter is then dropping.
        Self.diagBufferCounter += 1
        if Self.diagBufferCounter == 1 || Self.diagBufferCounter % 25 == 0 {
            let frameCount = Int(inputBuffer.frameLength)
            let chCount = Int(inputBuffer.format.channelCount)
            var summary = "input buf #\(Self.diagBufferCounter) frames=\(frameCount) ch=\(chCount): "
            if let f = inputBuffer.floatChannelData {
                for ch in 0..<chCount {
                    var maxAbs: Float = 0
                    let ptr = f[ch]
                    for i in 0..<frameCount {
                        let v = abs(ptr[i])
                        if v > maxAbs { maxAbs = v }
                    }
                    summary += "ch\(ch)maxAbs=\(String(format: "%.5f", maxAbs)) "
                }
            } else if let i16 = inputBuffer.int16ChannelData {
                for ch in 0..<chCount {
                    var maxAbs: Int32 = 0
                    let ptr = i16[ch]
                    for i in 0..<frameCount {
                        let v = Int32(abs(Int32(ptr[i])))
                        if v > maxAbs { maxAbs = v }
                    }
                    summary += "ch\(ch)maxAbs=\(maxAbs) "
                }
            } else {
                summary += "(no float/int16 pointers)"
            }
            os_log("%{public}@", log: audioDiag, type: .info, summary)
        }
        // Manual converter — replaces AVAudioConverter which silently outputs
        // all zeros for our 48kHz/3-ch Float32 input on macOS 26 (verified:
        // ch0 maxAbs > 2.0 in input, but PCM dump is all zeros across 19s).
        // Steps: (1) mix all channels into mono Float, (2) nearest-neighbor
        // resample to targetSampleRate (16kHz), (3) clamp Float to [-1,1] and
        // scale to Int16. Bypasses AVAudioConverter entirely.
        _ = converter // silence unused-binding warning while we keep the property for ABI symmetry
        _ = outputFormat
        let inputSampleRate = inputBuffer.format.sampleRate
        let inputFrameCount = Int(inputBuffer.frameLength)
        guard inputFrameCount > 0 else { return }

        // Step 1: mono mix into a stack-local Float array.
        var monoFloat = [Float](repeating: 0, count: inputFrameCount)
        if let floatChannels = inputBuffer.floatChannelData {
            let chCount = Int(inputBuffer.format.channelCount)
            let chCountFloat = Float(chCount)
            for ch in 0..<chCount {
                let ptr = floatChannels[ch]
                for i in 0..<inputFrameCount {
                    monoFloat[i] += ptr[i] / chCountFloat
                }
            }
        } else if let i16Channels = inputBuffer.int16ChannelData {
            let chCount = Int(inputBuffer.format.channelCount)
            let chCountFloat = Float(chCount)
            for ch in 0..<chCount {
                let ptr = i16Channels[ch]
                for i in 0..<inputFrameCount {
                    monoFloat[i] += Float(ptr[i]) / 32768.0 / chCountFloat
                }
            }
        } else {
            return
        }

        // Step 2: nearest-neighbor downsample to targetSampleRate.
        let ratio = inputSampleRate / Self.targetSampleRate
        let outputFrameCount = Int((Double(inputFrameCount) / ratio).rounded(.down))
        guard outputFrameCount > 0 else { return }

        // Step 3: clamp + scale to Int16, write into Data buffer.
        var pcmBytes = Data(count: outputFrameCount * 2)
        pcmBytes.withUnsafeMutableBytes { rawPtr in
            let dst = rawPtr.baseAddress!.assumingMemoryBound(to: Int16.self)
            for i in 0..<outputFrameCount {
                let srcIdx = Int(Double(i) * ratio)
                let f = srcIdx < inputFrameCount ? monoFloat[srcIdx] : 0
                let clamped = max(-1.0, min(1.0, f))
                dst[i] = Int16(clamped * 32767)
            }
        }
        appendAndDrain(pcmBytes)
    }

    /// Internal: append bytes to accumulator + emit 6400-byte slices via pcmCallback.
    /// Exposed `internal` for testing in isolation from AVAudioEngine.
    func appendAndDrain(_ data: Data) {
        accumulatorLock.lock()
        accumulator.append(data)
        var slices: [Data] = []
        while accumulator.count >= Self.targetChunkBytes {
            // Use the accumulator's actual startIndex (NOT 0).  After
            // `removeFirst(N)` Foundation's Data does not always rebase its
            // index space — the underlying storage is preserved and only
            // startIndex advances by N.  Calling subdata(in: 0..<N) on the
            // next iteration then traps EXC_BREAKPOINT because 0 lies below
            // startIndex.  Going through startIndex keeps us in-bounds, and
            // wrapping the slice in `Data(...)` rebases the emitted chunk so
            // downstream consumers see a normal 0-indexed Data.
            let start = accumulator.startIndex
            let end = start + Self.targetChunkBytes
            slices.append(Data(accumulator[start..<end]))
            accumulator.removeSubrange(start..<end)
        }
        accumulatorLock.unlock()
        let cb = pcmCallback
        if !slices.isEmpty {
            os_log("%{public}@", log: audioDiag, type: .info, "drain emitting \(slices.count) slices, cb=\(cb == nil ? "NIL" : "set")")
            // [DIAG-ASR] Dump up to 30s of converted PCM to /tmp/eatit_diag.pcm
            for slice in slices where diagPCMBytes < Self.diagPCMMaxBytes {
                diagPCMHandle?.write(slice)
                diagPCMBytes += slice.count
            }
        }
        for slice in slices { cb?(slice) }
    }

#if DEBUG
    /// Test seam: install the pcmCallback without going through start().
    internal func setTestCallback(_ cb: @escaping (Data) -> Void) {
        self.pcmCallback = cb
    }
#endif
}
