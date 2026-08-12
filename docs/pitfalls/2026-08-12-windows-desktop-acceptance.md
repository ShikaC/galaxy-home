# Windows 桌面端验收踩坑

## 发现

用户给出的仓库路径是 `/Users/shika/Documents/银河居所`，当前 Windows 工作区实际解析为 `E:\Projects\galaxy-home`，Git Bash 路径为 `/e/Projects/galaxy-home`。

## 根因

用户路径来自类 Unix 环境描述，当前 Codex 桌面线程运行在 Windows 工作区。

## 处理

先通过 Git Bash 搜索并确认项目根目录，再执行 Git 和验收命令。

## 下次避免

新会话先解析真实盘符和 Git 根目录，不直接拼接用户提供的类 Unix 路径。
