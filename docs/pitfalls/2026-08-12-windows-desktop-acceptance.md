# Windows 桌面端验收踩坑

## 发现

用户给出的仓库路径是 `/Users/shika/Documents/银河居所`，当前 Windows 工作区实际解析为 `E:\Projects\galaxy-home`，Git Bash 路径为 `/e/Projects/galaxy-home`。

## 根因

用户路径来自类 Unix 环境描述，当前 Codex 桌面线程运行在 Windows 工作区。

## 处理

先通过 Git Bash 搜索并确认项目根目录，再执行 Git 和验收命令。

## 下次避免

新会话先解析真实盘符和 Git 根目录，不直接拼接用户提供的类 Unix 路径。

## npm 启动器版本陷阱

### 发现

Git Bash 中 `node` 已指向 Node 24，但直接运行 `npm ci` 的生命周期日志仍报告 Node 22.17.0。

### 根因

Windows Node 安装目录的 npm 启动脚本直接调用同目录的 `node.exe`，不跟随 PATH 中排在前面的便携 Node。

### 处理

使用 Node 24 可执行文件直接调用 `node_modules/npm/bin/npm-cli.js`，并在日志中记录 `process.execPath`。

### 下次避免

Windows 多 Node 环境验收时，同时检查 `node --version` 和 npm 生命周期中的 `process.version`；不要仅凭 PATH 顺序判断 npm 使用的 Node。

## 开发态启动命令陷阱

### 发现

第一次启动开发桌面端时把 npm CLI 写成了仓库内不存在的 `node_modules/npm/bin/npm-cli.js`，进程立即以 `MODULE_NOT_FOUND` 退出。

### 根因

npm 是随系统 Node 安装的 CLI，不是项目依赖；项目根目录没有 `node_modules/npm`。

### 处理

改用 Node 24 直接调用 `C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js`，并将启动日志和退出码单独保存。

### 下次避免

启动前先用 `npm root -g` 或 `Get-Command npm` 确认 npm CLI 实际路径，再构造跨 Node 版本的启动命令。

## Windows 安全弹窗与原生验收阻塞

### 发现

Tauri 开发窗口首次启动 Node 服务时出现 Windows 安全中心的 Node.js 防火墙访问提示。Computer Use 的点击被系统安全层拦截，无法继续输入原生窗口。

### 根因

这是 Windows 的外部安全/隐私提示，不属于应用 WebView 内容；自动化不能代替用户决定网络访问权限。

### 处理

保留遮挡状态截图，停止原生输入，不把浏览器开发态结果外推为 Tauri 原生验收通过。

### 下次避免

在启动桌面端前预先由测试者处理 Node.js 防火墙提示，并在操作时明确确认是否允许运行本地安装器和卸载程序；随后重新采集原生窗口、安装、退出和重启证据。

## WiX MSI 打包失败但 NSIS 成功

### 发现

`npm run desktop:build` 在 WiX `light.exe` 阶段失败，但 `tauri build --bundles nsis --no-sign` 成功生成 NSIS 安装器。

### 根因

当前环境的 WiX `light.exe` 未能完成 MSI 链接；本轮没有将 NSIS 专项成功误写成完整桌面打包命令通过。

### 处理

保留完整 desktop build 日志、NSIS 日志和安装器 SHA256，分别记录两个结果。

### 下次避免

同时执行完整打包命令和明确的 NSIS 专项命令，并按文档要求以完整命令退出码作为门槛。
