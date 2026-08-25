# 当前任务

## 目标

完成当前工作区的提交前对抗式审查；修复发现的代码漏洞和 Windows/Tauri 启动回归，重点避免历史 403/session-blocked 类用户可见失败。

## 当前状态

- 日期：2026-08-26。
- 状态：已完成并提交。
- 本轮提交：当前 `HEAD`（加固桌面启动与本地会话边界）。
- 当前基线：`HEAD` 加工作区已有的桌面启动、API 边界、恢复包和测试改动；未覆盖用户无内容差异的 assume-unchanged 文件。
- 首轮阻断：缺少 `tauri::Manager` 导入；READY stdout 首行误判及端口冲突竞态；Origin 不是同机认证；外部 AI 403 缺少回归覆盖；Rust 服务模块超过 250 行；自定义桌面 Web 端口未同步 Tauri `devUrl`。
- 当前结论：上述代码问题已修复；自动化门禁、真实 production/browser Manual QA、Node 环境投毒审查和主工作区 MSI/NSIS bundle 门禁均已通过。
- 详细记录：`docs/codex-log/2026-08-26-precommit-adversarial-review.md`。
- 本轮未使用真实 API Key、Token 或私人数据；Manual QA 的 capability token 已脱敏且仅在临时进程中使用。

## 本轮已完成

- READY 协议现在跳过普通 stdout 日志，只接受目标端口和随机 capability；父进程能继续识别 `EADDRINUSE` 回退。
- Tauri 生产启动通过随机 capability + URL fragment + HttpOnly cookie 建立本地 API 会话，Origin 作为第二层 CSRF 防护；合法会话无 Origin 不再误报 403。
- 上游 AI 401/403 均稳定映射为 `AI_AUTH`；不把供应商 cyber-policy 原文返回给应用。
- `src-tauri/src/server.rs` 测试移到 `server_tests.rs`，生产文件保持在 250 行纯代码以内。
- 自定义 `VITE_PORT` 现在同步覆盖 Tauri CLI 的 `build.devUrl`，并有 5190 端口单测。
- TypeScript typecheck/lint/build、npm test、Rust test/strict Clippy、真实 Node parent API QA 和 Chromium QA 均已通过。

## 待完成

- 本轮无剩余发布阻断；`.tmp/` 中保留脱敏验收证据和最终 bundle/e2e 日志。

## 历史验收基线

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
  - SHA256：`B1DCD3E30A9318D7473B94CF024D8C7CFE13FA5E718A157A92839FE3A1B08454`
- NSIS：`src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe`
  - SHA256：`D420A46B5AE766A333CE8CB47C07ACADFBCC48C316EF5370804B3770FD293BDD`

## 工作区边界

- 用户已有的 `src-tauri/Cargo.toml`、`src-tauri/resources/app/README.md` 和 `.tmp/` 未纳入本轮提交。
- `.tmp/windows-desktop-acceptance*` 保留本轮脱敏验收证据；其中便携 Node 与基线副本因当前执行策略未递归清理，不影响产品或发布结论。
- 不在本轮范围：代码签名、SmartScreen、自动更新、内嵌 Node、关机后后台通知、PWA、手机专门适配和本地模型。

## 后续注意

- 8 月 25 日完整 Windows 安装/卸载验收仍是历史基线，详见上方记录链接；本轮新增 capability、READY 和自定义端口改动必须以当前复审证据为准。
- 若继续扩大 Tauri 服务模块，保持单文件不超过 250 行纯代码，并优先拆分职责。
