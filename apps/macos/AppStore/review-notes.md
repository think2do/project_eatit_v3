# Eatit — App Store Review Notes

> Submitted to App Store Connect → App Version → "Notes for Apple Reviewer"
> Language: English (Apple Review team standard)
> Updated: 2026-05-05

---

## Summary

Eatit is a BYOK (Bring Your Own Key) AI mock interview tool for macOS.
No subscriptions, no in-app purchases, no server backend, no
third-party SDKs, no telemetry.

---

## KEY POINTS FOR REVIEW

1. **NO subscription, NO IAP, NO charges to users.**
   The app is free with no paid tiers, no consumables, and no
   subscription options of any kind.

2. **All AI features (LLM + ASR) require the user to provide their own
   API keys from a third-party provider they choose** — for example,
   SiliconFlow, DeepSeek, DashScope, OpenAI, Anthropic, or a custom
   OpenAI-compatible endpoint such as Volcengine Ark.
   Eatit does not charge for AI usage; the user's provider bills them
   directly under their own agreement with that provider.

3. **API keys are stored ONLY in the macOS Keychain** (service name:
   `com.eatit.desktop`). Keys are never transmitted to any server we
   control. WE HAVE NO SERVER. Keys are never written to log files,
   the SQLite database, or any plain-text file.

4. **All interview data** (resume text, recordings, transcripts,
   reports) **is stored locally** in the app's sandbox container at
   `~/Library/Containers/com.eatit.desktop/`. Nothing is uploaded to
   any Eatit-controlled destination. The only outbound traffic is the
   user's LLM and ASR API calls, routed directly to the endpoint the
   user configures.

5. **Network access is restricted to user-configured endpoints.**
   With the default Volcengine configuration, that means:
   - `https://ark.cn-beijing.volces.com` — LLM (HTTPS)
   - `wss://openspeech.bytedance.com` — ASR (WebSocket)
   These are the only two hosts listed in the app's ATS exception list.
   No other outbound connections originate from the app.

6. **The app is fully sandboxed.**
   `com.apple.security.app-sandbox = true`
   Entitlements present:
   - `com.apple.security.network.client` (required for LLM + ASR calls)
   - `com.apple.security.files.user-selected.read-write` (file picker for resume/JD upload)
   - `com.apple.security.device.audio-input` (microphone for voice interview mode)

   The app does NOT request or use any of the following:
   - `com.apple.security.cs.disable-library-validation`
   - `com.apple.security.network.server`
   - `com.apple.security.cs.allow-jit`
   - `com.apple.security.temporary-exception.*` (any)

7. **Privacy classification: "Data Not Collected"** — Eatit integrates
   zero analytics, crash reporting, or telemetry SDKs. No data is
   collected or linked to user identity. Full privacy policy:
   `<PLACEHOLDER URL — fill with deployed privacy policy URL before submission>`

---

## TEST CREDENTIALS (provided for review only — do not redistribute)

> ★ DEPLOYER: Generate fresh, short-lived test credentials with a usage
> cap before each submission. Rotate after Apple Review concludes.
> Do NOT paste production keys here.

**Volcengine Ark (LLM)**
- ARK API Key: `[paste short-lived test key here — min 30-day validity]`
- Model: `doubao-seed-1-6-250615` (or whatever default model is active)
- Endpoint: `https://ark.cn-beijing.volces.com/api/v3/chat/completions`

**Volcengine SAUC (ASR)**
- App ID: `[paste test AppID here]`
- Access Token: `[paste test token here]`
- Endpoint: `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`

---

## DEMO STEPS

Follow these steps to verify all major features end-to-end:

1. **Launch the app.** The onboarding screen appears. No login required.

2. **Configure your LLM provider.**
   - Open Settings → LLM Provider
   - Select "Volcengine Ark" (or choose any supported provider)
   - Paste the ARK API Key from the test credentials above
   - Model: `doubao-seed-1-6-250615`
   - Click "Test Connection" — wait approximately 3 seconds for the green
     confirmation badge.

3. **Configure ASR for voice mode** (optional but recommended).
   - Open Settings → ASR
   - Paste the App ID and Access Token from the test credentials above
   - Click "Test Connection"

4. **Upload a resume and job description.**
   - Click "New Interview" → "Upload Resume"
   - Upload any PDF resume (1–5 pages)
   - Paste or upload a plain-text job description
   - Click "Start Parse" and wait approximately 20–40 seconds for the
     Parse Agent to extract key signals and generate predicted questions.

5. **Configure the interview session.**
   - Select interview style: Structured (recommended for demo)
   - Select 1 focus direction
   - Set duration: 30 minutes
   - Click "Start Interview" and wait approximately 10–30 seconds for the
     Framework Agent to build the question plan.

6. **Run a mock interview.**
   - Type your answers, or press-and-hold the space bar to use voice.
   - 3–5 question-answer turns is sufficient to demonstrate all features.
   - The interviewer AI persona will ask follow-up questions based on
     your responses.

7. **End the session and review the report.**
   - Click "End Session"
   - Wait approximately 20–40 seconds for the Report Agent to generate.
   - Review: pass likelihood score, five-dimension radar chart,
     per-question critique with evidence anchors from your answers.

8. **Check the History screen.**
   - Navigate to History / Dashboard
   - The completed session appears in the list.
   - AI Coach suggestions are visible in the cross-session panel.

---

## ALL HISTORICAL DATA IS LOCAL

After Review, you can verify that nothing was uploaded:
1. Quit the app.
2. In Terminal: `rm -rf ~/Library/Containers/com.eatit.desktop/`
3. Relaunch the app — all session history is gone.

The app has no backup or sync mechanism, because there is no remote
service to back up to.

---

## CONTACT

- **Privacy Policy**: `<PLACEHOLDER URL — fill before submission>`
- **Support / Bug Reports**: https://github.com/dqh3388ok-cloud/eatit/issues
- **Source Repository**: https://github.com/dqh3388ok-cloud/eatit
- **Deployer Email**: `[fill with real contact email before submission]`

---

## REJECTION HISTORY

(none — this is the first submission)
