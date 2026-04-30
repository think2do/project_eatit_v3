# docs/design-reference/

> **这是 UI 实现的"真理来源"(Implementation Truth)。**
> Codex / Claude Code 在实现任何 UI 时,必须先读这里,再写代码。

## 文件清单

| 文件 | 用途 |
|---|---|
| `styles.css` | 全部 design token(:root CSS 变量) + 共享组件样式(.btn / .card / .tag / .tile 等) |
| `shell.jsx` | Sidebar + Topbar 全局壳结构 |
| `icons.jsx` | 全部 SVG 图标定义 |
| `page-upload.jsx` | 上传与解析页(含 UploadCard / ParsedPanel / MatchDial) |
| `page-config.jsx` | 配置页(含 Section / SummaryRow) |
| `page-live.jsx` | 实时面试页(含 WaveBars / Metric) |
| `page-history.jsx` | 面试记录 Dashboard(含 StatCard) |
| `page-report.jsx` | 评估报告页(含 HeroScore / DimensionRow / QuestionReview) |

## 使用规则(对应 PRD 第十三章 + AGENTS.md 第 4 节)

✅ **必须做**:
- 复用 `styles.css` 的 `:root` CSS 变量(`var(--brand)`, `var(--ink-700)` 等)
- 复用 `styles.css` 的共享 className(`.btn`, `.card`, `.tag` 等)
- 参考 `page-*.jsx` 的 JSX 结构与布局比例

❌ **禁止做**:
- 用 Tailwind 默认色板覆盖 token(`bg-green-600` 等)
- 直接写十六进制色值(`#1F6B3A`)
- 自创新的 className(已存在的就直接复用)
- 引入其他设计系统(Material UI / Ant Design / Chakra 等)

## 这些文件 vs 实际 React 代码

`page-*.jsx` 是**原型代码**,不是最终生产代码。Codex 在 `src/pages/` 下实现实际页面时:

1. 必须保持 JSX 结构与原型一致(布局、嵌套、className 引用)
2. 可以替换成实际数据源(从 props / API / store 取数,而非 sample 常量)
3. 可以拆分子组件到 `src/components/`(只要复用了原型中的 className)
4. 不可以擅自换布局比例(grid / aside 宽度等)
5. 不可以擅自改色彩与字体

## 当 PRD 与原型代码冲突时

优先级:
1. **PRD 第十三章 design token** > 原型 styles.css
2. **PRD 第六章 UI 规范** > 原型 page-*.jsx 结构
3. **PRD 第七、八、九章数据契约** > 原型中的 sample data

如果发现 PRD 与原型严重冲突,先暂停,向用户提报,不要自行决断。
