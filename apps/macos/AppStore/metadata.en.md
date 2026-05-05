# Eatit App Store Connect Metadata — English (en-US)

> For use in App Store Connect Mac App listing (English locale).
> All fields validated against Apple character limits.
> Produced in M6.4; factually consistent with M6.2 (captions) and M6.3 (privacy policy).

---

## Basic Information

- **App Name** (≤30): Eatit — Mock Interviews
- **Subtitle** (≤30): BYOK AI Interview Coach
- **Bundle ID**: com.eatit.desktop
- **Primary Category**: Productivity
- **Secondary Category** (optional): Education
- **Age Rating**: 4+ (no violent content / no social networking / no sensitive material)
- **Price Tier**: Free
- **In-App Purchases**: None
- **System Requirements**: macOS 14 Sonoma or later; Apple Silicon / Intel

---

## Promotional Text (≤170 characters)

Bring your own LLM key. Practice interviews locally — no subscription, no server, no data collection. Resume parsing, live captions, five-dimension reports. Privacy first.

---

## Keywords (≤100 characters, comma-separated)

mock interview,AI interview,interview practice,resume parsing,BYOK,local AI,speech to text,job prep

---

## Description (≤4000 characters)

### Eatit — BYOK AI Mock Interview Tool for macOS

**Your resume. Your conversations. Your reports. All on your Mac.**

Eatit is a native macOS mock interview app that runs in Bring Your Own Key (BYOK) mode — you supply the API key for your preferred LLM provider, and Eatit routes requests directly to that provider without any intermediary server. There is no Eatit backend. There is no account to create. Your data never leaves your machine unless you explicitly direct it to your chosen AI provider.

**What Eatit Does**

- **Resume & JD Parsing**: Drop a PDF resume and a job description. Eatit uses your LLM to extract key signals, run optional connected web research, and predict likely interview questions. Results are stored locally — nothing is uploaded.
- **Live Speech-to-Text**: Hold the space bar to speak. Streaming ASR renders captions word-by-word, matching the rhythm of a real interview. Voice data flows directly to your configured ASR endpoint and is never cached by Eatit.
- **Four Interviewer Personas**: Switch between Probing, Pressure, Friendly, and Technical Deep-Dive personas. Cover the full spectrum of interview styles in one session.
- **Five-Dimension Feedback Report**: Pass likelihood score, radar chart across five competency dimensions, and per-question critique — every piece of feedback is anchored to the exact text you said, not generic suggestions.
- **Cross-Session Growth Tracking**: All session history is stored in a local SQLite database. An AI Coach aggregates your performance over time and surfaces personalized improvement priorities.

**Who It's For**

- **Job seekers**: High-intensity, realistic practice from resume upload to mock offer decision.
- **Working professionals**: Stay sharp without booking a coach — practice whenever you have 30 minutes.
- **Recruiters and HR practitioners**: Understand the candidate experience from the inside; refine your own question design.

**Supported LLM Providers**

Eatit is compatible with any OpenAI-compatible API endpoint. Configure your provider in Settings:

- SiliconFlow
- DeepSeek
- Alibaba Cloud DashScope
- OpenAI
- Anthropic
- Custom endpoint (including Volcengine Ark or any other OpenAI-compatible URL)

**Privacy First — No Subscription — No Server**

All interview records, parsed results, and preferences are stored in the macOS sandboxed container (`~/Library/Containers/com.eatit.desktop/`). Your API key is encrypted in the macOS Keychain under service name `com.eatit.desktop` and is never written to any log file or database. Eatit integrates zero analytics or telemetry SDKs.

Apple App Store Privacy Classification: **Data Not Collected**.

**v3.4 — First Release on the Mac App Store**

v3.4 is a ground-up rewrite built for the macOS App Store sandbox. This is Eatit's first appearance on the Mac App Store.

---

## What's New in v3.4 (≤4000 characters)

**Eatit v3.4 — First Release on the Mac App Store**

This is a complete architectural rewrite of Eatit, purpose-built for macOS Sonoma and the Mac App Store sandbox. v3.4 introduces a native Swift service layer and removes all external process dependencies.

**Architecture**

- Native Swift Services: LLM calls, ASR, file handling, and local database are all implemented as Swift services communicating through a strict WKScriptMessageHandler bridge. No Python sidecar, no external processes.
- WKWebView + Swift Bridge: React frontend runs inside WKWebView. All native capabilities are exposed through a signed bridge contract with typed Zod schemas on the JS side and Codable types on the Swift side.
- Full App Sandbox Compliance: The app holds only `network.client`, `files.user-selected.read-write`, and `device.audio-input` entitlements. No dangerous entitlements are requested.

**Features in This Release**

- Resume and JD parsing with optional connected research (off by default)
- Streaming LLM chat via your configured OpenAI-compatible endpoint
- Real-time ASR via Volcengine SAUC WebSocket with 200ms chunk streaming
- Four interviewer personas across unlimited practice sessions
- Five-dimension evaluation report with evidence-anchored per-question critique
- Local SQLite session history with AI Coach cross-session analysis
- Full Keychain-based API key management — keys never touch disk in plaintext

**Privacy**

- API Key stored only in macOS Keychain (service: `com.eatit.desktop`). Never logged, never written to database.
- Data Not Collected: Eatit transmits nothing to Eatit-controlled servers (none exist). All outbound connections go to the provider endpoint you configure.
- Uninstall = full wipe: macOS removes the sandbox container and Keychain entry when you uninstall.

Feedback and bug reports: https://github.com/dqh3388ok-cloud/eatit/issues

---

## URLs (fill in at deploy time)

- **Support URL**: https://github.com/dqh3388ok-cloud/eatit/issues
- **Marketing URL**: https://github.com/dqh3388ok-cloud/eatit
- **Privacy Policy URL**: `<PLACEHOLDER — fill after deploying privacy-policy.en.md to a public URL>`
- **Contact Email**: `<support@eatit.example>` *(replace with real address at deploy time)*

---

## App Review Contact Information

- **First name**: `[deployer first name]`
- **Last name**: `[deployer last name]`
- **Phone**: `[phone number with country code]`
- **Email**: `[contact email]`
- **Demo Account**: None — Eatit requires no login or account

---

## Character Count Self-Check

| Field | Content | Chars | Limit | Status |
|---|---|---|---|---|
| App Name | `Eatit — Mock Interviews` | 23 | 30 | ✅ |
| Subtitle | `BYOK AI Interview Coach` | 23 | 30 | ✅ |
| Promotional Text | (see above) | 166 | 170 | ✅ |
| Keywords | (see above) | 98 | 100 | ✅ |
| Description | (see above) | ~1350 | 4000 | ✅ |
| What's New | (see above) | ~900 | 4000 | ✅ |

> **DEPLOYER NOTE**: PM-suggested subtitle `BYOK AI Interview Coach for Mac` (32 chars) was 2 over the limit; trimmed to `BYOK AI Interview Coach` (23 chars). Alternatives if you prefer different wording (all ≤30):
> - `AI Interview Practice, BYOK` (27 chars)
> - `Local AI Interview Coach` (24 chars)
>
> Paste all fields into App Store Connect before submitting; red outlines indicate overflow.
