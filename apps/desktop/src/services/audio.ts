import { bridge } from "./nativeBridge";

// §C3: no PCM payload over Bridge; this file is start/stop control only.
// §B9 dual-end mirror of Swift StartParams / EmptyResponse Codable.

export const audio = {
  // Starts microphone capture for the given streamId.
  // Throws BridgeError("audio.permission-denied") if mic access is denied.
  // Throws BridgeError("audio.engine-start-failed") if AVAudioEngine fails to start.
  start: async (streamId: string): Promise<void> => {
    await bridge.call<void>("audio.start", { streamId });
  },

  // Stops microphone capture and clears the internal accumulator.
  stop: async (): Promise<void> => {
    await bridge.call<void>("audio.stop", {});
  },
};
