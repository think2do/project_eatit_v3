<div align="center">
  <img src="apps/macos/Eatit/Assets.xcassets/AppIcon.appiconset/icon_128x128.png" alt="Eatit" width="96" height="96" />

  <h1>Eatit</h1>

  <p><strong>本地优先的 AI 模拟面试系统 · macOS App Store 交付版本</strong></p>

  <p>
    <img alt="platform" src="https://img.shields.io/badge/platform-macOS%2014%2B-lightgrey" />
    <img alt="shell" src="https://img.shields.io/badge/native-Swift%20%2B%20WKWebView-blue" />
    <img alt="frontend" src="https://img.shields.io/badge/frontend-React%2018%20%2B%20TypeScript-3178c6" />
    <img alt="agents" src="https://img.shields.io/badge/agents-LangGraph.js-success" />
    <img alt="distribution" src="https://img.shields.io/badge/distribution-Mac%20App%20Store-black" />
  </p>

  <p>
    上传简历和岗位 JD,配置面试风格与方向,Eatit 会组织多轮 AI 模拟面试,给出实时观察、参考回答、评估报告和跨场次成长建议。
  </p>
</div>

---

## 项目概览

Eatit 是一个面向求职者的 AI 模拟面试 macOS 应用。产品主线是「简历 + JD → 多轮面试 → 评估报告 → 跨场次成长追踪」,不是简历生成器、岗位推荐平台或招聘 SaaS。

当前 v3.4 版本以 Mac App Store 上架为最终交付定义,架构已收敛为 Swift 原生壳 + WKWebView + React 前端 + 本地 TypeScript Agent 编排。应用不开本地服务端,不依赖 Python sidecar,不提供 DMG 或网站下载等备用分发路径。

## 体验版下载(macOS · 临时内测包)

> ⚠️ 这是供**临时体验 / 内测**的 Developer ID 签名包,**非正式分发渠道**;正式版本以 Mac App Store 上架版为准(见下方「产品约束」)。

EatIt 体验包放在仓库的 **[`app/EatIt.zip`](app/EatIt.zip)** 文件夹里。

本包已 **Developer ID 签名 + Apple 公证**,正常双击即可打开。

**怎么打开:**

1. 下载 `app/EatIt.zip`,**双击解压**(用访达自带的解压,得到 `EatIt.app`),拖到「应用程序」或任意位置。
2. **双击 `EatIt.app` 打开**;首次可能弹一次「这是从互联网下载的 App,确定打开吗」→ 点「打开」即可(已公证,无需右键绕行)。
3. 进入后会停在「设置」页 → 填入你**自己的大模型 API Key**(BYOK,仅保存在本机钥匙串)→ 测试连接通过即可开始面试。
4. 语音回答:首次点「开始录音」时,在系统弹窗里允许麦克风。
5. 万一提示异常:打开「终端」执行 `xattr -cr /路径/EatIt.app` 后重试(极少需要)。

**环境要求:** macOS 14+;自带一个大模型 API Key(BYOK,本地调用,不经任何服务器)。

## 核心功能

| 模块           | 能力                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| 简历与 JD 解析 | 提炼岗位匹配点、简历亮点、潜在风险和可追问项目                                                                   |
| 联网情报       | 用户 opt-in 后,只用公司名、岗位名、行业关键词检索公司与行业信息                                                  |
| 面试配置       | 支持 4 种面试风格、6 个方向多选 1-3 项、15/30/45 分钟时长                                                        |
| 多 Agent 面试  | Parse、Research、Framework、Interviewer、Reference Answer、Compression、Report、Coach、Reflection、Observer 协作 |
| 实时面试       | AI 面试官出题、追问线索、语音/文字回答、实时统计和观察侧栏                                                       |
| 参考回答       | 每轮异步生成参考话术,默认折叠,避免用户照念                                                                       |
| 评估报告       | 五维度评分、单题评分、通过可能性三档、证据绑定反馈                                                               |
| 复盘与成长     | 单场 Reflection 教学复盘 + 跨场次 Coach 个性化建议                                                               |
| 本地存储       | SQLite + macOS Sandbox 容器,数据留在用户设备内                                                                   |

## 产品约束

- App Store 是唯一正式分发渠道。
- macOS 版本要求为 macOS 14.0+。
- Sandbox 必须开启。
- 不使用 `network.server` entitlement。
- 不使用 `disable-library-validation` entitlement。
- 不在运行时下载可执行代码、动态库或 native 模块。
- API Key 只进入 Keychain 和运行时内存,不得写入日志、Sentry 或 SQLite。
- WebView 网络白名单限制为火山引擎 Ark 与 OpenSpeech 相关域名。
- JS 与 Swift bridge 使用双端 schema 化契约,Codable 与 Zod 同步维护。

## 技术栈

| 层级       | 选型                                                        |
| ---------- | ----------------------------------------------------------- |
| macOS 壳   | Swift、AppKit/SwiftUI、WKWebView、Xcode project             |
| 前端       | React 18、TypeScript、Vite、XState、TanStack Query、Zustand |
| Agent 编排 | LangGraph.js、Zod、Vercel AI SDK                            |
| 数据契约   | TypeScript interfaces、Zod schema、Swift Codable            |
| 本地数据库 | SQLite + WAL,Swift 侧服务经 bridge 暴露给前端               |
| LLM        | 火山引擎 Ark,BYOK 模式                                      |
| ASR        | 火山引擎流式 SAUC,Swift native 代理                         |
| TTS        | macOS 系统语音能力                                          |
| 测试       | Vitest、Playwright、XCTest、xcodebuild                      |

## 架构

```text
Eatit.app
├─ Swift macOS shell
│  ├─ WKWebView
│  ├─ BridgeRouter
│  ├─ KeychainService
│  ├─ LLMGateway
│  ├─ ASRGateway
│  ├─ DatabaseService
│  └─ PDFParserService
│
└─ React application
   ├─ pages/
   ├─ components/
   ├─ services/nativeBridge.ts
   ├─ core agents
   └─ LangGraph.js graphs

Data:
~/Library/Containers/<bundle-id>/Data/Library/Application Support/Eatit/eatit.db

Network allowlist:
https://ark.cn-beijing.volces.com
wss://openspeech.bytedance.com
```

## 仓库结构

```text
.
├── apps/
│   ├── desktop/          # React + TypeScript 前端
│   └── macos/            # Swift macOS App、Bridge、服务与 XCTest
├── docs/
│   ├── PRD/              # 产品需求与版本约束
│   ├── design-reference/ # 设计系统与页面原型
│   └── FEATURES.md       # 已实现功能镜像
├── packages/
│   └── shared-types/     # 跨端共享类型
├── scripts/              # 校验、构建、隐私与签名辅助脚本
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## 本地开发

### 环境要求

- macOS 14+
- Xcode 15+
- Node.js 20+
- pnpm 9+

### 安装依赖

```bash
corepack enable
pnpm install
```

### 启动前端开发服务器

```bash
pnpm --dir apps/desktop dev
```

### 构建前端资源

```bash
pnpm --dir apps/desktop build
```

### 构建 macOS App

```bash
xcodebuild build \
  -project apps/macos/Eatit.xcodeproj \
  -scheme Eatit \
  -destination "platform=macOS"
```

### 运行测试

```bash
pnpm --dir apps/desktop test
pnpm --dir apps/desktop exec tsc --noEmit
xcodebuild test \
  -project apps/macos/Eatit.xcodeproj \
  -scheme Eatit \
  -destination "platform=macOS"
```

## App Store 发布检查

发布前至少需要完成以下闸门:

- `xcodebuild archive` 通过。
- entitlements 校验通过,确认 Sandbox 开启。
- `spctl --assess` 通过。
- 网络监控只命中白名单 host。
- `PrivacyInfo.xcprivacy` 完整。
- TestFlight 上传通过。
- App Store Review 拒绝项在 48 小时内修复并重新提交。

## 隐私原则

- 简历、JD、面试记录、报告和成长建议默认存储在本机。
- API Key 存储在 macOS Keychain。
- Research Agent 必须由用户显式授权后才运行。
- Research Agent payload 只允许包含公司名、岗位名和行业关键词。
- 禁止把简历正文、姓名、邮箱、电话或其他 PII 发送给联网检索。
- 日志不得记录明文 API Key 或明文公司 cache key。

## 当前状态

- v3.2/v3.3 的多 Agent 面试能力已完成主体实现。
- v3.4 已迁移到 App Store 友好的 Swift + WKWebView 架构。
- 后续工作聚焦 App Store 提交流程、审核修复、体验打磨和发布材料完善。

## 协作者

<table>
  <tr>
    <td align="center" width="130">
      <a href="https://github.com/CrazyGoudanli">
        <img src="https://github.com/CrazyGoudanli.png" width="72" alt="呆胶布" /><br/>
        <sub><b>呆胶布</b></sub>
      </a>
    </td>
    <td align="center" width="130">
      <a href="https://github.com/dqh3388ok-cloud">
        <img src="https://github.com/dqh3388ok-cloud.png" width="72" alt="dqh3388ok-cloud" /><br/>
        <sub><b>dqh3388ok-cloud</b></sub>
      </a>
    </td>
    <td align="center" width="130">
      <a href="https://github.com/KakooChung">
        <img src="https://github.com/KakooChung.png" width="72" alt="KakooChung" /><br/>
        <sub><b>KakooChung</b></sub>
      </a>
    </td>
    <td align="center" width="130">
      <a href="https://github.com/z13141557217-web">
        <img src="https://github.com/z13141557217-web.png" width="72" alt="Hong Tao Zhou" /><br/>
        <sub><b>Hong Tao Zhou</b></sub>
      </a>
    </td>
    <td align="center" width="130">
      <a href="https://github.com/Yee-hub-dev">
        <img src="https://github.com/Yee-hub-dev.png" width="72" alt="Yee-hub-dev" /><br/>
        <sub><b>Yee-hub-dev</b></sub>
      </a>
    </td>
  </tr>
</table>

<sub>排名不分先后。</sub>

## License

当前仓库尚未添加开源许可证。未经授权,请勿复制、分发或用于商业用途。
