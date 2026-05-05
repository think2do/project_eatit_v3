# Eatit App Store Connect 元数据 — 简体中文 (zh-Hans)

> 用于 App Store Connect Mac App 上架页。所有字段已校验 Apple 字符上限。
> 本文件随 M6.4 产出,与 M6.2(截图文案)、M6.3(隐私政策)事实保持一致。

---

## 基本信息

- **App Name**(≤30):Eatit — AI 模拟面试
- **Subtitle**(≤30):BYOK 本地面试练习神器
- **Bundle ID**:com.eatit.desktop
- **Primary Category**:Productivity
- **Secondary Category**(可选):Education
- **Age Rating**:4+(无暴力 / 无敏感内容 / 无社交功能)
- **Price Tier**:Free
- **In-App Purchases**:无
- **System Requirements**:macOS 14 Sonoma 或更高;Apple Silicon / Intel

---

## Promotional Text(≤170 字符)

自带大模型密钥,面试全程离线存储。简历解析、实时字幕、五维报告——隐私优先,0 订阅,0 服务器,Mac 上最纯粹的 AI 面试练习工具。

---

## Keywords(≤100 字符,半角逗号分隔)

模拟面试,AI面试,面试练习,简历解析,本地AI,BYOK,面试报告,语音转写,求职,大模型

---

## Description(≤4000 字符)

### Eatit — BYOK AI 本地模拟面试

**你的简历、你的对话、你的报告——只在你的 Mac 上。**

Eatit 是一款运行在 macOS 上的原生模拟面试工具,采用「自带密钥」(BYOK, Bring Your Own Key)模式直连主流大模型。Eatit 没有后端服务器、没有账号系统、没有云存储——你与大模型之间是点对点连接,Eatit 只是那条安全的通道。

**核心能力**

- 简历与 JD 一键解析:上传 PDF 简历和招聘 JD,AI **可选**联网情报检索(默认关闭),预测高频问题,解析结果本地存储、秒出可用。
- 实时语音转写:按住空格键发言,流式 ASR 驱动逐字显示字幕,模拟真实面试节奏。
- 四种面试官人格:主动追问型、压力型、友好型、技术深挖型,轮番切换,全面覆盖实际场景。
- 五维度评估报告:通过可能性评分 + 雷达图 + 单题点评,每条建议精确绑定你的原文作答作为证据,报告本地保存永不丢失。
- 跨场次成长追踪:历史面试数据聚合,AI Coach 给出个性化改进路线,帮你看清真实短板。

**适合谁**

- 正在求职的应届生和职场人:从简历到 offer,全流程高强度练习。
- 想精进面试表达的在职人员:随时模拟、即时反馈、无需约教练。
- 希望熟悉面试官视角的 HR 从业者:体验候选人答题路径,优化面试题设计。

**支持的大模型 Provider**

Eatit 兼容所有主流 OpenAI-compatible 接口,你可以在「设置」中自由切换:

- 硅基流动 SiliconFlow
- DeepSeek
- 阿里云百炼 DashScope
- OpenAI
- Anthropic
- 自定义端点(含火山引擎方舟 Volcengine Ark 等任意 OpenAI-compatible 接口)

**隐私第一**

所有面试记录、解析结果和偏好设置均保存在本机 macOS 沙盒容器(`~/Library/Containers/com.eatit.desktop/`)中。API Key 加密存储于 macOS 钥匙串,卸载即彻底删除。Eatit 不集成任何分析或遥测服务。Apple App Store 隐私分类:**Data Not Collected(不收集数据)**。

**v3.4 — 首次登陆 Mac App Store**

v3.4 是 Eatit 全新重构的 macOS 原生版本,基于 WKWebView + Swift Native Services 架构,专为 App Store 沙盒环境深度优化。这是 Eatit 在 Mac App Store 的首次亮相。

---

## What's New in v3.4(≤4000 字符)

**Eatit v3.4 — 首次上架 Mac App Store**

这是 Eatit 的全新重构版本,也是在 Mac App Store 的首次亮相。v3.4 从底层重新设计,专为 macOS Sonoma 沙盒环境打造,带来更稳定、更安全、更完整的面试练习体验。

**架构重构**

- 全新 Swift Native Services 架构:LLM 调用、语音识别、文件处理、数据库均通过原生 Swift 服务实现,彻底告别对第三方 Python sidecar 的依赖。
- WKWebView + Swift Bridge:React 前端通过严格的 WKScriptMessageHandler 桥接 Native 层,消息签名验证,无明文 Key 流转。
- 沙盒完整合规:仅持有 `network.client`、`files.user-selected.read-write`、`device.audio-input` 三项功能权限,零危险 entitlement。

**核心功能**

- 简历与 JD 解析:PDF 原生解析(PDFKit),联网情报检索可选,高频题目预测。
- 实时 ASR 语音转写:Volcengine 流式 WebSocket ASR,逐字字幕,200ms 低延迟推流。
- 多轮 AI 面试问答:基于 LLM 流式输出,支持工具调用,四种面试官人格。
- 五维评估报告:通过可能性 + 专业度 + 表达力 + 逻辑性 + 抗压力五维雷达图 + 单题文本证据锚点。
- 面试历史管理:本地 SQLite(GRDB)存储,跨场次数据聚合,AI Coach 个性化建议。

**隐私与安全**

- API Key 仅存 Keychain,不写日志,不入数据库,不过 JS 层。
- Data Not Collected:Eatit 不收集、不上传任何用户数据。
- 卸载即清零:卸载 Eatit 后,macOS 自动删除沙盒容器内全部数据。

欢迎通过 GitHub Issues 反馈问题或建议:https://github.com/dqh3388ok-cloud/eatit/issues

---

## URLs(部署时填实)

- **Support URL**:https://github.com/dqh3388ok-cloud/eatit/issues
- **Marketing URL**:https://github.com/dqh3388ok-cloud/eatit
- **Privacy Policy URL**:`<PLACEHOLDER — 部署 privacy-policy.zh.md 后填真实 URL>`
- **联系邮箱**:`<support@eatit.example>` *(部署时替换为真实联系邮箱)*

---

## App Review 联系信息

- **First name / 名**:`[填部署人名]`
- **Last name / 姓**:`[填部署人姓]`
- **Phone**:`[填可联系电话,含国际区号]`
- **Email**:`[填可联系邮箱]`
- **Demo Account**:无 — Eatit 不需要登录账号

---

## 字符数自检

| 字段 | 内容 | 字符数 | 上限 | 状态 |
|---|---|---|---|---|
| App Name | `Eatit — AI 模拟面试` | 12 | 30 | ✅ |
| Subtitle | `BYOK 本地面试练习神器` | 13 | 30 | ✅ |
| Promotional Text | (见上) | 68 | 170 | ✅ |
| Keywords | (见上) | 47 | 100 | ✅ |
| Description | (见上) | ~1050 | 4000 | ✅ |
| What's New | (见上) | ~700 | 4000 | ✅ |

> 注:Description 和 What's New 字符数为估算值(含标点和换行),Subtitle/App Name 字符数为实测;**部署前请在 App Store Connect 编辑界面粘贴验证,字段边框变红即超限,以 ASC 验证为准**。
