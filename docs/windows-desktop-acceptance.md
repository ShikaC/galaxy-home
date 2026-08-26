# Windows 桌面端审查清单与验收标准

本文档用于 Windows 主机验收「银河居所」Tauri 桌面端。请在真实 Windows 主机上执行，并将完整结果、截图和日志回传。不要只根据源码或构建成功判断通过。

## 0. 2026-08-26 最终验收结论

本节记录当前 Windows 验收基线，后续在 macOS 上继续开发时不要把 Windows 证据误当作 macOS 验收结果。

### 0.1 结论

| 项目 | 结果 |
|---|---|
| Windows 桌面端最终结论 | 通过 |
| 代码验收基线 | `b030ba6`；后续文档提交不改变产品代码 |
| P0 / P1 / P2 | `0 / 0 / 0` |
| 测试主机 | Windows 11 Home zh-CN，OS Build 26200，x64 |
| 显示缩放 | 125% 原始环境；150% 定向复验通过 |
| Node / npm | Node.js 24.15.0 / npm 11.12.1 |
| Rust / Cargo | stable 1.95.0 |
| WebView2 | 151.0.4129.101 |

### 0.2 自动化门禁

| 命令或场景 | 结果 |
|---|---|
| `npm ci` | 通过；依赖审计无漏洞 |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过；216 个文件无诊断 |
| `npm test` | 通过；46 个文件，136 项通过，1 项 Windows 不适用测试跳过 |
| `npm run build` | 通过 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 通过；13 项 |
| 严格 Clippy | 通过；`-D warnings` |
| 完整 Playwright | 通过；compact/wide 共 30/30 |
| `npm run desktop:build -- --no-sign` | 通过；MSI 与 NSIS 均生成 |

### 0.3 关键行为结论

- 默认桌面开发端口 `127.0.0.1:5180` / API `3010` 通过；自定义 `VITE_PORT=5190` / API `3050` 通过。
- 生产服务只监听 `127.0.0.1`，`4177` 被占用时在 `4177-4199` 内回退；全部占用时显示明确错误。
- Node READY 协议会跳过 Fastify 普通日志，只接受目标端口和随机 capability；正常退出、stdin EOF 和强制结束均清理子服务与监听端口。
- Tauri 生产页面通过 URL fragment bootstrap 获取 HttpOnly、SameSite=Strict 会话 cookie；合法 cookie 的无 Origin 状态变更不会误报 403，攻击 Origin 仍返回 403 且不改数据。
- AI 上游 401/403 统一映射为 `AI_AUTH`，不会把供应商的 cyber-security policy 原文泄露给应用。
- Tauri Node 子进程清理继承的 `NODE_*`/`NPM_*` 环境变量，阻断 `NODE_OPTIONS` inspector 注入。
- 错误恢复包不会覆盖现有数据库，也不会提前创建恢复点；导出包不含 `secrets.json`、API Key 或 Token。
- 待办、习惯、项目、回顾、设置、搜索、回收站、提醒、AI 侧栏和 125%/150% 高 DPI 路径均已通过历史 Windows 实测。

### 0.4 最终产物

| 产物 | 路径 | SHA256 |
|---|---|---|
| MSI | `src-tauri/target/release/bundle/msi/银河居所_0.1.0_x64_zh-CN.msi` | `B1DCD3E30A9318D7473B94CF024D8C7CFE13FA5E718A157A92839FE3A1B08454` |
| NSIS | `src-tauri/target/release/bundle/nsis/银河居所_0.1.0_x64-setup.exe` | `D420A46B5AE766A333CE8CB47C07ACADFBCC48C316EF5370804B3770FD293BDD` |

### 0.5 证据索引

- 详细审查与命令记录：`docs/codex-log/2026-08-26-precommit-adversarial-review.md`
- 当前任务快照：`docs/current-task.md`
- 最终 Playwright：`.tmp/manual-qa-final-20260826/playwright-final-rerun.log`、`playwright-final-rerun.exit`
- 最终 Node 门禁：`.tmp/manual-qa-final-20260826/final-*-node24.log`、同名 `.exit`
- 最终桌面构建：`.tmp/manual-qa-final-20260826/desktop-build-final-main.log`、`desktop-build-final-main.exit`
- 生产父子进程、Origin、capability、恢复和清理证据：`.tmp/manual-qa-final-20260826/`

本节中的真实 token、API Key、私人数据均未写入；证据目录中的 capability 只记录长度或已脱敏。

## 1. 本轮范围

本轮目标是确认 Windows 上的 Tauri 轻壳可安装、可启动、可使用、可退出，且本地数据不会丢失。

必须覆盖：

- 开发态桌面端启动；
- Windows 安装包构建与安装；
- 首次启动、重启、退出和异常恢复；
- 本机 Node 服务启动、端口选择和进程清理；
- `%APPDATA%` 数据目录与 SQLite 持久化；
- 首页、待办、习惯、项目、回顾、设置、搜索、回收站；
- 侧栏收起、AI 侧栏展开/收起、窗口缩放和中文显示；
- 应用内提醒与 Windows 系统通知镜像；
- 无 AI 配置时的可用性降级；
- 导出/恢复数据及密钥不进入导出包。

## 2. 明确不作为本轮通过条件

以下事项当前不在本轮交付范围，必须单独标记为“未验收”，不能写成通过：

- 代码签名、SmartScreen 信任和应用商店上架；
- 自动更新；
- 内嵌 Node 运行时；当前桌面端仍要求 Windows 主机安装 Node.js `>=24`；
- 应用关闭或 Windows 关机后的后台系统通知；当前只承诺应用运行期间的通知，以及下次启动时补显错过提醒；
- 手机专门布局、PWA、离线缓存和本地大模型。

## 3. 实现事实与验收假设

请按以下事实检查，不要套用 macOS 路径或端口假设：

- 桌面开发 Web 默认监听 `127.0.0.1:5180`，API 默认监听 `127.0.0.1:3010`；
- 桌面生产壳优先选择 `127.0.0.1:4177`，若被占用则在 `4177–4199` 中选择空闲端口；
- 生产壳会拉起本机 `node.exe`，查找顺序包括 `GALAXY_NODE_PATH` 和桌面进程可见的 `PATH`；
- 开发态 Windows 数据目录默认是 `%APPDATA%\app.galaxyhome.desktop`；生产 Tauri 壳通过 Tauri app data 目录传给 Node；
- 可用环境变量 `GALAXY_DATA_DIR` 指定独立测试数据目录；建议验收使用一个全新的临时目录，不要直接操作真实个人数据；
- 预期数据文件包括 `galaxy-home.sqlite`、`backups\`，以及配置 AI/转写密钥后才可能出现的 `secrets.json`；
- Windows 安装包预期包含 MSI 或 NSIS EXE，具体文件名以 `src-tauri\target\release\bundle\` 实际产物为准。

## 4. 测试环境记录

执行前先填写：

| 项目 | 实际值 |
|---|---|
| Windows 版本与 OS Build | 例如 Windows 11 24H2 / `winver` |
| 系统架构 | x64 / arm64 |
| CPU、内存 |  |
| 显示缩放 | 100% / 125% / 150% |
| Node.js 版本 | `node --version`，必须 `>=24` |
| npm 版本 | `npm --version` |
| Rust 版本 | `rustc --version`，stable |
| Cargo 版本 | `cargo --version` |
| WebView2 Runtime | 已安装/版本/未确认 |
| Git 提交 | `git rev-parse HEAD` |
| 测试数据目录 | 建议使用独立临时目录 |
| 测试日期与时区 |  |

建议先确认：

```powershell
winver
node --version
npm --version
rustc --version
cargo --version
git rev-parse HEAD
```

环境不满足 Node、Rust 或 WebView2 要求时，不要将后续失败归因于产品代码；请先记录为环境阻塞。

## 5. 构建前检查

在仓库根目录执行：

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

验收标准：

- 每条命令退出码为 `0`；
- 无 TypeScript 编译错误；
- 无 Lint 错误；
- 单元与集成测试全部通过；
- 前端和服务端生产构建均生成；
- 不允许用跳过测试、忽略错误或手工删日志的方式判绿。

## 6. 开发态桌面端验收

### 6.1 启动与服务

在 PowerShell 中执行：

```powershell
$env:GALAXY_DATA_DIR = Join-Path $env:TEMP "galaxy-home-windows-dev-qa"
npm run desktop
```

检查：

- Tauri 窗口可以打开；
- 窗口标题为“银河居所”；
- 不出现持续白屏、黑屏、崩溃或未处理错误；
- 首屏最终显示首页或首次引导；
- Web/API 服务均只监听 `127.0.0.1`；
- 开发日志能看出 Web `5180` 和 API `3010` 已就绪；
- 关闭开发桌面端后，Vite、Node、Rust/Tauri 子进程都退出；
- 重新启动不会因为残留进程或端口占用失败。

用 PowerShell 记录监听情况：

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in (@(3010, 5180) + (4177..4199)) } |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

### 6.2 开发态端口边界

至少验证一次端口冲突：

1. 使用专用临时监听器占用 `5180` 或 `3010`；
2. 执行 `npm run desktop`；
3. 确认应用给出明确端口占用错误，并提示设置 `VITE_PORT`、`API_PORT` 或 `VITE_API_PORT`；
4. 关闭临时监听器；
5. 再次启动并确认恢复正常。

开发态端口被占用时，明确报错是预期行为；生产态端口回退到 `4177–4199` 是另一条必须单独验证的路径。

## 7. 生产打包与安装验收

### 7.1 打包

执行：

```powershell
npm run desktop:build
```

验收标准：

- 命令退出码为 `0`；
- `dist\client\index.html` 和 `dist\server\index.js` 存在；
- `src-tauri\resources\app\dist\` 存在；
- `src-tauri\resources\app\db\` 存在；
- `src-tauri\resources\app\package.json` 和生产依赖已准备；
- `src-tauri\target\release\bundle\` 下产生 Windows 安装产物；
- 安装包图标存在且不是默认空白图标；
- 构建过程没有依赖 macOS 专属脚本或路径。

记录产物哈希：

```powershell
Get-ChildItem .\src-tauri\target\release\bundle -Recurse -File |
  Get-FileHash -Algorithm SHA256
```

### 7.2 安装与卸载

使用生成的 MSI 或 NSIS EXE 安装到测试机：

- 安装过程无阻塞性错误；
- 开始菜单/桌面入口可找到应用；
- 应用名称、图标、版本号为 `0.1.0`；
- 安装目录与用户数据目录分离；
- 应用不要求向安装目录写入 SQLite 或备份；
- 卸载程序可以启动并完成卸载；
- 卸载后是否保留用户数据要记录实际行为，不要擅自判定为通过或失败；当前项目尚未定义数据删除策略；
- 当前不验收签名、SmartScreen、自动更新。

## 8. 生产包启动与进程验收

### 8.1 首次启动

使用全新的 Windows 测试用户配置启动安装后的应用。生产 Tauri 壳会把数据目录解析为 Tauri 的 app data 目录，并由壳进程传给 Node；本轮不要假设设置 `GALAXY_DATA_DIR` 可以覆盖这个路径。默认位置见第 9 节。

如果必须复用当前 Windows 用户，请先记录并备份现有 `%APPDATA%\app.galaxyhome.desktop`，再在独立测试窗口执行。不要直接删除或覆盖真实数据。

必须检查：

- 首次启动不崩溃；
- 不出现永久空白窗口；
- 服务就绪后窗口可见，首屏内容完整；
- Node.js `>=24` 不在交互式终端启动时仍能被桌面壳发现；
- 若 Node 不在 PATH，设置 `GALAXY_NODE_PATH` 后能启动；
- 若 Node 完全不可用，应用应给出可理解的启动错误，而不是静默退出；
- 生产服务监听在 `127.0.0.1`；
- 服务端口在 `4177–4199` 内；
- 端口 `4177` 被占用时，应用能使用下一个可用端口启动；
- 应用退出后对应 `node.exe` 子进程退出，不留下孤儿服务；
- 连续冷启动、退出、再次启动至少执行 3 次，结果一致。

建议记录：

- 从双击 EXE 到首屏可操作的秒数；
- 应用 PID、Node 子 PID、实际 Web 端口；
- 启动失败时的 Windows 事件查看器记录或应用日志；
- 退出后 5 秒内的进程与端口状态。

### 8.2 端口回退

用一个专用临时进程占用 `4177`，然后启动生产包：

- 应用不得覆盖或杀掉该临时进程；
- 应用应选择 `4178–4199` 中的空闲端口；
- 窗口仍应加载并可操作；
- 关闭应用后只清理自己的 Node 服务；
- `4177` 的临时监听器保持存活直到测试结束，再由测试者清理。

如果 `4177–4199` 全部被占用，预期是给出明确错误“端口范围不可用”，而不是打开错误页面或静默退出。

## 9. 数据目录与持久化验收

### 9.1 默认路径

默认检查路径：

```powershell
$dataDir = Join-Path $env:APPDATA "app.galaxyhome.desktop"
Get-ChildItem $dataDir -Force
```

必须确认：

- 目录可创建、可写入；
- `galaxy-home.sqlite` 出现并能增长；
- 数据不写入 `Program Files` 安装目录；
- 数据不写入仓库根目录；
- 关闭并重新打开应用后，业务数据仍存在；
- 应用崩溃或强制关闭后，重新打开不会覆盖已有数据；
- `backups\` 可生成或在有备份动作后出现；
- 配置 AI/转写后，`secrets.json` 存在于数据目录且不进入导出包；
- 测试报告和截图不得包含 API Key、Token 或完整私密数据。

### 9.2 数据回归场景

使用测试数据完成以下操作，再重启应用核对：

1. 创建一条待办，确认标题、备注和状态保留；
2. 创建一个习惯，完成一次打卡，确认统计保留；
3. 创建一个项目，推进当前阶段或填写反馈，确认状态保留；
4. 写一条今日收获，确认回顾页可见；
5. 修改工作区名称、时区或 AI 称呼，确认刷新后保留；
6. 将一条内容移入回收站并恢复，确认恢复后回到原业务视图；
7. 退出应用，重新启动，重复检查以上数据。

## 10. 核心业务路径

每条路径都要记录“通过/失败/未测试”，并附至少一张关键状态截图。

### P0 黄金路径 A：捕捉到完成

1. 首次引导完成工作区命名；
2. 从首页或任意页面创建一条随手记；
3. 在收集箱找到该条目；
4. 将它加入今日；
5. 将它标为完成；
6. 刷新窗口；
7. 确认完成状态、标题和日期仍正确；
8. 在回顾页确认相关记录可见。

### P0 黄金路径 B：习惯

1. 创建打卡型习惯；
2. 完成今日打卡；
3. 撤销最近一次记录；
4. 再次打卡；
5. 创建或检查计数型习惯；
6. 修改目标或执行次数；
7. 刷新并确认统计一致；
8. 如测试时跨时区，记录系统时区和应用时区。

### P0 黄金路径 C：项目手动推进

1. 创建一个周期项目；
2. 查看当前阶段、当前任务和下一步；
3. 不配置 AI 时手动推进；
4. 提交阶段反馈；
5. 确认项目状态更新；
6. 刷新并确认内容保留。

### P1 AI 可选路径

未配置 AI 时必须验证：

- AI 侧栏显示“未配置”或等价可理解状态；
- 待办、习惯、项目手动推进和回顾仍可用；
- 不出现无限 loading；
- 不因为 AI 不可用而阻塞其他页面。

如果 Windows 主机配置了测试用 AI 服务，再额外验证：

- AI 侧栏可以打开和收起；
- 保守/开放模式切换可见；
- 需要确认的动作不会绕过确认；
- 操作记录可查看并撤销；
- AI 服务失败、超时或返回非法内容时，界面可恢复；
- 报告中不得上传或粘贴 API Key。

## 11. 窗口、响应式与中文视觉验收

桌面壳窗口配置的最小尺寸是 `960×640`。至少检查以下尺寸：

- 默认窗口：`1280×800`；
- 最小窗口：`960×640`；
- Windows 显示缩放：100%；
- Windows 显示缩放：125% 或 150%。

每个尺寸检查：

- 左侧导航展开、收起和恢复；
- 收起后为窄轨，不显示溢出的导航文字；
- AI 侧栏打开后是独立整列面板；
- AI 标题栏显示“收起 星伴”或当前昵称，不使用面板内误导性的关闭符号；
- 主内容、AI 面板、滚动条之间没有横向溢出；
- 首页、待办、项目、习惯、回顾、设置标题和副标题不被截断；
- 中文短语不出现孤立的“的”“你”“加”等单字断行；
- 按钮文字、图标、输入框和表格不互相覆盖；
- 弹窗打开后焦点可进入，按 `Escape` 可关闭；
- 窗口最大化、还原、拖动调整大小后布局不崩溃；
- WebView2 缩放下没有字体变成方框或图标丢失。

截图至少包含：

- 默认窗口首页；
- 最小窗口首页；
- 最小窗口打开 AI 侧栏；
- 最小窗口回顾页；
- 125% 或 150% 缩放下的设置页或待办页。

## 12. 搜索、弹窗与键盘操作

- 全局搜索可打开、输入中文、显示结果或明确空状态；
- 搜索弹窗可用 `Escape` 关闭；
- 新建待办、项目、习惯、分类对话框能打开和关闭；
- 对话框不会让后面的页面控件抢焦点；
- `Tab` 顺序可理解，当前焦点可见；
- 图标按钮有可理解的辅助名称或 tooltip；
- 日期控件在 Windows 本地格式下可操作；
- 复制、编辑、归档、回收站恢复等菜单不被窗口边缘裁切。

## 13. 提醒与系统通知

### 应用内提醒

- 有 due 提醒时，窗口顶部显示提醒横幅；
- 768 网页视口之外，Windows 桌面最小尺寸下横幅也不溢出；
- “30 分钟后”操作可用；
- “今天不再提醒”操作可用；
- 关闭并重新打开应用后，错过的提醒会按当前实现补显；
- 非晨间提醒详情不会被错误套用晨间语义分句样式。

### Windows 系统通知

- 应用运行期间，due 提醒可镜像为 Windows 系统通知；
- 首次出现通知权限时，记录用户是否允许；
- 用户拒绝通知时，应用内横幅仍可用；
- 通知标题和内容不包含错误编码或乱码；
- 不把“应用关闭后仍能后台调度通知”作为本轮失败条件，因为该能力明确未实现；
- 不上传通知内容或私人数据到第三方服务。

## 14. 导出、恢复与隐私边界

使用包含测试数据的工作区：

1. 执行手动导出；
2. 用压缩包查看工具列出文件；
3. 确认业务数据可读且结构完整；
4. 确认不包含 `secrets.json`、API Key、Token 或转写密钥；
5. 修改一条测试数据后执行恢复；
6. 确认恢复结果符合产品定义；
7. 用格式错误或版本不兼容的测试包尝试导入；
8. 确认错误导入不会覆盖现有数据库。

## 15. 异常与恢复测试

以下每项至少执行一次，记录现象：

- Node 不在 PATH，但设置 `GALAXY_NODE_PATH` 指向有效 `node.exe`；
- Node 路径无效；
- Web 端口被占用；
- API 端口被占用；
- 生产 `4177` 被占用；
- `4177–4199` 全部被占用；
- 数据目录不存在但父目录可写；
- 数据目录无写权限；
- 应用加载过程中关闭窗口；
- 服务启动后强制结束窗口，再次打开；
- Windows 睡眠/唤醒后返回应用；
- AI 服务不可用或超时；
- 通知权限被拒绝。

通过标准不是“所有异常都能继续使用”，而是：错误可理解、不会静默丢数据、不会残留孤儿服务、恢复路径明确。

## 16. 严重度定义

### P0：阻塞发布

任一项出现即不通过：

- 安装包无法构建或无法安装；
- 首次启动崩溃、永久白屏或静默退出；
- Node 服务无法启动且没有可理解错误；
- 生产包写错数据目录、无法写入或造成数据丢失；
- 退出后残留持续运行的 Node 服务并影响后续启动；
- 核心黄金路径无法完成；
- API 对外监听到 `0.0.0.0` 或其他非本机地址；
- Windows 125%/150% 下出现严重遮挡、不可操作或文字完全不可读；
- 导入错误覆盖现有数据库；
- 导出包包含 API Key 或其他密钥。

### P1：修复后再收口

- 最小窗口存在可见裁切，但核心操作仍可完成；
- 端口回退偶发失败；
- 系统通知失败但应用内提醒仍可用；
- 搜索、弹窗、键盘焦点等次要路径阻塞；
- AI 服务失败时错误反馈不清晰；
- 高 DPI 下出现明显但可绕过的布局问题；
- 多次冷启动耗时异常但最终可用。

### P2：记录后排期

- 文案、间距、图标或 tooltip 的轻微视觉问题；
- 不影响使用的安装入口或默认图标细节；
- 非本轮范围的签名、自动更新、托盘、开机自启等能力。

## 17. 最终验收门槛

Windows 主机只有同时满足以下条件才能写“通过”：

- P0 问题为 `0`；
- P1 问题为 `0`，或已得到项目负责人明确豁免；
- 构建、安装、冷启动、退出、重启和数据持久化均有实测证据；
- P0 黄金路径 A、B、C 均通过；
- 默认窗口和最小窗口均通过；
- 至少一种高 DPI 缩放通过；
- `npm test`、`npm run build`、`npm run desktop:build` 退出码均为 `0`；
- 产物路径、哈希、OS 版本、Node/Rust/WebView2 版本均有记录；
- 所有“未测试”项目已单独列出，不能混入通过项；
- 报告不包含密钥、令牌、真实私人数据或完整本机路径中的敏感信息。

## 18. 回传报告模板

请复制以下模板填写：

```text
项目：银河居所 Windows 桌面端
测试日期：
测试主机：
Windows 版本 / OS Build：
架构：
显示缩放：
Node：
Rust：
WebView2：
Git 提交：

构建：PASS / FAIL
安装：PASS / FAIL
开发态启动：PASS / FAIL
生产包冷启动：PASS / FAIL
生产端口回退：PASS / FAIL / 未测试
退出进程清理：PASS / FAIL
数据目录与持久化：PASS / FAIL
黄金路径 A：PASS / FAIL
黄金路径 B：PASS / FAIL
黄金路径 C：PASS / FAIL
AI 未配置降级：PASS / FAIL
AI 配置路径：PASS / FAIL / 未测试
搜索与弹窗：PASS / FAIL
高 DPI：PASS / FAIL
系统通知：PASS / FAIL / 未测试
导出恢复与密钥隔离：PASS / FAIL

P0 数量：
P1 数量：
P2 数量：

失败项与复现步骤：
1.

产物路径与 SHA256：

证据文件：
- 截图：
- 构建日志：
- 启动日志：
- 进程/端口记录：
- 数据目录文件列表：

最终结论：通过 / 不通过 / 环境阻塞
环境阻塞说明：
```

## 19. 发现问题时的记录要求

每个问题至少包含：

- 严重度：P0/P1/P2；
- Windows 版本、架构、缩放比例；
- Git 提交和安装包文件名；
- 前置数据目录是否全新；
- 精确复现步骤；
- 预期结果与实际结果；
- 截图或日志；
- 是否每次都能复现；
- 是否只发生在开发态、生产态或两者都有。

发现问题后不要直接删除数据库、修改安装目录或重装覆盖现场。先保留证据，再使用新的独立测试数据目录复现。

## 20. macOS 后续开发交接

Windows 验收通过后，macOS 继续开发应从 GitHub 拉取代码基线，重新安装依赖并单独验证 macOS 行为。不要直接复制 Windows 的 `node_modules`、`dist`、`target` 或安装包。

### 20.1 开始工作

```bash
git fetch origin
git switch main
git pull --ff-only origin main
node --version
npm --version
rustc --version
cargo --version
npm ci
```

Node.js 仍要求 `>=24`。macOS 不需要 Windows WebView2，但 Tauri WebKit 运行环境、Xcode Command Line Tools 和 Rust stable 需要单独确认。

### 20.2 macOS 基础门禁

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run desktop
```

完成开发态检查后再按 macOS 实际打包方式运行构建。签名、公证、DMG、自动更新和系统权限不属于本 Windows 验收结论，必须建立 macOS 专用证据。

### 20.3 macOS 专项检查

- 数据目录是否落在 macOS 预期的 Application Support 路径，且升级/卸载不误删业务数据；
- `GALAXY_NODE_PATH`、PATH 和 Node 24 解析是否适配 macOS 安装方式；
- `127.0.0.1` 监听、端口冲突、stdin EOF、强制退出和重启后的子进程清理；
- macOS Retina/DPR 下首页、最小窗口、长中文文本、弹窗和 AI 侧栏布局；
- macOS 通知权限允许/拒绝后的应用内降级；
- URL fragment capability bootstrap、HttpOnly cookie 和 Origin 行为；
- 导出包密钥隔离、错误恢复包数据不变性；
- Intel/Apple Silicon 目标、代码签名、公证和首次打开安全提示。

Mac 端新增或修改行为后，应在验收回传中记录：macOS 版本、架构、Node/Rust 版本、Git commit、命令退出码、产物哈希、数据目录、截图和未测试事项。Windows 的“通过”不能替代这些 macOS 证据。
