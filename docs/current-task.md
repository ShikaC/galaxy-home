# 当前任务

## 目标

按 `docs/windows-desktop-acceptance.md` 完整验收银河居所 Windows Tauri 桌面端，实际覆盖构建、启动、安装、业务操作、重启、退出、卸载和异常恢复。

## 当前状态

- 任务类型：只读验收，允许写入验收记录和脱敏证据，不修改产品源码。
- 基线提交：`b4a841c0b68a5f83a2ef9f97d60d6b157cbc4a3f`。
- 工作区：已确认干净并已执行 `git pull --ff-only`。
- 测试数据：使用全新独立数据目录；不操作真实个人数据。

## 范围边界

- 本轮不验收签名、SmartScreen、自动更新、内嵌 Node、关机后后台通知、PWA、手机专门适配和本地模型。
- 生产 Tauri 壳的数据路径以 Tauri app data 目录为准，不假设生产包可用 `GALAXY_DATA_DIR` 覆盖。
- 回传报告不得包含 API Key、Token、真实私人数据或完整敏感本机路径。

## 已完成

- 已阅读项目验收、README 和桌面打包决策文档。
- 已读取跨会话经验文档和 Windows 自动化、视觉验收、运行时证据规则。

## 下一步

1. 记录 Windows、Node、Rust、WebView2、架构、缩放和端口基线。
2. 执行 `npm ci`、typecheck、lint、test、build 和 `desktop:build`。
3. 实际启动开发态与生产安装包，完成业务、窗口、通知、导出恢复和异常场景。
4. 整理第 18 节报告、证据索引和 P0/P1/P2 结论。

## 证据位置

- 本轮验收证据：`.tmp/windows-desktop-acceptance/`
- 重要更新日志：`docs/codex-log/`
- 踩坑记录：`docs/pitfalls/`
