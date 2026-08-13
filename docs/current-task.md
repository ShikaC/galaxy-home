# 当前任务

## 目标

按 `docs/windows-desktop-acceptance.md` 完整验收银河居所 Windows Tauri 桌面端，实际覆盖构建、启动、安装、业务操作、重启、退出、卸载和异常恢复。

## 前序 Windows 验收状态

- 任务类型：只读验收，允许写入验收记录和脱敏证据，不修改产品源码。
- 已获取最新提交；本轮验收基线为 `8e61d6b9e6e883798adfe6008794b8ea2bcb60c6`。
- 结论：不通过。NSIS 可安装、启动、操作、重启和完成卸载，但完整 `desktop:build` 无法生成 MSI，强制退出会遗留 Node 服务，卸载后残留失效开始菜单快捷方式。
- 测试数据：使用全新独立测试数据；未配置 AI，不含 API Key、Token 或真实私人数据。

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
- 已完成生产 NSIS 壳的首次引导、待办/习惯/项目黄金路径、回顾、搜索、设置、回收站、生产导出、侧栏、AI 侧栏、正常退出、重启和 4177 占用回退到 4178。
- 已执行精确 PID 强制退出并保留现场：壳退出后 Node 仍监听 4177，随后仅清理本次验收遗留 PID；重启后业务数据仍在。
- 已运行本地 NSIS 安装器并在实际安装副本上执行卸载；卸载完成页 PASS，安装目录和进程端口清零，数据目录按未勾选删除数据的选择保留。

## 未完成与阻塞

- 完整 `npm run desktop:build` 仍在 WiX `light.exe` 阶段失败，因此 MSI 未生成、MSI 安装/卸载未测试；NSIS 专项包已实际验收。
- 当前 PATH 的 Node 为 22.17.0，生产包实际使用该 Node；Node 24 可执行文件存在，但未将 PATH 环境修复为合规状态。
- 原生最小窗口 960x640、150% 缩放、Windows 系统通知与拒绝权限降级、数据目录异常/无权限、有效 `GALAXY_NODE_PATH` 替代、4177-4199 全占用、睡眠唤醒和恢复导入未形成有效证据。
- 卸载后数据目录保留符合本次未勾选删除数据的选择，但开始菜单仍有指向已删除安装目标的失效快捷方式。

## 证据位置

- 本轮验收证据：`.tmp/windows-desktop-acceptance/`
- 重要更新日志：`docs/codex-log/`
- 踩坑记录：`docs/pitfalls/`

---

## 2026-08-13 对抗式审查与修复

### 当前状态

- 任务类型：共享服务、Windows/macOS 桌面壳和 Web 启动链的对抗式代码审查，并修复本轮确认的漏洞与 bug。
- 审查基线：`0d24435c9adafa39e1d7d01d92dec4a993604f11`（`更正 NSIS 验收记录表述`）。
- 已完成：跨源本地 API 防护、Node.js 版本门禁、桌面命令统一使用 Node 24、父进程异常退出后的 Node 服务清理、Windows 扩展路径归一化和启动失败可见错误页。
- 已验证：Node 24 下 typecheck/build、针对性 Vitest、Rust 桌面壳单元测试、真实 Node 服务父 stdin 关闭退出、Node 22 门禁、最终 NSIS 包安装/启动/退出/卸载。
- 已补充：Windows 无 `npm_execpath` 时仍由当前 Node 解析并执行 npm CLI；生产壳不再创建无人消费的 stderr 管道。
- 已修复：NSIS 卸载钩子无条件清理当前用户和所有用户范围的 `银河居所.lnk` 及空快捷方式目录，覆盖旧安装目标变化导致的失效快捷方式残留。
- 已验证：最新 NSIS 包在全新隔离目录完成安装；卸载入口实际执行后，安装目录、卸载器、桌面/开始菜单快捷方式、4177-4199 监听端口和卸载注册表均清零；本轮新增钩子同时清理非升级卸载的产品定位键并保留 app data。
- 未改变：用户已有的 `src-tauri/Cargo.toml`、`src-tauri/resources/app/README.md` 和 `.tmp/` 验收证据未纳入本轮提交。

### 当前阻塞与残余风险

- 完整 `desktop:build` 的 Rust release 和资源准备成功，但 WiX `light.exe` 仍无法链接 MSI；NSIS 专项打包成功。
- 全量测试 42 个文件、125 个测试中 123 个通过；剩余两个是既有 Windows 文件权限和临时目录 EPERM 失败，本轮未改动其测试语义。
- 全量 lint 仍受仓库既有 CRLF/格式基线和 Windows glob/io 问题影响；本轮新增实现已通过 typecheck、脚本语法和目标 lint 检查。
- Origin 检查只解决浏览器跨源状态修改，不构成对本机其他进程的认证；服务仍按项目设计仅监听 loopback。
- 已修复历史运行时问题：Tauri Windows 资源路径前缀在传给 Node 前会归一化；Node 启动失败时主窗口显示可读错误，不再静默留下无响应壳进程。

### 证据与记录

- 详细审查记录：`docs/codex-log/2026-08-13-adversarial-review.md`
- 踩坑记录：`docs/pitfalls/2026-08-13-adversarial-review.md`
- 既有 Windows 验收现场：`.tmp/windows-desktop-acceptance/`

---

## 2026-08-13 Windows 环境阻塞收口

### 当前状态

- 已修复 WiX 中文 MSI 链接阻塞：配置 `zh-CN` 本地化，生产依赖准备阶段移除不会被运行时使用的测试/示例目录，避免 WiX 936 编码无法处理依赖测试夹具文件名。
- 已修复 Windows 环境变量大小写问题：Node 24 启动子命令时保留 `Path`，不再丢失 `.cargo\\bin`，因此 `cargo metadata` 和完整 Tauri 打包可以找到 Rust 工具链。
- 显式 Node 24.14.0、Rust stable 1.95.0 环境下，`npm run desktop:build -- --no-sign` 退出码 0，同时生成 MSI 和 NSIS；MSI SHA256 为 `9818555490A18DC663220EBB15157E967B9D82DEBF7EC32DADBEA58DB54507E4`。
- release Tauri 壳已实际启动首次设置页，Node 24 子进程监听 `127.0.0.1:4177`；正常关闭和精确 PID 强制退出后 5 秒内壳、对应 Node 和 4177-4199 监听均清零。

### 当前阻塞与残余风险

- MSI 安装实测未通过：MSI 为 `perMachine`，当前 Windows 会话管理员组令牌是 Medium，安装日志返回错误 1925/1603 并回滚；UAC 提升调用被当前自动化会话拒绝。因此 MSI 安装后的启动、操作和卸载仍未测试，不能写“Windows 完整验收通过”。
- 默认 PATH 的 `node` 仍是 22.17.0；Node 22 门禁正确拒绝桌面命令。合规构建和 release 实测使用显式 Node 24.14.0。Node 24.14.0 还会触发 jsdom 要求 `^24.15.0` 的 EBADENGINE 警告，未阻断本次构建。
- `npm test` 仍为既有 Windows 失败：43 个文件中 16 个通过、2 个测试失败，分别是 secret 文件权限断言和 transcription 临时 SQLite 清理 EBUSY；另有 25 个集成套件因 Vitest/Vite 将 `node:sqlite` 解析到 client 环境而未收集测试。
- `npm run lint` 仍受仓库既有 CRLF/格式基线影响；本轮新增资源裁剪与运行时修复的目标单测 2 个文件、7 个测试通过。
