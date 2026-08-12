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
