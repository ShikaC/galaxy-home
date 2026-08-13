# 对抗式代码审查与修复记录

## 基线与范围

- 日期：2026-08-13，Asia/Shanghai
- 审查基线：`0d24435c9adafa39e1d7d01d92dec4a993604f11`
- 范围：共享 Fastify API、Node 服务生命周期、Tauri Rust 壳、Windows/macOS/Web 启动脚本。
- 数据：仅使用测试临时目录和既有隔离验收数据；未读取或写入真实个人数据、API Key、Token。
- 用户已有工作区改动：`src-tauri/Cargo.toml`、`src-tauri/resources/app/README.md`、`.tmp/` 未纳入本轮提交。

## 确认问题与修复

### P1：本地 API 缺少浏览器跨源请求边界

- 复现：在任意外部 Origin 页面向 loopback API 发起状态修改请求；修改前服务没有校验 `Origin`，因此浏览器请求可以直接触发本地数据变更。
- 修复：`src/server/app.ts` 在请求入口拒绝非本机页面 Origin；开发端口读取 `VITE_PORT`，生产端口读取 `PORT`，允许 `127.0.0.1`、`localhost` 和 IPv6 loopback 的同端口页面。
- 验证：外部 Origin 返回 `403 ORIGIN_NOT_ALLOWED` 且状态保持不变；本机 Origin 返回预期 `204` 并完成状态变更。

### P1：桌面壳只检查 Node 文件存在，不检查版本

- 复现：PATH 中优先存在 Node 22 时，旧 Rust 查找逻辑会直接选择它；Node 22 不满足项目 `engines >=24`，生产服务可能在 `node:sqlite` 等运行时能力处失败。
- 修复：`src-tauri/src/node_runtime.rs` 对候选 Node 执行 `--version` 并要求主版本至少 24；`scripts/node-runtime.mjs` 为桌面开发、准备资源和 Tauri CLI 提供同一版本门禁及 PATH 注入。
- 验证：Node 22 执行 `scripts/run-tauri.mjs --version` 在启动 Tauri 前以明确错误退出；Node 24 执行同命令返回 Tauri CLI 版本。

### P1：父进程被强制结束时生产 Node 服务无法感知退出

- 复现：旧 Tauri 壳给 Node 子进程使用 null stdin，清理只依赖 Tauri `RunEvent::Exit`；强制结束壳进程会绕过清理，Node 继续占用 loopback 端口。
- 修复：Rust 壳为 Node 保留 piped stdin，并设置 `GALAXY_PARENT_LIFETIME=1`；Node 服务监听 stdin `end`，调用 Fastify close 和数据库关闭。
- 验证：真实启动 `dist/server/index.js` 后，健康检查返回 200；关闭父端 stdin 后子进程以退出码 0 结束，端口释放，临时数据目录可清理。

### P1：桌面生产服务的 stderr 管道无人消费

- 复现条件：Tauri 壳将 Node stderr 设置为 piped，但没有读取句柄；Fastify 生产日志持续写满管道后，Node 可能在写日志时阻塞。
- 修复：生产壳将该 stderr 重定向到 null，避免无人消费的有限管道成为服务阻塞点。
- 验证：Rust 单元测试、生产构建和真实 Node 生命周期测试通过；该路径不再创建无人消费的 stderr pipe。

### P1：Windows 生产包把 `\\?\\` 扩展路径直接传给 Node

- 复现：Windows Tauri `resource_dir()` 返回带 `\\?\\` 前缀的路径；旧壳直接把 `dist/server/index.js` 作为 Node 主入口传入，Node 24 以 `EISDIR` 和退出码 1 结束，隐藏主窗口因此留下无响应壳。
- 修复：`src-tauri/src/lib.rs` 在资源根、Tauri app data 目录和 Node 可执行文件进入 `Command` 前移除本地盘符扩展前缀，并把 UNC 扩展路径转换为普通 UNC 路径；增加启动失败 `data:` 错误页和子进程提前退出检测。
- 验证：路径归一化 Rust 测试通过；最终 NSIS 包安装后用有效 `GALAXY_NODE_PATH` 启动，主窗口显示首次设置页，Node 24 子进程监听 4177；Alt+F4 后壳、Node 和端口均清零。默认 PATH 的 Node 22 场景显示可读“服务启动后立即退出”错误页。

### P2：NSIS 卸载后可能残留失效快捷方式

- 复现：旧卸载逻辑先用 `IsShortcutTarget` 比较快捷方式目标；安装目录变化或旧版本目标不再匹配时，开始菜单/桌面上的 `银河居所.lnk` 不会被删除，最终留下指向已删除 exe 的快捷方式。
- 修复：新增 `src-tauri/nsis-hooks.nsh`，在卸载后分别以当前用户和所有用户上下文无条件删除产品名快捷方式及空目录；非升级卸载同时删除产品安装定位键但保留 app data，并在 `src-tauri/tauri.conf.json` 注册 `installerHooks`。
- 验证：NSIS 专项构建成功；最新包在隔离目录实际安装后执行卸载，安装目录、卸载器、桌面/开始菜单快捷方式、4177-4199 监听端口、卸载注册表和产品定位键均清零。

### P1：Windows 生产包路径问题导致启动失败（已修复）

- 现象：旧包用 `galaxy-home-desktop.exe` 启动后进程存在但无响应、没有可操作窗口且没有 4177-4199 监听端口。
- 根因：Windows 资源路径扩展前缀直接传给 Node，Node 以 `EISDIR` 退出；错误没有进入可见错误页。
- 状态：已由路径归一化、子进程提前退出检测和 `data:` 启动错误页修复；最终包已实际打开首次设置页并正常退出。

## 启动链与构建改动

- `scripts/run-tauri.mjs` 不再经由 `npx` 选择 CLI，而是使用当前 Node 直接执行项目内 Tauri CLI。
- `scripts/desktop-dev.mjs` 和 `scripts/prepare-desktop-resources.mjs` 在 npm 提供 CLI 路径时使用当前 Node 执行 npm CLI，避免 Windows npm 启动器回到 Node 22。
- `scripts/node-runtime.mjs` 在没有 npm 环境变量时从系统 npm 位置解析 `npm-cli.js`，仍由当前 Node 执行。
- `src-tauri/tauri.conf.json` 的 `beforeBuildCommand` 改为 `node scripts/desktop-build.mjs`，确保前端 build 和资源依赖安装沿用版本门禁。
- `scripts/node-runtime.d.mts` 仅为测试提供 `.mjs` 辅助模块的严格类型声明。

## 验证结果

- 针对性 Vitest：3 个文件、9 个测试通过。
- Rust：`cargo test --manifest-path src-tauri/Cargo.toml --lib --no-fail-fast`，8 个测试通过。
- TypeScript：`typecheck` 通过。
- Web build：`build` 通过。
- 脚本：新增和被修改的 `.mjs` 通过 `node --check`。
- 全量 Vitest：42 个文件、125 个测试，123 通过、2 个既有 Windows 失败：secret 文件权限断言、transcription 临时目录清理 EPERM。
- 全量 lint：仍受仓库既有 CRLF/格式基线和 Windows glob/io 问题影响；本轮新增逻辑没有引入 TypeScript 或运行时错误。
- 完整桌面打包：前端、资源准备、Rust release 成功；WiX `light.exe` MSI 链接失败。
- NSIS 专项打包：成功生成 `src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe`；最终 SHA256 为 `19FEC50CA7FA74F321FCA98AB2D7F45A00D6D080419A386BADB20D80008FC5A2`。
- 最终 NSIS 实测：隔离目录安装成功；有效 Node 24 路径下主窗口和 4177 监听成功；正常退出后对应进程/端口清零；卸载后快捷方式、应用文件、目标进程、卸载注册表和产品定位键清零；未勾选删除应用数据时 app data 保留。

## 结论

本轮确认的 5 个 P1 问题和 1 个 P2 问题均已修复并有针对性验证。代码修复本身不存在已确认的 P0。Windows 完整 MSI 仍受外部 WiX 环境阻塞，不能据此宣称完整桌面打包通过。
