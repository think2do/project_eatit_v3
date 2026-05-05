<div align="center">
  <img src="apps/desktop/src-tauri/icons/128x128.png" alt="Eatit" width="96" height="96" />

  <h1>Eatit</h1>

  <p><strong>BYOK 的本地 AI 模拟面试官 · macOS 桌面应用</strong></p>

  <p>
    <a href="#%E5%AE%89%E8%A3%85"><img alt="platform" src="https://img.shields.io/badge/platform-macOS%2014%2B-lightgrey" /></a>
    <a href="#%E6%8A%80%E6%9C%AF%E6%A0%88"><img alt="frontend" src="https://img.shields.io/badge/frontend-Swift%20%2B%20WKWebView%20%2B%20React%2018-blue" /></a>
    <a href="#%E6%8A%80%E6%9C%AF%E6%A0%88"><img alt="backend" src="https://img.shields.io/badge/backend-Local%20TS%20Agents-success" /></a>
    <a href="#%E6%8A%80%E6%9C%AF%E6%A0%88"><img alt="asr" src="https://img.shields.io/badge/ASR-Volcengine%20SAUC-orange" /></a>
  </p>

  <p>
    上传简历与 JD,自定义面试风格,Eatit 用你自己的 LLM Key 给你做一场结构化模拟面试,本地 SQLite,无登录,无云同步。
  </p>
</div>

---

## 为什么选 Eatit

- **完全本地**:简历、面试录音、回答记录、报告全部存在 macOS Sandbox 容器目录,不上传任何云
- **BYOK(Bring Your Own Key)**:你用自己的火山引擎 Ark Key 调 LLM,Eatit 不中转、不计费、不接触余额
- **macOS 原生**:Swift app + 嵌入 WKWebView + 本地 SQLite,所有数据停留在本机,符合 App Store sandbox 规范
- **真实临场感**:面试官语音播报问题、按住说话录音、实时转写,跟真实电话面试节奏一致
- **AI 全程辅助**:答题时可一键查看参考提纲;每轮答完右侧会有 AI 观察提醒;最终生成带证据绑定的评估报告

## 截图

> *截图位待补,可拖一张 Eatit 实机截图到 `docs/` 后引用*

## 主要功能

| 模块 | 描述 |
| --- | --- |
| 简历 + JD 解析 | ParseAgent 从简历 + JD 提炼匹配点、亮点、风险、可深挖的项目 |
| 自定义面试框架 | 选风格(友好引导 / 标准专业 / 高强度追问)、方向(岗位匹配 / 项目深挖 / 行为综合)、时长(15/20/30 min) |
| 实时面试 | 语音 / 文字双模,火山引擎 SAUC 流式 ASR(Bring Your Own Volc credentials),中文语音播报问题 |
| AI 参考答案 | 每轮问题刚出来时后台异步生成提纲 + 完整示例 + 评分关键点 + 常见误区,默认隐藏,一键展开 |
| AI 实时观察 | 每轮答完 AI 给一句 ≤ 60 字的 support / alert / pivot 提醒 |
| 评估报告 | 通过可能性环 + 证据绑定的维度评价 + 下一场行动建议,可一键打印为 PDF |
| 综合分析 | 跨多场面试的 MetaReport,识别长期模式 |

## 安装

### Mac App Store

TBD: Mac App Store 上架后,从 App Store 直接安装。

> Eatit v3.4 是 Mac App Store 上架定位的 sandboxed 应用,首次打开遵循标准 App Store 流程,无需绕过任何系统安全校验。

## 快速上手

1. **配置 LLM Key** —— 设置 → 填入火山引擎 Ark API Key → 测试连接
2. **上传简历 + JD** —— 拖拽 PDF/文本文件 → 点「开始 AI 解析」
3. **配置面试** —— 选风格 / 方向 / 时长 → 点「开始面试」(等 30–60 秒生成框架)
4. **答题** —— 听 AI 面试官提问(语音/文字),按住说话或键入回答
5. **拿报告** —— 答完点「提前结束」或自然结束,AI 生成带证据绑定的评估报告

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Xcode + Swift + WKWebView(macOS 14 Sonoma+) |
| 前端 | React 18 + TypeScript 5 + Vite + XState + TanStack Query + Zustand |
| 后端 | 完全本地 — 无 Python / 无 server |
| 数据 | SQLite + WAL(via Swift GRDB,Bridge 到 JS)+ macOS Sandbox container |
| LLM 接入 | Bridge → Swift LLMGateway → 火山 Ark(BYOK) |
| Agent 编排 | LangGraph.js(turn_graph / intake_graph / post_report_graph) |
| 语音识别 | Bridge → Swift ASRGateway → 火山引擎 SAUC 流式 WebSocket |
| 语音合成 | Web Speech API(macOS 系统中文语音) |
| 打包 | xcodebuild + Apple Developer ID(M5.3 路径)+ App Store Connect |

## 架构

```
┌─────────────────────────────────────────────────────────┐
│   Eatit.app (Mac App Store, Sandboxed)                 │
│  ┌────────────────────────┐   ┌──────────────────────┐  │
│  │  React UI (WKWebView)  │ ──── bridge.call ────►   │  │
│  │  - InterviewPage XState│   │  Swift services     │  │
│  │  - core/agents/*       │   │  - KeychainService  │  │
│  │  - core/graphs/*       │   │  - LLMGateway       │  │
│  │  - core/sessions/      │   │  - ASRGateway       │  │
│  │    runInterviewSession │   │  - DatabaseService  │  │
│  └────────────────────────┘   │  - PDFParserService │  │
│                                └──────────┬───────────┘  │
│                                            │             │
│                                            ▼             │
│       ~/Library/Containers/com.eatit.desktop/           │
│       └─ Application Support/Eatit/                      │
│          ├─ eatit.db (SQLite + WAL via GRDB)             │
│          └─ cache/                                       │
│                                                          │
│  Outbound:                                               │
│   • https://ark.cn-beijing.volces.com (LLM, BYOK)       │
│   • wss://openspeech.bytedance.com (SAUC ASR, BYOK)     │
└─────────────────────────────────────────────────────────┘

API Key 存 macOS Keychain,Swift 端 inject 到 URLRequest header,
JS 永远不见 ARK_API_KEY。Bridge 双端 Codable + Zod 同 commit 改。
```

## 从源码构建

<details>
<summary>展开开发环境配置</summary>

### 前置依赖

- Node.js 20+ 与 `pnpm`(可用 `corepack enable`)
- Xcode 15+
- macOS 14+(Sonoma)

### 启动开发模式

```bash
# 安装依赖
pnpm install

# 纯 web 调试(Vite dev server)
cd apps/desktop && pnpm dev

# — OR — 构建并运行原生 app
cd apps/macos && xcodebuild build -scheme Eatit -destination "platform=macOS"
open apps/macos/build/Build/Products/Debug/Eatit.app
```

### 跑测试

```bash
# 前端单元测试
pnpm --dir apps/desktop test

# 类型检查
pnpm --dir apps/desktop exec tsc --noEmit

# Swift 测试
cd apps/macos && xcodebuild test -scheme Eatit -destination "platform=macOS"
```

### 打 Archive(App Store 发布)

```bash
# Archive
xcodebuild archive \
  -scheme Eatit \
  -archivePath apps/macos/build/Eatit.xcarchive

# 通过 Xcode Organizer 或 xcrun altool 上传至 App Store Connect
```

</details>

## 隐私与数据流

- LLM Key 存 macOS Keychain(Swift KeychainService 管理)
- 简历 / JD / 面试转写 / 报告全部本地 SQLite,**永不上传**
- LLM 调用直连火山引擎 Ark,API Key 仅在 Swift 层 inject 到请求 header
- 语音识别走火山引擎 SAUC 流式 WebSocket,仅传输音频帧,无 PII
- 无埋点、无 telemetry、无自动更新

## Roadmap

- [x] Phase 1–4 基础闭环(BYOK / 6 Agent / LangGraph / 语音面试)
- [x] Phase 5.1–5.3 打包 + 错误边界 + PDF 导出 + Apple Developer ID
- [x] Tauri → Xcode/WKWebView 迁移(v3.4)
- [ ] Mac App Store 上架
- [ ] 一键获取 API Key 跳转(参考 Cherry Studio)
- [ ] 报告深化:拉分/扣分项展开、下一场 drill 建议
- [ ] 面试记录搜索 / 筛选 / 「再来一场同岗位」CTA

## License

License TBD —— 当前仓库尚未添加 LICENSE 文件。在添加前请勿用于商业用途。

## 致谢

- [LangGraph.js](https://github.com/langchain-ai/langgraphjs) —— 多 Agent 编排
- [@xstate/react](https://stately.ai/docs/xstate) —— 面试状态机
- [Volcengine Ark](https://www.volcengine.com/product/ark) —— LLM 推理
- [Volcengine SAUC](https://www.volcengine.com/product/asr) —— 流式语音识别
- [GRDB](https://github.com/groue/GRDB.swift) —— Swift SQLite
