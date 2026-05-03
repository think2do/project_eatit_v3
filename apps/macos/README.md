本目录是 v3.4 macOS App Store 工程。

**当前状态**: pre-staged — 源文件已落盘,但 `.xcodeproj` 尚未创建。设计文档见 `.ralph/docs/v34-design/M1.1-xcode-project-structure.md`。

**工程化步骤**(由人在 Xcode 26 GUI 中操作):

1. `File → New → Project → macOS App`,保存到 `apps/macos/`,工程名填 `Eatit`
2. `File → Add Files to "Eatit"`,把 `Eatit/` 目录(含子目录)拖入 target
3. `File → Add Files to "Eatit"`,把 `EatitTests/` 目录拖入 test target
4. 在 Build Phases → Copy Bundle Resources 添加 folder reference:`$(SRCROOT)/Eatit/Resources/web`

详细 checklist 见 design doc §9。
