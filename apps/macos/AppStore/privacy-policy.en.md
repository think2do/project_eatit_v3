# Eatit Privacy Policy

> Effective date: 2026-05-05

This document explains how Eatit handles your data. **Bottom line: Eatit does not collect, store, or analyze any user data on any server.** All your interview content, resume text, reports, and transcripts exist only on your own Mac.

---

## 1. Who We Are

Eatit is a native macOS mock-interview application. It has no backend server, no account system, and no cloud storage of its own. When you use Eatit, all processing runs on your device — or through the third-party API providers you configure yourself (LLM / ASR).

Eatit is an open-source personal project. Main repository: https://github.com/dqh3388ok-cloud/eatit

---

## 2. What Data We Collect

**We don't collect any user data.**

Eatit has no analytics service, no error-tracking backend, and no telemetry pipeline. The following categories of data never leave your device to reach any server controlled by Eatit:

| Data Category | Collected |
|---|---|
| Resume content | No |
| Interview transcripts | No |
| Name / email / phone number | No |
| IP address | No |
| Cookies | No |
| Device identifiers (IDFA, serial number, etc.) | No |
| Browsing history | No |
| Contacts / address book | No |
| Location | No |
| Health data | No |
| Financial information | No |
| Photos / camera data | No |
| Microphone metadata | No |
| Sensor data | No |

Eatit requests microphone permission solely to record your spoken answers during a mock interview. That audio is sent directly to your configured ASR provider for transcription — Eatit does not cache, archive, or inspect it.

---

## 3. Where Your Data Lives

All interview records, parsed results, and preference settings are stored in the local macOS sandboxed container on your device:

```
~/Library/Containers/com.eatit.desktop/
```

This directory is strictly isolated by macOS's sandbox mechanism — other applications cannot access it. **When you uninstall Eatit, macOS automatically removes everything in this directory.** Eatit has no ability to sync this data to any external location.

Your API Key is stored encrypted in the macOS Keychain. When you uninstall the app, macOS clears the Keychain entry along with the sandbox container.

---

## 4. Outbound Requests

Eatit itself does not communicate with any Eatit-controlled server. The only outbound connections the app can make are:

### 4.1 LLM (Large Language Model) Calls

Eatit operates in Bring Your Own Key (BYOK) mode. You configure your chosen provider's API key and base URL in Settings. Eatit then sends interview text directly to the endpoint you specify. Supported providers include:

- SiliconFlow (`https://api.siliconflow.cn/v1`)
- DeepSeek (`https://api.deepseek.com/v1`)
- Alibaba Cloud DashScope (`https://dashscope.aliyuncs.com/compatible-mode/v1`)
- OpenAI (`https://api.openai.com/v1`)
- Anthropic (`https://api.anthropic.com/v1`)
- Custom endpoint (any OpenAI-compatible URL you provide)

**Eatit does not proxy, cache, or log these requests.** Content travels directly from your device to the endpoint you designate. You establish a direct data-processing relationship with that provider, governed by their own privacy policy.

### 4.2 ASR (Automatic Speech Recognition) Calls

When voice mode is enabled, recorded audio is sent over WebSocket directly to your configured ASR provider. Eatit does not intercept, store, or retain the audio or the resulting transcript.

### 4.3 Connected Research (Optional, Off by Default)

When you explicitly enable the "Connected Research" feature in Settings, Eatit sends **only the company name, job title, and industry keywords** extracted from the job description to your LLM provider for public-information retrieval. **Resume body text, your name, email, phone number, and any other personally identifiable fields are never sent through this feature.** The feature is off by default; you can disable it at any time in Settings.

---

## 5. Third-Party Providers

Eatit itself does not bundle any third-party SDKs or services. The LLM and ASR providers you configure in Settings are third-party services you actively choose to connect to. You should review each provider's own privacy policy to understand how they handle the content you send:

- SiliconFlow: https://cloud.siliconflow.cn/
- DeepSeek: https://platform.deepseek.com/
- Alibaba Cloud: https://www.aliyun.com/product/bailian
- OpenAI: https://openai.com/privacy
- Anthropic: https://www.anthropic.com/privacy

If you use Volcengine Ark or Volcengine SAUC (ByteDance Speech) as a custom endpoint, the outbound hosts are `ark.cn-beijing.volces.com` (LLM) and `openspeech.bytedance.com` (ASR WebSocket).
- Volcengine Privacy Policy: https://www.volcengine.com/docs/privacy
- Volcengine Speech Open Platform: https://www.volcengine.com/

**Eatit has no commercial partnership, data-sharing agreement, or subprocessor relationship with any of these providers.** Eatit acts only as a local client tool that routes your requests, according to your configuration, to the endpoint you have chosen.

---

## 6. API Key Handling

Your API key's complete lifecycle:

1. **Input**: You type your API key in Settings.
2. **Storage**: The key is encrypted and stored in the macOS Keychain under the service name `com.eatit.desktop`. **The key is never written to log files, the SQLite database, or any plain-text file.**
3. **Use**: When making an LLM or ASR request, the key exists briefly in memory and is transmitted in the HTTP request header to your designated provider endpoint.
4. **Visibility**: Eatit engineers and Eatit servers (which do not exist) can never see your key.
5. **Deletion**: After you uninstall Eatit, macOS automatically removes the Keychain entry together with the sandbox container. You can also manually clear it in Settings → Data Management.

---

## 7. No Tracking, No Analytics

Eatit does not integrate any analytics or error-tracking service. The following are **absent** from Eatit:

- Sentry
- Firebase / Google Analytics
- Mixpanel
- PostHog
- Amplitude
- Segment
- Crashlytics
- AppsFlyer
- Any other telemetry SDK

Eatit does not collect crash reports, usage statistics, or feature-interaction data. If you encounter a problem, please reach out through the contact information at the end of this document.

---

## 8. Apple App Store Privacy Details

Under Apple's App Privacy Details framework, Eatit's data collection classification is:

**Data Not Collected**

Eatit does not collect data that is linked to your identity or used for tracking purposes.

---

## 9. Your Control

You're in full control of your data:

- **Clear your API key**: Go to Settings → Data Management → "Clear Local Data" to remove the API key stored in Keychain.
- **Clear all local data**: Uninstalling Eatit removes everything under `~/Library/Containers/com.eatit.desktop/`, including all interview records and application data.
- **Disable connected research**: Turn off "Connected Research" in Settings to stop Eatit from sending job-description keywords to your LLM provider.

You don't need to submit a deletion request to Eatit — we never hold your data.

---

## 10. Children's Privacy

Eatit is designed for job seekers and working professionals and is not directed at children.

- In most countries: users under 13 years of age should not use this application.
- In mainland China: users under 14 years of age should not use this application, in accordance with applicable regulations.

Because Eatit does not collect any data, we have no means to identify a user's age. If you are a minor, please use this application under the supervision of a parent or guardian.

---

## 11. Changes to This Policy

When we make material changes to this privacy policy, we will notify users via App Store update notes (Release Notes). Continuing to use an updated version of the app indicates that you have reviewed and accepted the revised policy. Significant changes will be announced in Release Notes no fewer than 7 days before taking effect.

Previous versions of this policy are preserved via Git commit history in the main repository:
https://github.com/dqh3388ok-cloud/eatit

---

## 12. Governing Law and Disputes

This policy is governed by the laws of the People's Republic of China. Any dispute arising from this policy that cannot be resolved through friendly negotiation shall be submitted to the competent court with jurisdiction.

---

## 13. Contact

If you have any questions about this privacy policy, please reach out:

- **Email**: [support@eatit.example](mailto:support@eatit.example) *(replace with your actual support email when deploying)*
- **GitHub Issues**: https://github.com/dqh3388ok-cloud/eatit/issues

---

*Eatit is an open-source personal project. This privacy policy is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — you are free to adapt it for your own open-source project.*

*Last updated: 2026-05-05*
