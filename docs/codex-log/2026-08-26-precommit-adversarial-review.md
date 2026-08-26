# 2026-08-26 提交前对抗式审查

## 目标

审查当前工作区的 Windows Tauri 桌面端、本地 API 和 AI 上游错误边界，修复真实漏洞和会导致用户看到 403/session-blocked 的回归。

## 首轮发现与修复

- `src-tauri/src/lib.rs` 缺少 `tauri::Manager`，Rust 桌面壳无法编译；已补导入。
- Node stdout 的 Fastify 日志先于 `GALAXY_HOME_READY`，Rust 只读首行会误杀正常服务；READY 读取改为扫描协议行，并带目标端口和随机 capability。
- stdout 提前结束时，Rust 现在重新检查子进程退出码，保留 4177-4199 的 `EADDRINUSE` 回退。
- loopback + Origin 不能认证同机进程；生产桌面服务现在通过 Node 随机 capability、Rust URL fragment、前端 bootstrap 和 HttpOnly cookie 建立会话，Origin 仍作为 CSRF 第二层。
- AI 上游 403 现在有专门回归测试，沿用已有 `AI_AUTH` 稳定错误映射，不泄露供应商策略文本。
- `src-tauri/src/server.rs` 超过 250 行；测试移至 `src-tauri/src/server_tests.rs`，生产文件回到 250 行以内。
- 自定义 `VITE_PORT` 只传给了前端脚本，Tauri 仍固定 5180；`run-tauri.mjs` 现在对 `dev` 注入动态 `build.devUrl`，并有 5190 单测。
- Tauri Node 子进程会继承 `NODE_OPTIONS`/`NODE_PATH` 等环境投毒变量；现在在 `node_environment.rs` 清掉全部 `NODE_*`/`NPM_*` 后再设置产品变量，避免 inspector 暴露和预加载注入。

## 验证证据

- `npm run typecheck`：通过。
- `npm run lint`：通过，215 个文件无诊断。
- `npm test`：46 个文件通过，136 项通过，1 项按 Windows 设计跳过。
- `npm run build`：通过，Vite production bundle 生成。
- `cargo test --manifest-path src-tauri/Cargo.toml`：13 项通过。
- 安全修复后最终 `cargo test --manifest-path src-tauri/Cargo.toml`：13 项通过；严格 Clippy 通过。
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`：通过。
- `rustfmt --check`：本轮 `server.rs` 和 `server_tests.rs` 通过；完整 crate 仍有既有 `build.rs`/`main.rs` 格式漂移，未改无关文件。
- Native Node parent Manual QA：READY token 长度 43；health 200；缺 capability 401；bootstrap 204 + cookie；合法 cookie 无 Origin 写入 204；攻击 Origin 403。
- Chromium Manual QA：真实 production 页面加载，HttpOnly capability cookie 存在，页面标题为“银河居所”，无 capability 错误和 API 4xx/5xx。
- QA 代理复验：默认桌面开发、Origin、端口冲突、父进程 EOF/强退、恢复包、Playwright 30/30、MSI/NSIS 均通过；自定义端口缺陷已由 helper 单测修复。
- 隔离 worktree bundle：Node 24.15/npm 11.12，`npm ci` audit 0，`npm run desktop:build -- --no-sign` 通过，MSI/NSIS 均生成；构建 worktree 已清理。可归属日志：`.tmp/manual-qa-final-20260826/desktop-build-final.log`；输入源码指纹：`.tmp/manual-qa-final-20260826/desktop-build-source-manifest.txt`。
- 隔离 bundle：MSI SHA256 `59AE93C4BE4FEF4A5D80A14BBC7C1231A3822B35527F816EF19737F454CA5E25`；NSIS SHA256 `F85CEE858D2EE8E06EED16AB74FB8807538413C0674673C8D4157D6F3D9D1509`。
- 主工作区最终 Node24 bundle 门禁退出码 `0`：日志 `.tmp/manual-qa-final-20260826/desktop-build-final-main.log`，退出码 `.tmp/manual-qa-final-20260826/desktop-build-final-main.exit`；保留产物 MSI `src-tauri/target/release/bundle/msi/银河居所_0.1.0_x64_zh-CN.msi` SHA256 `B1DCD3E30A9318D7473B94CF024D8C7CFE13FA5E718A157A92839FE3A1B08454`，NSIS `src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe` SHA256 `D420A46B5AE766A333CE8CB47C07ACADFBCC48C316EF5370804B3770FD293BDD`。
- 最终 Node24 gate 日志：`.tmp/manual-qa-final-20260826/final-test-node24.log`、`final-lint-node24.log`、`final-typecheck-node24.log`、`final-build-node24.log` 及同名 `.exit` 文件；Playwright：`playwright-final-rerun.log` / `.exit`。
- 清理并发 Cargo/EBUSY 残留后，Node 24 `npm run test:e2e` 重跑 30/30（compact 15 + wide 15）通过；此前 13/30 connection refused 不再复现。
- `tests/integration/apiSecurity.test.ts` 额外锁定“有效 HttpOnly cookie + 恶意 Origin”返回 403 且 `guide_dismissed` 保持 0；该受影响测试通过。

## 未完成门禁

- 本轮最终复审无阻断，已提交当前 `HEAD`（加固桌面启动与本地会话边界）。
- `docs/windows-desktop-acceptance.md` 已补充最终 Windows 结论、产物哈希、证据索引和 macOS 后续开发交接要求。
- 完整 crate 的 rustfmt 仍有既有 `build.rs`/`main.rs` 漂移，未改无关文件。
