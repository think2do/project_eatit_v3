# Screenshot Shoot Guide (M6.2 deferred PNGs)

> 截图分辨率:1280×800(Retina 机器实际抓 2560×1600,提交前用 sips 缩至 1280×800)
> 系统:macOS 14 Sonoma,Light Mode
> 状态栏 / Dock 隐藏:
>   defaults write com.apple.dock autohide -bool true && killall Dock
>   defaults write com.apple.controlcenter "NSStatusItem Visible Clock" -bool false
> Demo data 用下文每节点的 fake-but-realistic 数据,严禁真实 PII 或真实 API Key 入镜。

---

## 01-onboarding.png

- **路由**: `/onboarding`(应用首次启动,未配置 Key 状态)
- **demo data**: 无(空白 Onboarding card,不预填任何字段)
- **重点元素**:
  - Eatit logo 居中显示
  - "开始配置 LLM Key" 主 CTA 按钮高亮
  - 底部隐私承诺 footer("数据存于本地,BYOK 直连,Eatit 不上传")
  - 右侧或 hero 区域显示三点价值主张(本地 / BYOK / 无订阅)
- **避免**:
  - 不要让 API Key 输入框处于焦点状态(防止看起来像广告推销)
  - 不要展示任何错误弹窗或 alert

---

## 02-upload-parse.png

- **路由**: `/upload`,已完成简历 + JD 上传并展示解析结果
- **demo data**:
  - 简历文件名:`Lin_Yu_PM_Resume.pdf`(中文档,内容虚构)
    姓名:林宇 / 职位:高级产品经理 / 公司:北京某科技有限公司
  - JD 标题:`AI Product Lead @ FinTech Platform`
  - 解析结果面板(ParsedPanel)展示:
    - ResearchPayload:3 条联网情报卡片(FinTech AI 行业动态)
    - PredictedQuestions:6 个题目 chip(含"请介绍你主导的 AI 产品从 0 到 1 经历")
- **重点元素**:
  - 左侧 DropZone 显示已上传状态(绿色勾 + 文件名)
  - 右侧 ParsedPanel 完整展开,chips 清晰可读
  - 顶部进度条或 step indicator 显示当前在 Step 2
- **避免**:
  - 不要露出 BYOK 配置弹窗
  - 不要露出真实 PII(身份证号、手机号等)
  - 不要让 loading spinner 处于转动状态

---

## 03-live-caption.png

- **路由**: `/session/live`,面试进行中状态(已完成 2-3 轮对话)
- **demo data**:
  - 面试官人格:「压力型」(Stressor)
  - 当前问题:"你提到用 A/B Test 验证功能,请描述具体方法论和结果数据。"
  - 字幕区域:展示用户最近一段回答的逐字字幕(约 40-60 字)
    示例文字:"我们在 2024 年 Q3 对推荐算法进行了 A/B Test,实验组用户 7 日留存提升了 12%……"
  - 右侧 Chat/Timeline:显示已完成的 2 个问答对
- **重点元素**:
  - 字幕区域字体清晰、字幕高亮最新词
  - 面试官头像/人格标签可见
  - 录音按钮显示"录音中"状态(红点 + 波形)
  - 右侧对话列表至少有 2 条历史记录
- **避免**:
  - 不要展示空字幕区域
  - 不要让录音按钮处于"未开始"状态

---

## 04-report.png

- **路由**: `/report/<session-id>`,已生成完整报告
- **demo data**:
  - 会话标题:`AI Product Lead @ FinTech — 压力型面试`
  - 通过可能性:72%
  - 五维雷达图数值:
    - 结构性:78 / 表达清晰:82 / 技术深度:65 / 情境还原:70 / 自我认知:75
  - 单题点评展示第 1 题(展开状态):
    - 题目:"请描述你主导的 AI 产品从 0 到 1 的经历"
    - 亮点:"清晰描述了 PMF 验证路径"
    - 改进方向:"量化指标偏少,建议补充 DAU 或 GMV 数据"
    - 证据绑定:引用原文 "我们在 Q3 验证了核心假设……"
- **重点元素**:
  - 五维雷达图完整显示、颜色鲜明
  - 通过可能性数字大且突出
  - 至少一条单题点评展开可见
  - 右侧或底部显示"保存报告 / 导出 PDF" CTA
- **避免**:
  - 不要让报告处于 loading 状态
  - 不要显示负面措辞(如"完全不及格"等)

---

## 05-dashboard.png

- **路由**: `/history`(历史记录 / 成长追踪 Dashboard)
- **demo data**:
  - 历史场次列表:4 条记录(日期跨度约 3 周)
    - 2026-04-14:AI Product Lead @ FinTech,通过可能性 58%
    - 2026-04-18:Senior PM @ E-commerce,通过可能性 65%
    - 2026-04-25:AI Product Lead @ FinTech(复盘),通过可能性 70%
    - 2026-05-02:AI Product Lead @ FinTech(终轮),通过可能性 72%
  - 成长折线图:4 个数据点,趋势向上
  - AI Coach 建议卡片(1 条展示):
    "你在「技术深度」维度持续偏低,建议在下次练习中主动引用具体数据和方法论。"
- **重点元素**:
  - 成长折线图清晰可见,趋势向上
  - 历史列表至少 3 条记录
  - AI Coach 建议卡片高亮显示
  - 顶部显示"4 场面试 / 平均通过可能性 66%"汇总数据
- **避免**:
  - 不要让列表为空
  - 不要显示只有 1 条记录(无法体现"跨场次成长")

---

## 拍摄流程

1. 构建 app(Debug 或 Release 均可):
   ```bash
   xcodebuild -project apps/macos/Eatit.xcodeproj \
     -scheme Eatit -configuration Release \
     -derivedDataPath apps/macos/build build
   ```

2. 启动 app:
   ```bash
   open apps/macos/build/Build/Products/Release/Eatit.app
   ```

3. 按上方每节 demo data 要求准备数据状态(建议预先用 seed 脚本或手动操作)

4. 隐藏 Dock 和状态栏后,导航到目标路由

5. 截图(Retina 机器):
   ```
   Cmd+Shift+5 → 选择区域截图 → 保存到 ~/Desktop
   ```
   或使用命令行:
   ```bash
   screencapture -R "0,0,2560,1600" ~/Desktop/eatit-raw.png
   ```

6. 裁剪到精确尺寸:
   ```bash
   # Retina: 先抓 2560×1600,再缩至 1280×800
   sips -z 800 1280 ~/Desktop/eatit-raw.png --out ~/Desktop/eatit-1280x800.png
   ```

7. 移入项目目录:
   ```bash
   cp ~/Desktop/eatit-1280x800.png \
     apps/macos/AppStore/screenshots/01-onboarding.png
   ```

8. 重复步骤 3-7,完成全部 5 张截图

---

## 集成节点

- 本拍摄指南在 **M6.2** 随文案一同 commit(product-manager 职责范围)
- 实际 PNG 拍摄在 **Helper-developer 子 loop** 或 **M6.5 archive 阶段**执行
- 前置条件:已签名可运行的 app build(M5.3 baseline 已满足)
- 拍摄完成后,5 张 PNG drop 进本目录,走独立 commit:`chore(v34): add app store screenshots (captured)`
