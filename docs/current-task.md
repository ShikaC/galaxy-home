# 当前任务

## 目标

按 `docs/windows-desktop-acceptance.md` 完整验收银河居所 Windows Tauri 桌面端，实际覆盖构建、开发态启动、生产打包、安装、核心业务操作、异常恢复、重启、退出与卸载。

## 当前状态

- 日期：2026-08-25。
- 状态：已完成。
- 最终结论：通过。
- 当前验收提交：`a4ee30f12b729c6ba07ecd485b04d2251e5b5325`。
- 当前缺陷计数：P0 0、P1 0、P2 0。
- 最终报告：`docs/codex-log/2026-08-25-windows-remaining-acceptance.md`。
- 本轮仅使用独立验收数据和本地假服务，未使用 API Key、Token 或真实私人数据。

## 已完成

- Windows 11 家庭版中文版 Build 26200、x64；Node.js 24.15.0、npm 11.12.1、Rust/Cargo stable 1.95.0、WebView2 151.0.4129.101 环境通过。
- `npm ci`、typecheck、lint、`npm test`、Web build、Rust test、严格 Clippy、完整 E2E 和 `desktop:build -- --no-sign` 全部通过。
- `npm run desktop` 已启动真实 Tauri 开发窗口，完成首次设置并进入首页；正常关闭后开发端口和应用进程清零。
- MSI 与 NSIS 安装链路均实测；最终 NSIS 包完成提升安装、生产启动、正常退出和卸载，安装目录、快捷方式、进程及端口均清理。
- Node 服务仅监听 `127.0.0.1`；4177 占用时回退 4178，4177-4199 全占用时显示明确错误；退出和强制结束后无孤儿 Node 或监听端口。
- `%APPDATA%\app.galaxyhome.desktop` 创建、写入、持久化、恢复点与卸载后保留行为通过；无写权限时显示原生可理解错误且不启动 Node。
- 待办、习惯、项目三条黄金路径，以及回顾、设置、搜索、回收站、侧栏和 AI 侧栏均通过真实操作与刷新/重启核对。
- 1280x800、960x640、125% 与 150% 高 DPI 通过；中文标题、说明、按钮和长文本未发现残留裁切、遮挡、方框或孤立单字。
- 应用内提醒、Windows 系统通知、通知拒绝后的应用内降级及权限恢复通过。
- 导出、有效恢复和错误包恢复保护通过；导出归档不含 `secrets.json`、API Key 或 Token。
- Node 不在 PATH、有效/无效 `GALAXY_NODE_PATH`、端口占用、数据目录异常、加载中关闭、强制退出、AI 超时和睡眠唤醒均通过。

## 修复提交

- `65d8083012b3966e1861e2ae5eed21519bcf4a3a`：修复 Windows 自动化验收门禁。
- `bbed87d`：修复 nanoid 开发依赖安全告警。
- `a4ee30f12b729c6ba07ecd485b04d2251e5b5325`：修复剩余 Windows 桌面验收阻塞。

## 最终产物

- MSI：`src-tauri/target/release/bundle/msi/银河居所_0.1.0_x64_zh-CN.msi`
  - SHA256：`7C65138CD54FE001B04ABDE83E12733383C13496BE3CE869C963F47E79EAC083`
- NSIS：`src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe`
  - SHA256：`15D558EA010355FC55E497F3C275E8DF8E657A9785E54FBB54327018DF7D3CCB`

## 工作区边界

- 用户已有的 `src-tauri/Cargo.toml`、`src-tauri/resources/app/README.md` 和 `.tmp/` 未纳入本轮提交。
- `.tmp/windows-desktop-acceptance*` 保留本轮脱敏验收证据；其中便携 Node 与基线副本因当前执行策略未递归清理，不影响产品或发布结论。
- 不在本轮范围：代码签名、SmartScreen、自动更新、内嵌 Node、关机后后台通知、PWA、手机专门适配和本地模型。

## 下一步

- Windows 本轮无发布阻塞项。
- 后续代码若继续扩大 `src-tauri/src/lib.rs`，应先拆分职责，避免超过 250 行纯代码警戒线。
