import { Mic, MicOff } from "lucide-react";

/**
 * Click-to-toggle recording button for voice-mode interviews.
 *
 * Single click fires `onStart` when idle, `onStop` when recording.
 * The lifecycle events are driven from the outside so InterviewPage can
 * link them to MediaRecorder + WS frames without this component knowing
 * about the socket.
 *
 * Visual states:
 *   - idle:      brand button with mic icon, "开始录音"
 *   - disabled:  gray button (e.g. voice not permitted yet)
 *   - recording: red button, pulsing dot, "停止录音" + live partial
 */
export function VoiceControl({
  isRecording,
  disabled,
  partialTranscript,
  onStart,
  onStop,
}: {
  isRecording: boolean;
  disabled?: boolean;
  partialTranscript: string;
  onStart: () => void;
  onStop: () => void;
}): JSX.Element {
  const handleClick = () => {
    if (disabled) return;
    if (isRecording) {
      onStop();
    } else {
      onStart();
    }
  };

  const background = disabled
    ? "var(--ink-200)"
    : isRecording
      ? "var(--warn)"
      : "var(--brand)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 14px",
        borderRadius: "var(--r-md)",
        border: "1px solid var(--line)",
        background: "var(--bg-elev)",
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        aria-pressed={isRecording}
        aria-label={isRecording ? "停止录音" : "开始录音"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          borderRadius: "var(--r-pill)",
          border: "none",
          background,
          color: "white",
          fontSize: 13.5,
          fontWeight: 500,
          cursor: disabled ? "not-allowed" : "pointer",
          minWidth: 160,
          justifyContent: "center",
          userSelect: "none",
        }}
      >
        {isRecording ? (
          <>
            <span
              className="pulse-dot"
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "white",
                display: "inline-block",
              }}
            />
            停止录音
          </>
        ) : disabled ? (
          <>
            <MicOff size={15} />
            语音模式不可用
          </>
        ) : (
          <>
            <Mic size={15} />
            开始录音
          </>
        )}
      </button>
      {isRecording && partialTranscript ? (
        <span
          style={{
            fontSize: 13,
            color: "var(--ink-500)",
            fontStyle: "italic",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {partialTranscript}
        </span>
      ) : null}
    </div>
  );
}
