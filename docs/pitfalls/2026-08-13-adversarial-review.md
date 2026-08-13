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

## NSIS 卸载快捷方式目标匹配

### 发现

Tauri 生成的 NSIS 卸载逻辑只在快捷方式目标仍等于当前 `$INSTDIR` 下的 exe 时删除快捷方式；旧安装路径变化后，快捷方式会被保留并指向不存在的文件。

### 根因

快捷方式删除被 `IsShortcutTarget` 条件保护，无法覆盖迁移安装或历史残留目标。

### 处理

通过 `installerHooks` 注册 `NSIS_HOOK_POSTUNINSTALL`，按当前用户和所有用户上下文无条件清理产品名快捷方式及空目录；只处理固定产品名，不扫描或删除其他应用快捷方式。

### 下次避免

安装/卸载验收要同时检查安装目录、卸载注册表、开始菜单、桌面快捷方式、进程和端口；不能仅以卸载器完成页判断清理完整。

## 卸载后的产品定位键

### 发现

卸载器即使删除了应用文件和卸载注册表，也可能保留 `Software\\galaxyhome\\银河居所` 的安装位置键；下一次安装器会把它当作旧安装位置，形成陈旧状态。

### 根因

Tauri 生成脚本只在用户勾选删除应用数据时清理该键，但安装位置不是应用数据，正常卸载也应清理；升级卸载则必须保留它直到新安装完成。

### 处理

NSIS `POSTUNINSTALL` 钩子在 `$UpdateMode <> 1` 时删除该 HKCU 定位键和空的厂商键，保留 app data，并在升级流程中跳过删除。

### 下次避免

卸载验收要区分“应用数据是否保留”和“安装/升级元数据是否清理”，分别检查数据库目录、卸载键、定位键和快捷方式。

## Windows 扩展路径传给 Node

### 发现

Tauri 在 Windows 上可能返回带 `\\?\\` 前缀的 `resource_dir()`、app data 或可执行文件路径；Node 24 将带此前缀的入口参数解析为盘符目录，服务会以 `EISDIR` 退出。

### 根因

Windows 扩展路径适用于 Win32 文件 API，但不是 Node 命令行入口的可移植表示；Rust 边界把它原样传给 Node。

### 处理

在 Tauri 启动 Node 前把本地盘符扩展路径转换为普通路径，把 `\\?\\UNC\\server\\share` 转换为 `\\server\\share`；同时检测 Node 子进程提前退出并显示可读启动错误页。

### 下次避免

Windows 桌面验收要记录 Node 子进程的完整命令行、可执行路径和退出码；仅看到壳进程存在不能证明服务已经启动。

## Windows 环境变量 `Path` 大小写

### 发现

PowerShell 启动 Node 24 时，Windows 进程环境中有效的 PATH 键是 `Path`；只写 `PATH` 会让 `runtimeEnv()` 的子进程环境丢失原有 `.cargo\\bin`，Tauri 随后报 `cargo metadata: program not found`。

### 根因

Windows 环境变量名大小写不敏感，但 Node 的 `process.env` 会保留继承时的键名。代码只读取 `base.PATH`，在 `base.Path` 存在时读到空字符串并覆盖路径。

### 处理

根据 Windows 实际继承键选择 `Path`，其他平台使用 `PATH`；增加 `runtimeEnv()` 回归测试，并在显式 Node 24 + Rust stable 环境下重新生成 MSI/NSIS。

### 下次避免

Windows 子进程启动链同时检查 Node、Cargo、WiX 的绝对路径和子进程实际命令行；不要假设跨平台环境变量键名的大小写形态一致。

## WiX 中文 MSI 与生产依赖测试夹具

### 发现

WiX `light.exe` 的直接链接可启动，但原始 MSI 使用英文 1252 本地化时无法编码中文；切换代码页后又被生产依赖中的测试夹具文件名 `snow ☃` 阻断。

### 根因

Tauri 生成的 MSI 会把生产资源目录中的每个文件交给 WiX；`npm ci --omit=dev` 不等于依赖包内不存在测试/示例目录。WiX 代码页必须与中文产品元数据一致，且打包输入不能包含不需要运行的非运行时夹具。

### 处理

配置 WiX `zh-CN`，生产依赖复制完成后裁剪通用的 `test/tests/example/examples/doc/docs/bench` 目录；保留运行时代码并用单测锁定裁剪边界。完整 `desktop:build -- --no-sign` 现可生成 MSI 和 NSIS。

### 下次避免

遇到 WiX `light.exe` 黑盒失败时，先独立运行等价的 `candle/light` 并保存 stderr，再分别验证代码页、扩展参数和生产资源清单；不要只依据 Tauri 汇总日志判断根因。

## perMachine MSI 安装权限

### 发现

MSI 已成功生成，但在标准完整性级别的当前会话中执行安装返回错误 1925，随后 1603 回滚；隔离安装目录保持空，未能继续 MSI 启动/卸载。

### 根因

WiX 包的 `<Package InstallScope="perMachine">` 需要管理员提升；当前会话虽然属于 Administrators 组，但令牌为 Medium，自动化调用 `RunAs` 也被环境拒绝。

### 处理

保留完整 `msiexec` 日志和回滚现场，不把“生成 MSI”误写成“安装通过”；release EXE 的启动、正常退出和强制退出清理另行实测。

### 下次避免

MSI 安装验收前先确认提升状态；使用全新管理员测试用户或人工确认 UAC 后，再复测 `msiexec /i`、实际启动、退出、卸载和残留检查。
