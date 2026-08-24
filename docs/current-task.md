# 当前任务

## 目标

按 `docs/windows-desktop-acceptance.md` 完整验收银河居所 Windows Tauri 桌面端，实际覆盖构建、启动、安装、业务操作、重启、退出、卸载和异常恢复。

## 当前状态

- 日期：2026-08-25。
- 自动化门禁修复提交：`65d8083012b3966e1861e2ae5eed21519bcf4a3a`。
- `npm ci`、typecheck、lint、`npm test`、Web build 和 `desktop:build -- --no-sign` 已在 Node.js 24.14.0 下复验通过。
- 此前两项 P1 自动化阻塞已修复，当前已确认代码缺陷计数为 P0 0、P1 0、P2 0。
- 最终结论仍为“不通过”：原因已从代码门禁失败收敛为第 18 节仍有人工场景未测试，不能在缺少证据时改判“通过”。
- 测试数据仅包含本轮验收记录；AI 未配置，不含 API Key、Token 或真实私人数据。
- 用户已有的 `src-tauri/Cargo.toml`、`src-tauri/resources/app/README.md` 和 `.tmp/` 未纳入修复提交。

## 范围边界

- 不验收签名、SmartScreen、自动更新、内嵌 Node、关机后后台通知、PWA、手机专门适配和本地模型。
- 生产壳使用 Tauri app data 目录，不假设 `GALAXY_DATA_DIR` 可覆盖生产数据路径。
- 报告和证据不得包含密钥、令牌、真实私人数据或完整敏感本机路径。

## 已确认通过

- Windows 11 家庭版中文版 Build 26200、x64；Rust/Cargo stable 1.95.0；WebView2 151.0.4129.101。
- 显式 Node 24.14.0 下 `npm ci`、typecheck、Web build 和完整 `desktop:build -- --no-sign` 通过，MSI 与 NSIS 均已生成。
- MSI 经用户确认 UAC 后安装成功，Windows Installer 状态为 `0`；产品版本、默认安装目录、开始菜单和桌面快捷方式正确。
- 安装副本完成待办、习惯、项目三条黄金路径，并覆盖回顾、设置、搜索、回收站、侧栏和 AI 侧栏。
- 正常退出、连续冷启动、重启持久化和精确 PID 强制退出通过；应用 Node 仅监听 `127.0.0.1`，退出后 5 秒内进程和 4177-4199 端口清零。
- PATH 中无 Node 时，有效 `GALAXY_NODE_PATH` 可启动；无效路径显示可理解错误；4177 占用回退到 4178；4177-4199 全占用显示明确范围错误。
- 导出 ZIP 仅含 `galaxy-home.json`，未发现 secrets/API Key/Token；有效恢复会先创建恢复点，恢复后临时标记消失，原有验收数据完整。
- MSI 卸载成功，Windows Installer 状态为 `0`；安装目录、产品注册、快捷方式、应用进程和端口均清零；Roaming app data 与恢复点按实际行为保留。
- 既有证据覆盖 1280x800 默认窗口、960x640 最小窗口和 125% 缩放；未见严重中文裁切或遮挡。

## 自动化门禁修复

- Vitest 按目录拆分为客户端 jsdom 项目和服务端 Node 项目，`node:sqlite` 不再被客户端环境打包。
- Secret 测试保留跨平台 API Key 覆盖保护，并只在 POSIX 平台验证 `0600` 模式位。
- Transcription 测试在删除临时目录前关闭自己创建的 SQLite 句柄。
- lint 不再依赖 Windows npm 无法展开的 `*.ts`，Biome 根据宿主自动使用 CRLF 或 LF。
- 最新结果：lint 检查 211 个文件无诊断；`npm test` 43 个文件全部通过，127 项通过，1 项 POSIX 权限测试在 Windows 明确跳过。

## 未测试与残余风险

- 150% 显示缩放。
- Windows 系统通知及通知权限拒绝后的应用内降级；应用内提醒已通过。
- 原生恢复界面导入错误或版本不兼容包时不覆盖数据库；有效包恢复已通过。
- Tauri app data 目录无写权限、加载过程中关闭窗口、Windows 睡眠/唤醒、AI 服务超时。
- Node.js 24.14.0 满足项目 `>=24`，但 jsdom 30.0.1 在 24.x 上声明需要 24.15.0 或更高版本；当前仅有 engine 警告且所有门禁通过。
- 完整开发依赖审计有 1 个 high，来源为 `vite -> postcss -> nanoid 3.3.17`；生产依赖审计为 0，该包不进入桌面运行时。

## 产物

- MSI：`src-tauri/target/release/bundle/msi/银河居所_0.1.0_x64_zh-CN.msi`，SHA256 `F0978713AABC02F5BDAC58A640A60F22E5B87FF2C72A5662E880F6D4749FF81E`。
- NSIS：`src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe`，SHA256 `3BDF8D017BCD352037E2B39FF0E738F731B2D8BCC460B3745C8458CE4634B2CB`。

## 证据与下一步

- 原完整验收：`docs/codex-log/2026-08-24-windows-msi-acceptance.md`。
- 自动化修复复验：`docs/codex-log/2026-08-25-windows-automated-gates-fix.md`。
- 本轮证据：`.tmp/windows-desktop-acceptance/`。
- 下一步补测 150% 缩放、系统通知拒绝、错误恢复包、数据目录无权限、加载中关闭、睡眠唤醒和 AI 超时；全部通过后才能将最终结论改为“通过”。
