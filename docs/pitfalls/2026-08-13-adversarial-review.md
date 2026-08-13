# 对抗式审查踩坑记录

## Windows npm 启动器与 PATH 不一致

### 发现

PATH 中的 `node` 可以是 Node 24，但 Windows npm 启动器仍可能使用安装目录内的 Node 22；只检查 `node --version` 不能证明 npm 生命周期使用了同一运行时。

### 根因

npm 启动脚本直接绑定其安装目录旁的 Node，可绕过 PATH 排序。

### 处理

桌面脚本统一经过 `node-runtime.mjs`；有 `npm_execpath` 时用当前 `process.execPath` 直接执行 npm CLI，并把当前 Node 目录置于子进程 PATH 首位。

### 下次避免

同时记录 `process.execPath`、`process.version` 和 npm CLI 路径，不要只看 `where node` 或 `node --version`。

## `.mjs` 辅助模块的 TypeScript 声明

### 发现

Vitest 可以运行 `.mjs` 辅助模块，但 `tsc -b` 会将其视为隐式 any，导致严格类型检查失败。

### 根因

项目测试配置包含 `tests/**/*.ts`，而脚本目录没有自动生成的模块声明。

### 处理

添加 `scripts/node-runtime.d.mts`，只声明测试实际使用的导出函数，保持脚本接口和测试类型一致。

### 下次避免

新增被 TypeScript 测试导入的 JavaScript/ESM 工具时，同步提供最小 `.d.mts` 或改为受类型检查的 TypeScript 模块。

## 强制结束与 stdin 生命周期

### 发现

依赖 Tauri 正常退出事件无法覆盖强制结束父进程的场景，Node 子服务可能继续监听 loopback 端口。

### 根因

旧实现将 stdin 设为 null，子进程没有父进程存活信号；强制结束也不会触发 Rust 的正常清理回调。

### 处理

父进程保留 piped stdin，Node 在启用标志下监听 EOF 并关闭 Fastify 和数据库；真实子进程测试验证端口释放。

### 下次避免

桌面壳的正常退出和强制结束必须分别测试；检查子进程退出码、端口释放和数据目录句柄，而不是只观察主窗口消失。

## 子进程 stderr 管道

### 发现

Tauri 子进程的 stderr 如果设置为 piped 而不读取，短期启动正常，长期日志量增大后可能阻塞 Node 服务。

### 根因

操作系统 pipe 有限容量；子进程写满后会等待读取方，但父进程没有消费句柄。

### 处理

生产壳将 stderr 重定向到 null。当前壳没有消费或展示该日志，保留无人消费的 pipe 只增加阻塞风险。

### 下次避免

每个 `piped` 子进程流都必须有明确的读取线程、日志转发或改为 `null`；审查时不要只看子进程是否成功 spawn。

## WiX 与 NSIS 产物分开判定

### 发现

完整 Tauri build 可以完成前端、资源和 Rust release，但在 WiX `light.exe` 阶段失败；同一环境的 NSIS 目标可以成功生成。

### 根因

MSI 链接工具链是独立的外部环境依赖，不能由 NSIS 成功推断。

### 处理

分别运行完整桌面构建和 `--bundles nsis`，并分别记录结果；本轮代码改动只解决 Node 版本一致性，不把 WiX 环境错误伪装成代码修复。

### 下次避免

验收报告同时保留 MSI 和 NSIS 的退出码、日志和产物清单。
