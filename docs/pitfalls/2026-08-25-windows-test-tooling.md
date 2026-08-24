# Windows 测试与构建工具链踩坑

## 全局 jsdom 会破坏 Node 集成测试

### 踩坑

单独运行少量 SQLite 测试可能通过，但完整并行运行时，大量服务端套件在收集阶段报 `node:sqlite` 无法由 Vite 客户端环境打包。

### 根因

Vitest 全局配置使用 jsdom。客户端测试需要 DOM，服务端集成测试需要原生 Node 环境；二者混在同一个项目后，收集顺序和并行依赖图会暴露错误环境。

### 解决

使用 Vitest projects 按目录声明两个环境：`tests/client` 使用 jsdom 和 Testing Library setup，`tests/integration` 与 `tests/unit` 使用 Node。

### 下次避免

新增测试目录时必须明确归属客户端或 Node 项目。涉及 `node:*`、Fastify、文件系统或数据库的测试不得依赖全局 jsdom。

## Windows chmod 不能验证 POSIX 0600

### 踩坑

secret 文件写入后调用 `chmod(0600)`，Windows 上 `stat().mode & 0777` 仍为 `0666`，导致安全测试误报。

### 根因

Windows ACL 与 POSIX mode bits 不是同一权限模型。Node 在 Windows 接受 chmod 调用，不代表 `stat` 能呈现 POSIX 权限位。

### 解决

跨平台测试验证 API Key 不会被空值覆盖；POSIX 模式位修复只在非 Windows 平台运行。若要验证 Windows secret 防护，应另行实现并测试 ACL 或系统凭据存储，不能把 chmod 断言当作替代。

### 下次避免

文件权限测试先按平台权限模型拆分。Windows 安全要求必须用 Windows ACL 或凭据管理器的可观察证据。

## 测试拥有的 SQLite 句柄必须由测试关闭

### 踩坑

Windows 上递归删除测试临时目录时报 EPERM/EBUSY，Linux/macOS 上可能因文件删除语义不同而未暴露。

### 根因

测试直接创建 `DatabaseSync` 并传给 `buildApp`，但只有生产入口才注册数据库关闭 hook。测试误以为 `app.close()` 会关闭不属于它的句柄。

### 解决

保存测试创建的数据库引用，在关闭 Fastify 和假 HTTP 服务后显式 `database.close()`，再删除临时目录。

### 下次避免

资源由谁创建就由谁释放。Windows 集成测试必须验证临时目录能够实际删除，不能仅依赖进程结束回收句柄。

## npm CLI 的 Node 与 npm script 的 Node 可能不同

### 踩坑

用 Node.js 24 执行 `npm-cli.js` 后，`npm run desktop:build` 内部的 `node scripts/run-tauri.mjs` 仍由 PATH 中的 Node.js 22 启动。

### 根因

npm CLI 的当前运行时不会自动重写脚本 shell 的 PATH。脚本中的裸 `node` 会再次执行命令解析。

### 解决

在单条验收命令中把合规 Node 目录放到 PATH 首位，再运行 npm；不需要修改系统 PATH。

### 下次避免

同时记录 `process.execPath`、`node --version` 和 npm script 内部 Node 版本。便携 Node 验收必须调整命令级 PATH，不能只显式调用一次 `node npm-cli.js`。

## Windows npm 不展开通配符且换行随宿主变化

### 踩坑

`biome check src tests *.ts` 在 Windows npm 中把 `*.ts` 原样传给 Biome，触发非法路径；Git 的 CRLF 工作树又产生大量格式诊断。

### 根因

Windows npm 默认 shell 不提供 Unix glob 展开，Biome 默认 LF 也不符合启用 `core.autocrlf` 的 Windows 工作树。

### 解决

脚本显式列出 `vite.config.ts` 和 `vitest.config.ts`，Biome 设置 `lineEnding: "auto"`。

### 下次避免

跨平台 npm scripts 不依赖 shell glob。格式器换行策略必须与仓库 checkout 策略一致，并在 Windows 与 macOS 各跑一次 lint。
