# Windows MSI 安装、恢复与卸载验收

## 基线与范围

- 日期：2026-08-24，Asia/Shanghai。
- 验收工作树 HEAD：`a00ef905f25cd9eb63839f1d1ac56a2621d068d8`；安装产物对应功能修复提交 `a2fb314284d263e19b8e792d8172546aadeb00d4`。
- 主机：Windows 11 家庭版中文版，版本 `10.0.26200`，OS Build `26200`，x64。
- 数据：沿用已确认只含验收记录的 `%APPDATA%\app.galaxyhome.desktop`；未配置 AI，不含 API Key、Token 或真实私人数据。
- 本轮不验收签名、SmartScreen、自动更新、内嵌 Node、关机后后台通知、PWA、手机专门适配和本地模型。
- 本轮没有修改产品源码；用户已有的 `src-tauri/Cargo.toml`、`src-tauri/resources/app/README.md` 和 `.tmp/` 未纳入提交。

## 第 18 节回传报告

```text
项目：银河居所 Windows 桌面端
测试日期：2026-08-24
测试主机：Windows 11 家庭版中文版，OS Build 26200
Windows 版本 / OS Build：10.0.26200 / 26200
架构：x64
显示缩放：当前活动显示 100%；既有 125% 原生验收证据；150% 未测试
Node：PATH v22.17.0；合规运行显式使用 v24.14.0；npm 10.9.2
Rust：rustc stable 1.95.0；Cargo 1.95.0
WebView2：151.0.4129.101
Git 提交：a00ef905f25cd9eb63839f1d1ac56a2621d068d8（报告 HEAD）；a2fb314284d263e19b8e792d8172546aadeb00d4（产物功能修复）

npm ci：PASS（既有同一产品提交证据；Node 24）
typecheck：PASS（既有同一产品提交证据）
lint：FAIL（206 项既有 CRLF/格式诊断）
npm test：FAIL（43 个文件、36 个测试：34 通过、2 失败；另有 25 个套件未收集）
build：PASS（既有同一产品提交证据）
desktop 开发态启动：PASS（既有实测）
desktop:build：PASS（Node 24 + Rust stable；MSI/NSIS 同时生成）

安装：PASS（MSI 与既有 NSIS 均已实际安装；本轮 MSI Windows Installer 状态 0）
生产包冷启动：PASS（安装副本多次冷启动，真实 WebView2 窗口可操作）
生产端口回退：PASS（4177 被独立进程占用时应用监听 4178）
退出进程清理：PASS（正常退出和精确 PID 强制退出后 5 秒内壳、Node、4177-4199 清零）
数据目录与持久化：PASS（%APPDATA%\app.galaxyhome.desktop；重启后业务状态保持）
黄金路径 A：PASS（创建待办 -> 加入今日 -> 完成 -> 刷新 -> 本地回顾列出完成项）
黄金路径 B：PASS（创建习惯 -> 打卡 1/1 -> 撤销 0/1 -> 再次打卡 1/1 -> 重启保持）
黄金路径 C：PASS（创建项目 -> 手动进度 35% -> 提交成果反馈 -> 进度 45% -> 重启保持）
AI 未配置降级：PASS（手动待办、习惯、项目、回顾可用，AI 侧栏显示未配置）
AI 配置路径：未测试（未配置真实 API Key 或 Token）
搜索与弹窗：PASS（全局搜索同时命中验收待办、项目、习惯）
高 DPI：PASS（既有 125%、1280x800、960x640 原生截图；150% 未测试）
系统通知：未测试（应用内提醒 PASS；Windows 通知与权限拒绝降级未取得证据）
导出、有效恢复与密钥隔离：PASS
错误恢复包保护：未测试（未验证错误或版本不兼容包不会覆盖数据库）
卸载：PASS（MSI Windows Installer 删除状态 0）

P0 数量：0（本轮已确认问题）
P1 数量：2（全量 npm test 失败；lint 失败）
P2 数量：0

失败项与复现步骤：
1. npm test
   - 步骤：显式 Node 24 执行 npm test。
   - 预期：全部套件收集并通过，退出码 0。
   - 实际：43 个文件、36 个测试中 34 通过、2 失败；25 个套件因 node:sqlite 被 client Vite 解析而未收集。两个测试失败分别是 Windows secret 文件权限断言和 transcription SQLite 清理 EBUSY。
2. npm run lint
   - 步骤：执行 npm run lint。
   - 预期：退出码 0。
   - 实际：206 项既有 CRLF/格式诊断，退出码非 0。

产物路径与 SHA256：
- src-tauri/target/release/bundle/msi/银河居所_0.1.0_x64_zh-CN.msi
  SHA256 9818555490A18DC663220EBB15157E967B9D82DEBF7EC32DADBEA58DB54507E4
- src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe
  SHA256 A7C3ED738CB891DAEA583B8A0CBAC77F2F4DE1D7FAB0F7BD8ADDE680BACB4FBC

证据文件：
- 截图：.tmp/windows-desktop-acceptance/screens/
- 构建日志：.tmp/windows-desktop-acceptance/build/desktop-build-full-after-msi-fix.log
- 测试日志：.tmp/windows-desktop-acceptance/test/npm-test-after-msi-fix.log、npm-lint-after-msi-fix.log、typecheck-final.log
- MSI 安装日志：.tmp/windows-desktop-acceptance/install/msi-install-elevated-20260824.log
- MSI 卸载日志：.tmp/windows-desktop-acceptance/install/msi-uninstall-elevated-20260824.log
- 启动日志：.tmp/windows-desktop-acceptance/install/production-lifecycle.log
- 进程/端口记录：.tmp/windows-desktop-acceptance/runtime/msi-process-port-record-20260824.json
- 数据目录文件列表：.tmp/windows-desktop-acceptance/runtime/msi-data-dir-file-list-20260824.json
- 导出包：.tmp/windows-desktop-acceptance/export/galaxy-home-msi-20260824.zip

最终结论：不通过
环境阻塞说明：此前 perMachine MSI 的 UAC 权限阻塞已解除，不再是当前阻塞。当前不通过原因是 npm test 与 lint 未满足门槛，并且仍有单列的未测试场景。
```

## 本轮运行时证据

### MSI 安装与启动

- 当前 Codex 进程仍为 Medium 完整性级别；通过用户人工确认 UAC 启动管理员 `msiexec`。
- 安装日志记录“成功地完成了安装”、状态 `0`、`MainEngineThread is returning 0`。
- 安装后产品版本为 `0.1.0`，安装目录与 Tauri app data 目录分离，桌面和开始菜单快捷方式均指向安装副本。
- 显式 `GALAXY_NODE_PATH` 指向 Node 24；实际子进程命令行使用该运行时，服务只监听 `127.0.0.1`。

### 业务与持久化

- 本地周回顾读出：完成 1 项待办、1 个习惯留下完成记录、项目推进到 45%。
- 正常退出后 5 秒内壳、目标 Node 和 4177-4199 监听均不存在；冷启动后上述状态仍在。
- 侧栏展开/收起、AI 侧栏打开/收起、设置、搜索和回收站均在 MSI 安装副本中实际操作。

### Node 与端口异常

- PATH 中移除 Node，仅保留有效 `GALAXY_NODE_PATH`：窗口正常打开，Node 24 监听 4177。
- `GALAXY_NODE_PATH` 无效且 PATH 无 Node：显示“无法定位满足 Node.js ≥24 的运行时”，没有 Node 或端口残留。
- 4177 被独立进程占用：占用进程保持，应用改用 4178；关闭应用后只清理自身 Node。
- 4177-4199 全占用：显示“本机 4177–4199 端口均不可用，请关闭占用进程后重试”；占用进程未被终止。
- 精确强制终止安装壳后，子 Node 和端口在 5 秒内自行清理。

### 导出、恢复与卸载

- 新导出 ZIP SHA256 为 `4CCD196FB5D1BDCB3482E1AA5C3D4F2DFDCD2A43DB042522FAA046B435D26139`，归档仅含 `galaxy-home.json`；敏感文件名和 API Key/Token 内容匹配均为 0。
- 导出后创建 `RESTORE-MARKER-20260824`，恢复前可搜索到；使用导出包恢复后该标记无匹配，原待办、习惯和项目仍各有一项命中。
- 恢复前自动生成 `restore-*.sqlite` 恢复点。
- 卸载日志记录“成功地完成了删除”、状态 `0`、`MainEngineThread is returning 0`。
- 卸载后安装目录、产品注册、Installer Products、桌面/开始菜单快捷方式、应用进程和端口均为空；Roaming app data、本地 WebView 数据及恢复点按实际行为保留。

## 未测试项

- 150% 显示缩放。
- Windows 系统通知、通知权限拒绝后的应用内降级。
- 错误或版本不兼容恢复包不会覆盖现有数据库。
- Tauri app data 目录无写权限、加载过程中关闭窗口、睡眠/唤醒。
- AI 配置、AI 服务超时或不可用。

## 结论

MSI 的权限环境阻塞已解除，安装、生产启动、业务操作、恢复、退出和卸载闭环均通过。当前发布门槛仍由全量测试和 lint 失败阻断，未测试项也必须在最终放行前补齐。
