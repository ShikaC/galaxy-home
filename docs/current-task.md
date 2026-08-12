# 当前任务

## 目标

按 `docs/windows-desktop-acceptance.md` 完整验收银河居所 Windows Tauri 桌面端，实际覆盖构建、启动、安装、业务操作、重启、退出、卸载和异常恢复。

## 当前状态

- 任务类型：只读验收，允许写入验收记录和脱敏证据，不修改产品源码。
- 已执行 `git pull --ff-only`；验收记录提交为 `5f59bd8f0f24b95e899cd5df537e5eff047ac017`。
- 结论：环境阻塞。开发态浏览器路径已验证，原生 Tauri 输入被 Windows 安全弹窗拦截；安装、卸载和生产包实测未执行。
- 测试数据：使用全新独立数据目录；不操作真实个人数据。

## 范围边界

- 本轮不验收签名、SmartScreen、自动更新、内嵌 Node、关机后后台通知、PWA、手机专门适配和本地模型。
- 生产 Tauri 壳的数据路径以 Tauri app data 目录为准，不假设生产包可用 `GALAXY_DATA_DIR` 覆盖。
- 回传报告不得包含 API Key、Token、真实私人数据或完整敏感本机路径。

## 已完成

- 已阅读项目验收、README 和桌面打包决策文档，并获取最新提交。
- 已记录 Windows 11 Build 26200、x64、125% 显示缩放、Node/Rust/WebView2 版本。
- `npm ci`、typecheck、build、NSIS 专项打包通过；lint、npm test、完整 `desktop:build` 失败，详见验收日志。
- 浏览器开发态完成待办、习惯、项目、回顾、设置、搜索、侧栏、AI 侧栏、提醒和导出检查。
- 已保存截图、构建日志、开发日志、端口记录、隔离数据目录文件列表和 NSIS SHA256。

## 未完成与阻塞

- 原生 Tauri 首次设置被 Windows Node.js 防火墙安全弹窗遮挡；Computer Use 不代替用户操作安全提示。
- 未获得运行本地 NSIS 安装器和卸载程序的操作时确认，因此生产安装、冷启动、重启、退出清理、端口回退、默认 Tauri app data 和卸载保留策略均未测试。
- 原生最小窗口、高 DPI、原生通知权限拒绝/降级、睡眠唤醒和强制退出恢复未形成有效证据。

## 证据位置

- 本轮验收证据：`.tmp/windows-desktop-acceptance/`
- 重要更新日志：`docs/codex-log/`
- 踩坑记录：`docs/pitfalls/`
