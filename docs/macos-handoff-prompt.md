# 银河居所 macOS 后续开发交接提示词

你将接手项目 `E:/Projects/galaxy-home` 的 macOS 后续开发。请先恢复上下文，再开始任何代码修改。

## 先读这些文件

1. `docs/current-task.md`
2. `docs/windows-desktop-acceptance.md`
3. `docs/codex-log/2026-08-26-precommit-adversarial-review.md`
4. `docs/pitfalls/2026-08-26-precommit-adversarial-review.md`
5. `docs/decisions/desktop-packaging.md`
6. 最近提交：`git log -10 --oneline --decorate`
7. 当前状态：`git status --short --branch`

远程仓库：`https://github.com/ShikaC/galaxy-home.git`

## 已确认基线

- GitHub `origin/main` 与本地已同步到合并提交 `0d72c46`。
- `b891fbb` 补充了 Windows 验收文档；`b030ba6` 是 Windows 启动/API 安全修复基线。
- Windows 11 x64 验收通过：Node 24.15.0、npm 11.12.1、Rust/Cargo stable 1.95.0、WebView2 151.0.4129.101。
- Node/TypeScript：typecheck、Biome lint、Web build 通过；npm test 为 46 个文件、136 项通过、1 项 Windows 不适用测试跳过。
- Rust：13 项测试通过，严格 Clippy 通过。
- 完整 Playwright：compact/wide 30/30 通过。
- MSI：`src-tauri/target/release/bundle/msi/银河居所_0.1.0_x64_zh-CN.msi`，SHA256 `B1DCD3E30A9318D7473B94CF024D8C7CFE13FA5E718A157A92839FE3A1B08454`。
- NSIS：`src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe`，SHA256 `D420A46B5AE766A333CE8CB47C07ACADFBCC48C316EF5370804B3770FD293BDD`。

## 已完成的重要修复

- Tauri/Node READY 协议会跳过普通 stdout 日志，并正确处理端口冲突与 `EADDRINUSE` 回退。
- 生产桌面 API 使用随机 capability、URL fragment bootstrap、HttpOnly/SameSite=Strict cookie 和 Origin 防护。
- 合法会话的无 Origin 状态变更不会误报 403；攻击 Origin 仍返回 403 且不修改数据。
- AI 上游 401/403 统一映射为稳定的 `AI_AUTH` 错误，不泄露供应商策略文本。
- Tauri Node 子进程清理继承的 `NODE_*`/`NPM_*` 环境变量，阻断 `NODE_OPTIONS` inspector 注入。
- 自定义 `VITE_PORT` 会同步覆盖 Tauri devUrl。

## 你的任务

先建立 macOS 实际基线，不要假设 Windows 证据自动适用于 macOS：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
node --version
npm --version
rustc --version
cargo --version
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run desktop
```

然后重点验证：

- macOS Application Support 数据目录、数据库持久化、备份和升级/卸载数据保留；
- macOS Node 24 定位、`GALAXY_NODE_PATH`、PATH 和扩展路径；
- `127.0.0.1` 监听、端口冲突、READY、stdin EOF、强制退出和重启清理；
- Retina/DPR 下中文长文本、最小窗口、弹窗、AI 侧栏和键盘焦点；
- macOS 通知权限允许/拒绝后的应用内降级；
- capability fragment、HttpOnly cookie、Origin/403 行为；
- 导出密钥隔离和错误恢复包数据不变性；
- Intel/Apple Silicon、代码签名、公证、DMG 和首次打开安全提示。

## 工作规则

- 先判断是 macOS 专属问题还是跨平台回归，不要为了修 macOS 盲改已验收的 Windows 路径。
- 修改 `.ts`/`.tsx`/`.rs` 前读取 `omo:programming` 对应参考；涉及真实运行时失败时使用 `omo:debugging`。
- UI 改动需要真实浏览器/桌面预览和截图；跨平台启动改动需要 Node/Rust 测试与实际进程检查。
- 保留 Windows 验收文档和历史证据；新的 macOS 证据单独记录版本、架构、commit、命令退出码、产物 hash、数据目录和未测试事项。
- 不要提交 `.tmp/`、本地密钥、API Key、Token、`node_modules`、`dist` 或 `target`。
- 提交前运行针对性测试，更新 `docs/current-task.md`、`docs/codex-log/` 和相关 `docs/pitfalls/`，使用中文 commit message。
- 只有用户明确要求时才 push；本次后续开发如需 push，请先确认远程状态和待上传范围。

## 建议技能

- `omo:programming`
- `omo:git-master`
- `omo:debugging`（运行时、进程、端口、异步或跨平台失败）
- `omo:visual-qa`（桌面/浏览器视觉和响应式验收）
- `omo:review-work`（完成实现后的提交前复审）

## 完成标准

完成后给出：确认事实、推断、未验证事项、改动文件、测试命令与结果、macOS 产物路径/hash、剩余风险、commit 和远程状态。不要把“Windows 已通过”写成“macOS 已通过”。
