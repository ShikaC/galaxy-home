# Windows 桌面端验收记录

## 目标

在 Windows 主机对银河居所 Tauri 桌面端执行完整安装、启动、操作、重启、退出、卸载和异常恢复验收。

## 基线

- 日期：2026-08-12，Asia/Shanghai
- Git：`b4a841c0b68a5f83a2ef9f97d60d6b157cbc4a3f`
- 仓库：`E:\Projects\galaxy-home`
- 详细命令输出和截图：`.tmp/windows-desktop-acceptance/`

## 当前结果

结论为“环境阻塞”，不是通过。产品源码未修改，所有业务数据使用隔离测试目录。

### 环境与构建

- Windows 11 家庭版中文版，OS Build 26200，x64，显示缩放 125%（AppliedDPI 120）。
- PATH 中默认 Node 为 22.17.0；另有 Node 24.14.0 可执行文件。npm 通过系统 Node 启动器时会错误使用 Node 22，因此构建日志同时保留了 Node 24 直接调用 npm CLI 的结果。
- Rust stable 1.95.0，Cargo 1.95.0；WebView2 Runtime 151.0.4129.78。
- `npm ci`：PASS（Node 24 CLI，存在 jsdom engine warning）。
- `typecheck`：PASS。
- `lint`：FAIL，Biome 既报告 Windows glob/io error，也报告现有格式问题。
- `npm test`：FAIL，115 通过、2 失败：Windows secret 文件权限断言，以及 transcription 临时目录清理 EPERM。
- `build`：PASS。
- `desktop:build`：FAIL，Rust release EXE 构建完成，但 WiX `light.exe` 生成 MSI 失败。
- NSIS 专项打包：PASS。安装器 SHA256 为 `A36A27F95262CF686CC8A9EFED4D202DFF97E4987A4099E6C86A40142B83326E`。

### 实际操作

- 浏览器开发态使用全新 `.tmp/windows-desktop-acceptance/dev-data`，确认待办黄金路径 A、习惯黄金路径 B、项目手动推进 C、今日收获与回顾、设置持久化、搜索、侧栏收起/恢复、AI 未配置降级、应用内提醒和导出包敏感文件隔离。
- 导出 ZIP 仅含 `galaxy-home.json`，未发现 `secrets.json`、API Key 或 Token 名称。
- 开发 Web/API 监听为 `127.0.0.1:5180` 和 `127.0.0.1:3010`；冲突测试给出明确端口提示；无效 `GALAXY_NODE_PATH` 给出明确错误。
- 强制结束开发 Tauri 壳后，5 秒检查时 `node.exe` 仍占用 `3010/5180`；延迟复查后目标进程和端口才消失，记录为退出清理延迟。
- 原生 Tauri 窗口已启动并出现首次设置页，但 Windows 安全中心 Node.js 防火墙弹窗覆盖页面并拦截 Computer Use 输入。未代替用户点击安全设置，也未运行安装器或卸载程序。

### 证据

- 证据根目录：`.tmp/windows-desktop-acceptance/`。
- 截图：`screens/home-browser.png`、`screens/viewport-960x640-browser.png`、`screens/settings-browser.png`、`screens/project-detail-browser.png`、`screens/review-browser.png`、`screens/ai-drawer-browser.png`、`screens/sidebar-collapsed-browser.png`、`screens/native-onboarding.png`。
- 构建日志：`build/*.log`；启动日志：`dev/desktop-dev.log`；运行时日志：`runtime/*.log`。
- 数据文件列表：`dev-data/`；导出包：`export/galaxy-home-qa.zip`；产物哈希：`artifacts/sha256.log`。

### 严重度与结论

- P0：1，完整 `desktop:build` 无法生成 MSI 安装产物，按清单属于安装包构建阻塞。
- P1：3 个已确认质量/兼容问题：lint 失败、Windows 测试有两项失败（合并为一组）、强制退出后子服务未在 5 秒内清理。生产安装、原生高 DPI 等未测试项另列为证据缺口，不重复计入严重度数量。
- P2：0 个已确认视觉 P2；视觉复核未发现明确文字裁切、孤立单字或遮挡，但证据覆盖不足。
- 最终：环境阻塞。需用户处理安全弹窗并明确允许安装/卸载操作后，才能继续生产包闭环验收。

## 注意事项

- 所有业务数据使用独立测试数据。
- 报告中脱敏安装路径、用户目录和日志内容。
- 发现故障时保留现场和证据，不直接覆盖数据库或安装目录。

## 2026-08-13 生产闭环续验

### 基线与构建

- Windows 11 家庭版中文版，OS Build `26200`，x64，显示缩放 `125%`（AppliedDPI `120`）。Rust stable `1.95.0`、Cargo `1.95.0`、WebView2 `151.0.4129.78`。
- PATH 默认 Node 为 `v22.17.0`；独立 Node 24 可执行文件为 `v24.14.0`，`npm ci`、typecheck、build 和 NSIS 专项打包使用 Node 24 CLI 完成。生产壳实际从 PATH 拉起 Node 22，记录为兼容性问题。
- `npm ci` PASS；typecheck PASS；lint FAIL（Biome Windows glob/io error 与已有格式问题）；`npm test` FAIL（115 通过、2 个 Windows 失败）；`npm run build` PASS；完整 `npm run desktop:build` FAIL（WiX `light.exe` MSI 链接失败）；NSIS 专项 PASS。
- NSIS 产物：`src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe`；SHA256 `A36A27F95262CF686CC8A9EFED4D202DFF97E4987A4099E6C86A40142B83326E`。

### 生产壳实测

- 运行 NSIS 安装器完成安装并创建开始菜单入口；首次引导创建隔离空间“Windows验收空间”，未配置 AI。
- 生产服务只监听 `127.0.0.1:4177`；占用 4177 后重新启动，服务回退到 `127.0.0.1:4178`，页面正常加载。
- 完成生产待办“生产待办验收”：创建、加入今日、完成、刷新后保留，并在首页显示今日已完成 1 项。
- 完成生产习惯“生产习惯验收”：创建、打卡、撤销、再次打卡、刷新后仍为 1/1。
- 完成生产项目“生产项目验收”：创建、手动推进、提交成果/阻碍/下一任务反馈，手动进度到 10%；刷新后当前任务和“最近进展”保留反馈。
- 生产回顾页、设置、数据与回收站、全局搜索均可打开；搜索“生产”命中待办、项目和习惯；回收站为空状态可见。
- 生产侧栏收起/恢复、AI 侧栏打开/收起均可操作；未配置 AI 时显示“未配置”，发送控件禁用但其他功能可用。
- 生产导出包仅含 `galaxy-home.json`，未发现 `secrets.json`、API Key、Token 或 `.env` 名称；生产恢复未执行。
- 默认生产窗口约 `1280x800` 内容尺寸、主机 125% 缩放下中文标题和按钮未见裁切或遮挡；最小窗口和 150% 尚未实测。浏览器证据另有 `960x640` 与 `1280x800` 截图。

### 生命周期与卸载

- 正常关闭后 1 秒、5 秒均无目标 Node 子进程和 4177-4199 监听，PASS。
- 精确 PID 强制结束生产壳后，Node 子进程仍存活并监听 4177；1 秒和 5 秒均未清理，FAIL。随后仅终止本次验收记录的遗留 PID，重启应用后测试空间和业务记录仍在。
- 运行本地 NSIS 安装器完成首次安装并实际启动生产副本；关闭应用后运行该安装副本的卸载器，保持“Delete the application data”未勾选。卸载窗口显示“Uninstallation Complete”，安装目录、目标进程和端口清零，数据目录保留。
- 卸载后开始菜单快捷方式仍存在，但目标文件已不存在，形成失效入口，FAIL/P2。
- 生产数据在本机 AppModel 下实际位于 Tauri app data 的包缓存 `LocalCache/Roaming/app.galaxyhome.desktop`，包含 SQLite、WAL/SHM 和两份备份；普通 `%APPDATA%/app.galaxyhome.desktop` 目录未被生产壳使用。

### 严重度与结论

- P0：1，完整桌面打包无法生成 MSI。
- P1：4，lint 失败、Windows 测试失败、生产包使用不满足要求的 PATH Node 22、强制退出遗留 Node 服务。
- P2：1，卸载后残留失效开始菜单快捷方式。
- 最终结论：不通过。核心生产路径和 NSIS 安装/卸载已实测，但尚未达到文档第 17 节的通过门槛。

### 本轮证据

- 证据根目录：`.tmp/windows-desktop-acceptance/`。
- 构建：`build/*.log`；开发启动：`dev/desktop-dev.log`；生产生命周期：`install/production-lifecycle.log`、`install/port-fallback.log`、`install/force-exit.log`、`install/nsis-final-status.log`。
- 截图：`screens/native-onboarding.png`、`screens/home-browser.png`、`screens/project-detail-browser.png`、`screens/review-browser.png`、`screens/search-browser.png`、`screens/settings-browser.png`、`screens/sidebar-collapsed-browser.png`、`screens/ai-drawer-browser.png`、`screens/viewport-960x640-browser.png`、`screens/viewport-1280x800-browser.png`。
- 数据清单：`runtime/data-dir-file-list.txt` 和 `install/nsis-final-status.log`；导出包：`export/galaxy-home-qa.zip`，生产下载包文件名为 `galaxy-home.zip`。
