# Windows 自动化验收门禁修复复验

## 结论

- 修复提交：`65d8083012b3966e1861e2ae5eed21519bcf4a3a`。
- 此前阻断发布的 `npm test` 和 lint 均已修复并通过。
- 当前已确认缺陷：P0 0、P1 0、P2 0。
- Windows 完整验收最终结论仍为“不通过”，仅因为仍有单列人工场景未测试；这不是环境阻塞，也不再是自动化门禁失败。

## 环境

- Windows 11 家庭版中文版，OS Build 26200，x64。
- Node.js 24.14.0，npm 10.9.2。
- Rust/Cargo stable 1.95.0。
- WebView2 151.0.4129.101。
- 显示缩放证据沿用同一验收主机：100% 当前活动显示、125% 已测、150% 未测试。

## 根因与修复

### Vitest 环境错误

全局 `environment: "jsdom"` 把服务端集成测试送入 Vite 客户端环境，完整并行收集时无法打包 `node:sqlite`。现按目录拆成 `client/jsdom` 和 `integration+unit/node` 两个 Vitest 项目。

### Windows secret 权限断言错误

Windows 的 `chmod(0600)` 不提供 POSIX 模式位语义，`stat().mode` 返回 `0666`，原测试在 Windows 必然误报。现将 API Key 保留行为作为跨平台测试，将 `0600` 权限位测试明确限制为非 Windows 平台；生产 secret 写入逻辑未削弱。

### SQLite 临时目录清理失败

Transcription 测试创建的数据库句柄不属于 `buildApp` 生命周期，测试结束时直接删除目录会触发 EPERM/EBUSY。现由测试在删除目录前关闭自己创建的数据库。

### Biome Windows 兼容问题

Windows npm 不展开脚本中的 `*.ts`，Biome 收到非法字面路径；同时工作树 CRLF 与默认 LF 冲突。现使用明确的根配置文件路径，并设置 `lineEnding: "auto"`，再对既有诊断文件执行安全格式化和导入排序。

## 复验结果

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| `npm ci` | PASS | 519 个包安装完成，退出码 0 |
| typecheck | PASS | `tsc -b --pretty false`，退出码 0 |
| lint | PASS | Biome 检查 211 个文件，无诊断 |
| `npm test` | PASS | 43 个文件通过；127 项通过；1 项 POSIX 权限测试在 Windows 跳过 |
| Web build | PASS | Vite 生产构建退出码 0 |
| `desktop:build -- --no-sign` | PASS | 精确退出码 0；MSI、NSIS 两种 bundle 均生成 |
| 生产依赖审计 | PASS | `npm audit --omit=dev`：0 漏洞 |
| 构建后清理 | PASS | 相关构建进程 0；4177-4199 监听 0 |

## 安装包

- `src-tauri/target/release/bundle/msi/银河居所_0.1.0_x64_zh-CN.msi`
  - SHA256：`F0978713AABC02F5BDAC58A640A60F22E5B87FF2C72A5662E880F6D4749FF81E`
- `src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe`
  - SHA256：`3BDF8D017BCD352037E2B39FF0E738F731B2D8BCC460B3745C8458CE4634B2CB`

## 环境阻塞处理

仅用 Node.js 24 启动 npm CLI 不够：npm 脚本中的裸 `node` 会再次从 PATH 解析，本机 PATH 首位仍是 Node.js 22.17.0，因此桌面脚本的版本保护会拒绝运行。复验使用命令级 PATH 将 Node.js 24 目录置于首位，没有修改系统 PATH；第二次完整桌面构建明确退出 0。

Git Bash MCP 在首次真实打包 300 秒后仅丢失 RPC 返回，实际构建进程继续并完成。为取得可审计的退出码，随后通过 PowerShell 承载同一 npm 命令并等待到 `desktop_build_exit_code=0`。

## 残余风险

- jsdom 30.0.1 在 Node.js 24.x 上声明需要 24.15.0 或更高版本；24.14.0 下当前门禁均通过，但应升级运行时以消除 engine 警告。
- 完整开发依赖树仍有一个 `nanoid 3.3.17` high advisory，来源为 Vite/PostCSS；生产依赖树为 0 漏洞，未进入桌面运行时。
- 红线复现留下两个仅含假测试数据的 `%TEMP%\galaxy-transcription-*` 目录；修复后的测试清理已通过，但删除旧目录被执行策略拒绝，未继续绕过。
- 尚未补测 150% 缩放、Windows 系统通知权限拒绝、原生错误恢复包、app data 无写权限、加载中关闭、睡眠唤醒和 AI 超时。

## 最终判定

自动化代码阻塞：已修复。

Windows 完整验收：不通过，原因仅为上述人工测试缺口；不存在当前环境阻塞。
