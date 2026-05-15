/**
 * Interviewer text-to-speech via Volcengine Doubao TTS (BYOK) with Web Speech
 * fallback. Each interview style (and its locked persona name) maps to a
 * distinct voice timbre so users hear an obvious tonal difference between
 * 高压追问 / 友好引导 / 行业专家 / 结构化.
 *
 * Architecture:
 *   JS speakInterviewerLine(text, style?)
 *     → bridge.call("tts.synthesize", { text, voiceType }) → Swift TTSGateway
 *     → Volc HTTP TTS → base64 mp3 → <audio> play
 *     ↘ fallback to window.speechSynthesis on any error (no network / 4xx /
 *       voice_type not entitled / Bridge unavailable in vitest)
 *
 * §C3: volc-asr-credentials NEVER cross the Bridge boundary — only the
 * synthesized audio bytes (no PII, server-generated speech of the
 * interviewer's question text) come back.
 */

import { bridge } from "@/services/nativeBridge";

// Persona → Volc TTS voice_type mapping.
// IDs from "豆包语音合成模型1.0"音色列表 (Volc docs 6561/1257544). If a voice
// isn't entitled on the user's account the synthesize call 4xx's and we fall
// back to Web Speech automatically.
const STYLE_TO_VOICE: Record<string, string> = {
  // Sarah · 结构化 — 知性女声(客观、稳定、结构化播报感)
  structured: "zh_female_zhixingnvsheng_mars_bigtts",
  // Marcus · 高压追问 — 高冷沉稳男声(职场精英,冷静追问)
  pressure: "zh_male_bv139_audiobook_ummv3_bigtts",
  // Lin · 友好引导 — 开朗姐姐(温暖大姐姐)
  friendly: "zh_female_kailangjiejie_moon_bigtts",
  // Daniel · 行业专家 — 东方浩然 2.0(用户指定。uranus 后缀 = 豆包 TTS 2.0 模型,
  // 自然度比 1.0 mars/moon 高一档,代价是首字延迟稍长。若 v1 sync endpoint 不支持
  // uranus 系列会返回 4xx,届时改走 v3 async。)
  expert: "zh_male_dongfanghaoran_uranus_bigtts",
};
const DEFAULT_VOICE = STYLE_TO_VOICE.structured;

function voiceFor(style: string | null | undefined): string {
  if (!style) return DEFAULT_VOICE;
  return STYLE_TO_VOICE[style] ?? DEFAULT_VOICE;
}

// MARK: - Web Speech fallback (unchanged from previous impl)

const ZH_LOCALES = /^zh(-|_|$)/i;

function pickZhVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const zhVoices = voices.filter((v) => ZH_LOCALES.test(v.lang));
  if (zhVoices.length === 0) return null;
  const premium = zhVoices.find((v) => /premium|enhanced|neural/i.test(v.name));
  return premium ?? zhVoices[0];
}

function speakViaWebSpeech(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickZhVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "zh-CN";
  }
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  if (!voice) {
    const onVoicesReady = () => {
      synth.removeEventListener("voiceschanged", onVoicesReady);
      const late = pickZhVoice();
      if (late) {
        synth.cancel();
        const retry = new SpeechSynthesisUtterance(text);
        retry.voice = late;
        retry.lang = late.lang;
        synth.speak(retry);
      }
    };
    synth.addEventListener("voiceschanged", onVoicesReady);
  }
  synth.speak(utterance);
}

// MARK: - Volc Bridge TTS — primary path

interface TTSResult {
  audioBase64: string;
  encoding: string; // "mp3"
}

// Singleton audio element so we can cancel in-flight playback on new question.
let currentAudio: HTMLAudioElement | null = null;
let currentAudioObjectUrl: string | null = null;

function stopCurrentAudio(): void {
  if (currentAudio) {
    try {
      // 设置 src="" 会触发 audio 的 "error" 事件,error handler 又会调
      // speakViaWebSpeech() 把同一段台词再用系统女声朗读一遍,造成两个声音
      // 叠播。这里打个 dataset 标记,error handler 见到 abort 标记就跳过 fallback。
      currentAudio.dataset.eatitAbort = "1";
      currentAudio.pause();
      currentAudio.src = "";
    } catch {
      /* ignore */
    }
    currentAudio = null;
  }
  if (currentAudioObjectUrl) {
    URL.revokeObjectURL(currentAudioObjectUrl);
    currentAudioObjectUrl = null;
  }
}

function base64ToBlobUrl(base64: string, mime: string): string {
  // atob → binary string → Uint8Array → Blob → object URL
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

/**
 * Speak `text` as the interviewer. Pass `style` to pick a persona-matched
 * voice; defaults to the structured-Sarah voice when style absent.
 * Cancels any previous utterance so two adjacent calls don't overlap.
 */
export async function speakInterviewerLine(
  text: string,
  style?: string | null,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  // Always stop the previous one (Volc audio + Web Speech), regardless of path.
  stopCurrentAudio();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  const voiceType = voiceFor(style);

  // Try Volc TTS via Bridge first; on any failure fall back to Web Speech.
  try {
    const result = await bridge.call<TTSResult>("tts.synthesize", {
      text: trimmed,
      voiceType,
      speedRatio: 1.0,
    });
    const mime = result.encoding === "mp3" ? "audio/mpeg" : "audio/wav";
    const objectUrl = base64ToBlobUrl(result.audioBase64, mime);
    currentAudioObjectUrl = objectUrl;
    const audio = new Audio(objectUrl);
    currentAudio = audio;
    audio.addEventListener("ended", () => {
      if (currentAudio === audio) stopCurrentAudio();
    });
    audio.addEventListener("error", () => {
      // 区分两种 error:
      //   - dataset.eatitAbort === "1" → 我们自己调 stopCurrentAudio 触发的,
      //     这是正常 abort 不是真正解码失败,绝不能 fallback(否则双声叠播)。
      //   - 否则是 mp3 真的解码失败 → 走 Web Speech fallback。
      if (audio.dataset.eatitAbort === "1") return;
      stopCurrentAudio();
      speakViaWebSpeech(trimmed);
    });
    await audio.play();
  } catch (err) {
    // Bridge unavailable (vitest / dev shell) OR Volc TTS 4xx (voice not
    // entitled / quota / network). Fall back to OS Web Speech so the user
    // still hears the question — beats silence.
    console.warn("[tts] Volc TTS failed, falling back to Web Speech:", err);
    speakViaWebSpeech(trimmed);
  }
}

/** Abort any ongoing or queued utterance. Safe to call when nothing speaking. */
export function stopInterviewerLine(): void {
  stopCurrentAudio();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
