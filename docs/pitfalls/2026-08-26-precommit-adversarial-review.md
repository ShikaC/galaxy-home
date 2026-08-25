# 2026-08-26 提交前对抗式审查踩坑

## Git Bash FIFO 不能模拟 Tauri 的 ChildStdin

### 踩坑

在 Git Bash 中用后台进程、FIFO、`tail -f` 或 `sleep` 保持 Node stdin 时，Node 仍收到 EOF，生产服务在 READY 后退出，导致 curl 误报“端口未监听”。

### 根因

Windows Git Bash 的 FIFO/管道语义与 Rust `Command::spawn` 创建并由 `ChildStdin` 持有的匿名管道不同；表面上 writer 进程仍在，Node 读端仍可能收到 EOF。

### 解决

用 Node 原生 `spawn` 创建子进程，明确传入 `stdio: ["pipe", "pipe", "pipe"]`，持有 `child.stdin`，再执行 health、bootstrap、cookie、Origin 和退出检查。这样与 Tauri 父进程生命周期一致。

### 下次避免

Windows 桌面子进程生命周期不要用 Git Bash FIFO 做最终证据；优先用原生 Node/PowerShell pipe，并记录父进程是否真的持有 stdin 句柄。

## READY 协议不能占用普通日志 stdout

### 踩坑

Fastify 默认 logger 把 `Server listening` 写入 stdout，父进程把首行当作 READY 时会将正常服务判为失败。

### 根因

机器协议和普通日志共享同一条未经解析的流，且父进程只读取第一行。

### 解决

READY 解析器逐行扫描并校验目标端口和随机 capability；子进程提前结束时按真实退出码分类。

### 下次避免

跨进程 stdout 协议必须定义明确帧格式、允许前置日志或使用独立 IPC；不要以“当前通常第一行是 READY”作为协议。

## LSP 服务不可用时的替代证据

### 踩坑

自动 LSP hook 报告 TypeScript server 未安装且 Rust daemon 超时，无法提供编辑后诊断。

### 根因

当前机器已记录过 TypeScript LSP 安装拒绝，Rust daemon 在本轮繁忙超时。

### 解决

使用 `tsc`、Biome、Cargo test、严格 Clippy、rustfmt、真实 Node parent 和 Chromium Manual QA 作为替代验证，并在记录中明确 LSP 缺口。

### 下次避免

启动审查时先检查 LSP 状态；若仍不可用，不把“无诊断”写成“诊断清洁”，改用编译器和实际运行证据。

## Desktop build 必须先切换到隔离 worktree

### 踩坑

第一次准备隔离 worktree 后忘记 `cd`，`desktop:build` 实际在主工作区运行，触发了 `prepare-desktop-resources` 的资源重建。

### 根因

构建命令的工作目录仍是主仓库；脚本会递归重建 `src-tauri/resources/app`，因此不能只创建 worktree 而不切换目录。

### 解决

核对资源文件 hash 与 HEAD 后确认本轮 README 内容未变化；清理误格式化的无关 Rust 文件；重新创建 worktree、显式 `cd` 后完成 Node 24 + MSI/NSIS 构建。

### 下次避免

执行 destructive build 前打印并校验 `pwd`/绝对路径，确认目标位于显式临时 worktree；构建后检查主工作区 diff 和资源 hash。

## PowerShell npm 脚本参数要拆分

### 踩坑

最终门禁脚本第一次把 `run lint` 作为一个字符串参数传给 npm，得到 usage 错误；完整 test 本身已经通过。

### 根因

PowerShell 调用外部命令时，数组元素不会自动按空格拆成多个 argv。

### 解决

改为 `npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd run build` 分别执行并保存独立 exit 文件，三项均为 0。

### 下次避免

构造 Windows CLI 参数时使用显式数组或逐条命令，不把带空格的子命令当作单个字符串传递。
