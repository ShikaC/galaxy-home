# Windows 桌面端剩余验收与最终报告

## 最终结论

- 结论：通过。
- 验收提交：`a4ee30f12b729c6ba07ecd485b04d2251e5b5325`。
- 最终问题计数：P0 0、P1 0、P2 0。
- 本轮发现的产品问题均已修复并完成自动化回归与真实 Windows 桌面操作复验。
- 验收仅使用独立测试数据、本地假 AI 服务和脱敏记录，未使用 API Key、Token 或真实私人数据。

## 第 18 节回传报告

```text
项目：银河居所 Windows 桌面端
测试日期：2026-08-25
测试主机：Windows 11 家庭版中文版专用验收环境
Windows 版本 / OS Build：10.0.26200 / 26200
架构：x64（AMD64）
显示缩放：125% 原始与恢复值；150% 实测通过
Node：v24.15.0；npm 11.12.1
Rust：rustc 1.95.0 stable；Cargo 1.95.0
WebView2：151.0.4129.101
Git 提交：a4ee30f12b729c6ba07ecd485b04d2251e5b5325

npm ci：PASS（519 个包，0 vulnerabilities，无 engine warning）
typecheck：PASS
lint：PASS（213 个文件，无诊断）
npm test：PASS（44 个文件；129 项通过；1 项 POSIX 权限测试按 Windows 设计跳过）
build：PASS
Rust test：PASS（9 项）
Rust Clippy：PASS（all targets/all features，warnings 视为错误）
E2E：PASS（30 项；另有 1.5 DPR 定向测试及并发端口隔离测试）
desktop:build：PASS（退出码 0；MSI 与 NSIS 均生成）

构建：PASS
安装：PASS（MSI 与 NSIS 均完成实际安装链路；最终 NSIS 完成安装、启动、退出与卸载闭环）
开发态启动：PASS（真实 Tauri 窗口完成首次设置并进入首页）
生产包冷启动：PASS
生产端口回退：PASS（4177 占用时使用 4178；4177-4199 全占用时明确报错）
退出进程清理：PASS（壳、产品 Node、4177-4199 及开发端口均清零）
数据目录与持久化：PASS
黄金路径 A：PASS
黄金路径 B：PASS
黄金路径 C：PASS
AI 未配置降级：PASS
AI 配置路径：PASS（本地假服务验证配置、超时、错误恢复；未使用真实第三方密钥）
搜索与弹窗：PASS
高 DPI：PASS（125% 与 150%；1280x800 与 960x640）
系统通知：PASS（允许、拒绝降级、恢复权限）
导出恢复与密钥隔离：PASS
卸载：PASS

P0 数量：0
P1 数量：0
P2 数量：0

失败项与复现步骤：
1. 无剩余失败项。验收过程中发现的问题、原始复现、预期与修复结果见下文“已修复问题”。

产物路径与 SHA256：
- src-tauri/target/release/bundle/msi/银河居所_0.1.0_x64_zh-CN.msi
  SHA256 7C65138CD54FE001B04ABDE83E12733383C13496BE3CE869C963F47E79EAC083
- src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe
  SHA256 15D558EA010355FC55E497F3C275E8DF8E657A9785E54FBB54327018DF7D3CCB

证据文件：
- 截图：.tmp/windows-desktop-acceptance/screens/、.tmp/windows-desktop-acceptance-remaining/screens/
- 构建日志：.tmp/windows-desktop-acceptance/build/desktop-build-full-after-msi-fix.log；最终重建结果与哈希记录于本报告
- 启动日志：.tmp/windows-desktop-acceptance/dev/desktop-dev.log、.tmp/windows-desktop-acceptance/install/production-lifecycle.log
- 进程/端口记录：.tmp/windows-desktop-acceptance/runtime/msi-process-port-record-20260824.json、.tmp/windows-desktop-acceptance-remaining/runtime/sleep-monitor.csv
- 数据目录文件列表：.tmp/windows-desktop-acceptance/runtime/msi-data-dir-file-list-20260824.json；最终列表见本报告
- 安装/卸载日志：.tmp/windows-desktop-acceptance/install/
- 导出包：.tmp/windows-desktop-acceptance/export/galaxy-home-msi-20260824.zip

最终结论：通过
环境阻塞说明：无。UAC、通知权限切换与睡眠/唤醒所需人工操作均已完成，环境已恢复。
```

## 完整测试项

| 测试项 | 结果 | 实测证据摘要 |
| --- | --- | --- |
| Windows 版本、架构 | PASS | Windows 11 Home zh-CN，10.0.26200，x64 |
| Node.js >=24 | PASS | 官方 Node.js 24.15.0 x64；下载包 SHA256 与官方清单匹配 |
| Rust stable | PASS | rustc/Cargo 1.95.0；rustfmt 与 Clippy stable 组件可用 |
| WebView2 | PASS | 151.0.4129.101 |
| `npm ci` | PASS | 519 个包；完整与生产依赖审计均为 0 |
| typecheck | PASS | `tsc -b --pretty false` 退出码 0 |
| lint | PASS | Biome 213 个文件无诊断 |
| `npm test` | PASS | 44 个文件、129 项通过；Windows 不适用的 POSIX mode 测试跳过 |
| Web build | PASS | Vite 生产构建退出码 0 |
| Rust tests/Clippy | PASS | 9 项测试通过；严格 Clippy 无 warning |
| 完整 E2E | PASS | 桌面 compact/wide 共 30 项；高 DPI 定向测试通过 |
| `npm run desktop` | PASS | 真实开发壳启动；首次设置提交后首页、导航、提醒与业务区可见 |
| `npm run desktop:build -- --no-sign` | PASS | MSI/NSIS 均生成，生产依赖审计 0 |
| MSI 安装/启动/退出/卸载 | PASS | 提升安装、真实窗口、正常退出、Windows Installer 状态 0、卸载清理通过 |
| NSIS 安装/启动/退出/卸载 | PASS | 最终本地包经 RunAs 安装；安装目录与快捷方式有效；卸载完成并清理 |
| Node 服务启动 | PASS | 子进程使用合规 Node，健康检查与元数据接口返回 200 |
| `127.0.0.1` 监听 | PASS | 产品服务仅监听 loopback，不暴露 `0.0.0.0` |
| 4177-4199 回退 | PASS | 4177 被占用时选择 4178；全占用时显示明确范围错误 |
| 正常退出清理 | PASS | 5 秒内壳、产品 Node 与产品端口为 0 |
| 加载中关闭清理 | PASS | 观察到子 Node 后关闭壳；5 秒后壳、Node、端口均为 0 |
| 强制退出恢复 | PASS | 精确结束壳后子 Node/端口清理，再次启动正常 |
| Tauri app data 路径 | PASS | 生产使用 `%APPDATA%\app.galaxyhome.desktop`，未使用 `GALAXY_DATA_DIR` 覆盖 |
| 数据持久化 | PASS | 刷新、冷启动和强制退出后测试数据保留；备份目录可用 |
| 待办、习惯、项目、回顾 | PASS | 三条黄金路径及回顾记录均实际操作并刷新/重启核对 |
| 设置、搜索、回收站 | PASS | 设置持久化；中文全局搜索命中；移入回收站与恢复通过 |
| 黄金路径 A | PASS | 创建待办 -> 加入今日 -> 完成 -> 刷新 -> 回顾可见 |
| 黄金路径 B | PASS | 创建习惯 -> 打卡 -> 撤销 -> 再次打卡 -> 刷新保持 |
| 黄金路径 C | PASS | 创建项目 -> 手动推进 -> 提交反馈 -> 刷新保持 |
| 侧栏与 AI 侧栏 | PASS | 主侧栏展开/收起；AI 侧栏打开/收起；未配置时不阻塞业务 |
| 1280x800 默认窗口 | PASS | 首页与核心业务页面可操作，无横向溢出 |
| 960x640 最小窗口 | PASS | 主侧栏、AI 侧栏、回顾页与提醒横幅可操作 |
| 125% 高 DPI | PASS | 原始系统缩放，原生窗口实测 |
| 150% 高 DPI | PASS | 系统设置实切 150%，原生检查及 1.5 DPR PNG/断行测试通过，结束后恢复 125% |
| 中文视觉 | PASS | 标题、副标题、按钮和长文本无残留孤立单字、裁切、遮挡、方框或图标缺失 |
| 应用内提醒 | PASS | 横幅、30 分钟后、今天不再提醒及重启补显路径通过 |
| Windows 系统通知 | PASS | PushNotification Platform 事件确认通知送达 |
| 通知拒绝降级 | PASS | 系统记录 `ToastSettingDisabled`；应用横幅和 30 分钟后仍可用；用户已恢复权限 |
| 导出与有效恢复 | PASS | 导出结构正确；恢复点创建；修改后恢复符合定义 |
| 错误恢复包保护 | PASS | 非法 ZIP 返回 400 和中文错误，验收数据保持不变 |
| 密钥隔离 | PASS | 导出包仅含 `galaxy-home.json`，敏感文件名和 API Key/Token 匹配为 0 |
| Node 不在 PATH | PASS | 有效 `GALAXY_NODE_PATH` 可启动；无效路径显示可理解错误 |
| 数据目录不存在 | PASS | 自动创建并写入生产数据库 |
| 数据目录无写权限 | PASS | 原生启动失败窗口显示拒绝访问；Node/端口为 0；ACL 原样恢复 |
| AI 服务超时 | PASS | 本地无响应服务触发 25 秒超时；中文错误显示且 UI 恢复 |
| 睡眠/唤醒 | PASS | Kernel-Power 506/507 证明 Modern Standby 进入/退出；唤醒后壳、Node、监听及搜索均正常 |
| 最终卸载清理 | PASS | 安装目录、桌面/开始菜单快捷方式、产品进程和端口均不存在；用户数据按设计保留 |

## 黄金路径结果

- A：创建验收待办，加入今日并完成；刷新、重启后状态保留，回顾页列出完成项。
- B：创建打卡型习惯，依次完成、撤销、再次完成；刷新、重启后统计保持 1/1。
- C：创建周期项目，手动推进至 35%，提交成果反馈后到 45%；刷新、重启后状态与反馈保留。

## 通知与睡眠恢复

- 通知允许时，Windows PushNotification Platform 记录送达相关事件，应用内提醒同时可用。
- 用户关闭应用通知后，系统事件记录禁用原因；应用没有出现未处理拒绝，顶部横幅及“30 分钟后”仍能操作。
- 用户已恢复通知。最终注册表 `Enabled` 无显式禁用值，按 Windows 默认启用语义处理。
- 睡眠监控共记录 245 个样本；Modern Standby 进入/退出事件完整。唤醒后应用、Node 子进程及 loopback 监听均存在，打开全局搜索成功。

## 数据目录最终文件列表

```text
%APPDATA%\app.galaxyhome.desktop\
  backups\
  galaxy-home.sqlite       335872 bytes
  galaxy-home.sqlite-shm    32768 bytes
  galaxy-home.sqlite-wal   243112 bytes
```

- 未发现 `secrets.json`；本轮假 AI 配置在验证后已删除。
- 卸载后保留业务数据目录符合当前产品行为。

## 已修复问题

以下问题是验收中实际复现的缺陷，修复后均通过回归；不再计入最终 P0/P1/P2。

| 发现时级别 | 问题与复现 | 预期 | 修复前实际 | 修复与复验 |
| --- | --- | --- | --- | --- |
| P1 | AI 地址指向本地接收但不响应的服务，发送请求并等待超时 | 显示稳定中文错误并恢复交互 | 暴露英文运行时 TimeoutError | 统一映射为 `AI 服务请求超时，请稍后重试`；集成测试和原生 UI 通过 |
| P1 | Tauri 通知权限 API 抛出普通 Error | 应用内提醒继续可用且无未处理拒绝 | Promise 拒绝可能泄漏为 unhandled rejection | 增加通知边界；客户端回归与拒绝权限实测通过 |
| P1 | 从设置恢复格式错误 ZIP | 返回可理解错误且现有数据库不变 | HTTP 500，UI 仅显示 `服务暂时不可用` | 增加 400 `IMPORT_ARCHIVE_INVALID` 映射；数据库保持测试与安装副本复验通过 |
| P1 | 已存在的 Tauri app data 目录对当前用户拒绝写入 | 启动前明确报错，不启动 Node | `create_dir_all` 通过后 Node 泛化退出 | 增加零字节写入探针；原生错误窗口、Node 0、端口 0 通过 |
| P2 | 150% 首页项目空状态 | 中文说明保持自然断行 | 最后一行仅 `里。` | 空状态正文启用平衡换行；1.5 DPR 回归和双视觉审查通过 |
| P1 | Windows 执行 Playwright webServer | 正确传入端口并启动 | POSIX 行内环境变量语法导致启动失败 | 改为结构化 `webServer.env` |
| P1 | 两套 Playwright 并发 | 各自使用隔离端口 | 固定端口相互占用 | 新增一次性动态端口运行器；并发定向套件均通过 |
| P1 | `npm audit` | 开发和生产依赖均无高危告警 | `nanoid 3.3.17` high | 锁文件升级至 3.3.18；完整审计 0 |

## 安装、退出与清理记录

- Computer Use 首次直接启动 NSIS 时触发 Windows 应用容器文件虚拟化，快捷方式目标不存在；该结果判为验收工具问题而非产品通过证据。
- 随后使用 `Start-Process -Verb RunAs` 启动同一 NSIS，用户人工确认 UAC。正常安装目录、卸载器、桌面快捷方式与资源路径均存在，真实产品 Node 启动成功。
- 正常退出后产品壳、产品 Node 和 4177-4199 监听为 0；NSIS 卸载显示完成后，安装目录、桌面/开始菜单快捷方式均清理。
- 最终开发态正常关闭后，3010、5180 与 4177-4199 监听均为 0。仍存在的 3 个仓库关联 `node.exe` 已逐 PID 归因为 Codex 代码索引和 Computer Use 运行时，不是产品子进程。

## 证据索引

- 150% 首页 PNG：`.tmp/windows-desktop-acceptance-remaining/screens/150-home-playwright.png`
- 150% 设置 PNG：`.tmp/windows-desktop-acceptance-remaining/screens/150-settings-playwright.png`
- 安装副本错误恢复保护：`.tmp/windows-desktop-acceptance-remaining/screens/installed-invalid-restore.png`
- 睡眠/唤醒采样：`.tmp/windows-desktop-acceptance-remaining/runtime/sleep-monitor.csv`
- 业务、窗口、侧栏、搜索与设置截图：`.tmp/windows-desktop-acceptance/screens/`
- 构建、测试、安装、启动、进程、端口、数据目录和导出证据：`.tmp/windows-desktop-acceptance/`

## 范围外事项

代码签名、SmartScreen、自动更新、内嵌 Node、关机后后台通知、PWA、手机专门适配和本地模型按约束不验收，不计入问题数量或最终结论。
