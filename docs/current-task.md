# 当前任务

## 目标

按 `docs/windows-desktop-acceptance.md` 完整验收银河居所 Windows Tauri 桌面端，实际覆盖构建、启动、安装、业务操作、重启、退出、卸载和异常恢复。

## 当前状态

- 日期：2026-08-24。
- 验收工作树 HEAD：`a00ef905f25cd9eb63839f1d1ac56a2621d068d8`；安装产物对应功能修复提交 `a2fb314284d263e19b8e792d8172546aadeb00d4`。
- 最终结论：不通过。此前 MSI `perMachine` 权限环境阻塞已经解除，MSI 安装、启动、操作、重启、恢复、退出和卸载均已实测通过；但 `npm test` 与 lint 仍失败，不能满足第 17 节最终门槛。
- 测试数据仅包含本轮验收记录；AI 未配置，不含 API Key、Token 或真实私人数据。
- 本轮没有修改产品源码；用户已有的 `src-tauri/Cargo.toml`、`src-tauri/resources/app/README.md` 和 `.tmp/` 未纳入验收提交。

## 范围边界

- 不验收签名、SmartScreen、自动更新、内嵌 Node、关机后后台通知、PWA、手机专门适配和本地模型。
- 生产壳使用 Tauri app data 目录，不假设 `GALAXY_DATA_DIR` 可覆盖生产数据路径。
- 报告和证据不得包含密钥、令牌、真实私人数据或完整敏感本机路径。

## 已确认通过

- Windows 11 家庭版中文版 Build 26200、x64；Rust/Cargo stable 1.95.0；WebView2 151.0.4129.101。
- 显式 Node 24.14.0 下 `npm ci`、typecheck、Web build 和完整 `desktop:build -- --no-sign` 通过，MSI 与 NSIS 均已生成。
- MSI 经用户确认 UAC 后安装成功，Windows Installer 状态为 `0`；产品版本、默认安装目录、开始菜单和桌面快捷方式正确。
- 安装副本完成待办、习惯、项目三条黄金路径，并覆盖回顾、设置、搜索、回收站、侧栏和 AI 侧栏。
- 正常退出、连续冷启动、重启持久化和精确 PID 强制退出通过；应用 Node 仅监听 `127.0.0.1`，退出后 5 秒内进程和 4177-4199 端口清零。
- PATH 中无 Node 时，有效 `GALAXY_NODE_PATH` 可启动；无效路径显示可理解错误；4177 占用回退到 4178；4177-4199 全占用显示明确范围错误。
- 导出 ZIP 仅含 `galaxy-home.json`，未发现 secrets/API Key/Token；有效恢复会先创建恢复点，恢复后临时标记消失，原有验收数据完整。
- MSI 卸载成功，Windows Installer 状态为 `0`；安装目录、产品注册、快捷方式、应用进程和端口均清零；Roaming app data 与恢复点按实际行为保留。
- 既有证据覆盖 1280x800 默认窗口、960x640 最小窗口和 125% 缩放；未见严重中文裁切或遮挡。

## 失败项

- `npm test`：43 个文件、36 个测试中 34 个通过、2 个失败，另有 25 个套件未收集；具体为 Windows secret 权限断言、SQLite 清理 EBUSY，以及 `node:sqlite` 被 client Vite 解析。
- `npm run lint`：206 项既有 CRLF/格式诊断。

## 未测试与残余风险

- 150% 显示缩放。
- Windows 系统通知及通知权限拒绝后的应用内降级；应用内提醒已通过。
- 错误或版本不兼容恢复包不会覆盖数据库；有效包恢复已通过。
- Tauri app data 目录无写权限、加载过程中关闭窗口、Windows 睡眠/唤醒、AI 服务超时。

## 产物

- MSI：`src-tauri/target/release/bundle/msi/银河居所_0.1.0_x64_zh-CN.msi`，SHA256 `9818555490A18DC663220EBB15157E967B9D82DEBF7EC32DADBEA58DB54507E4`。
- NSIS：`src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe`，SHA256 `A7C3ED738CB891DAEA583B8A0CBAC77F2F4DE1D7FAB0F7BD8ADDE680BACB4FBC`。

## 证据与下一步

- 完整报告：`docs/codex-log/2026-08-24-windows-msi-acceptance.md`。
- 本轮证据：`.tmp/windows-desktop-acceptance/`。
- 下一步先修复全量测试与 lint，再补测 150% 缩放、系统通知拒绝、错误恢复包、数据目录无权限和睡眠唤醒；全部通过后才能将最终结论改为“通过”。
