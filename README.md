# Galaxy · 个人工作空间

AI 驱动、本地优先的个人工作空间。把想法收集、每日任务、长期项目和知识笔记放在同一张工作台上，通过带上下文的 AI 对话推进实际工作。仅监听本机，无账号与云同步。

现有本地数据可直接升级，启动时自动执行增量数据库迁移。

## 这个版本能做什么

- **每日工作台**：今日计划／收集箱／已完成、项目概览、近期笔记、习惯与 AI 工作入口。所有内容来自实际本地数据。
- **知识笔记**：创建、编辑、手动保存、置顶、归档恢复和 Markdown 导出。离开未保存的笔记会提示。笔记纳入全局搜索、AI 开放模式上下文与数据备份。
- **专注计时**：25／50 分钟、开始／暂停／重置和专注模式。倒计时按结束时间计算，切换页面或刷新后仍可恢复；状态保存在当前浏览器的本地存储中，不进入数据库备份。
- **响应式空间**：桌面固定侧栏、平板图标导航、手机顶部导航，AI 可从任意页面展开。首次进入可先手动使用，不插入教学示例。
- **收集箱与待办**：统一条目模型；自定义单层分类；多分类归属；完成 / 归档；今日主位 / 次要 / 重点安排。
- **随手记**：任意页快速记下；可配置语音转写（未配置时文本仍可用）。
- **周期项目**：创建目标与周期；按阶段渐进拆解；项目页推进与反馈；AI 可协助当前阶段（也可纯手动）。
- **习惯**：打卡型与计数型；每日 / 每周频率、休息日；今日完成、超额、撤销与请假修正。
- **回顾**：直接记录每日收获，按日期或关键词检索，再用本地数据或 AI 生成周回顾；建议可转成待办 / 习惯 / 项目。
- **AI 助手（可选）**：规划今日、拆解目标、梳理知识；围绕任务或笔记准备上下文对话；长期记忆与可追溯的实际操作。需要在设置中连接可用的模型服务。快捷入口和笔记工具会先填入草稿，由你发送。
  - **保守模式**：可提议非删除操作，须你确认后执行；不支持删除 / 归档。
  - **开放模式**：多数操作立即执行；**移入回收站仍须确认**；归档立即生效。
  - 未配置或服务不可用时，其余功能照常使用。
- **搜索、回收站、操作记录**：全局搜索；软删除进回收站可恢复；AI 自动操作可查看与撤销。
- **提醒**：应用运行期间通知；桌面壳可将 due 提醒镜像为系统通知；关闭后错过的提醒会在下次启动补显。
- **桌面壳（可选）**：Tauri 包装本机 Web + API；数据目录默认在用户 Application Support。
- **设置与数据**：工作区命名、时区、AI 权限与密钥（存本机 `secrets.json`）；手动导出 / 恢复业务数据（**密钥不进入导出包**）；本地自动备份。

## 要求

- Node.js **≥ 24**
- 本机浏览器访问（默认不暴露到局域网）
- 桌面壳另需：**Rust stable**（`rustup`）与本机 Node（暂不内嵌）

## 启动

```bash
npm install
npm run dev
```

开发地址：<http://127.0.0.1:5173>（API 默认 `:3001`）。

生产（浏览器）：

```bash
npm run build
npm start
```

生产地址：<http://127.0.0.1:4173>。

桌面壳（Tauri）：

```bash
npm run desktop          # 开发：窗口 + Vite/API（默认 Web :5180 / API :3010，可与浏览器 :5173 并行）
npm run desktop:build    # 打包：构建前端/服务资源后产出安装包
```

桌面生产窗口加载本机服务（优先 `http://127.0.0.1:4177`，端口占用时自动顺延至 `4199`），由壳进程拉起 Node。

## 数据目录

浏览器开发默认 `./data/`；**桌面壳**默认用户数据目录（macOS：`~/Library/Application Support/app.galaxyhome.desktop`）。均可用环境变量 `GALAXY_DATA_DIR` 覆盖：

| 路径 | 内容 |
|------|------|
| `galaxy-home.sqlite` | 业务数据库 |
| `secrets.json` | AI / 转写密钥（不进入导出包） |
| `backups/` | 自动备份 |

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm test` | 单元与集成测试 |
| `npm run test:e2e` | Playwright 端到端 |
| `npm run typecheck` | TypeScript 检查 |
| `npm run desktop` | Tauri 桌面开发 |
| `npm run desktop:build` | Tauri 桌面打包 |

新版设计见 [DESIGN.md](DESIGN.md)。历史需求归档见 [docs/项目说明书.md](docs/项目说明书.md)。验收勾选见 [docs/acceptance-21.md](docs/acceptance-21.md)。自用摩擦记录见 [docs/dogfood-friction.md](docs/dogfood-friction.md)。侧栏 AI 口语剧本见 [docs/ai-oral-script.md](docs/ai-oral-script.md)。桌面形态：Tauri 轻壳第一刀已落地（[docs/decisions/desktop-packaging.md](docs/decisions/desktop-packaging.md)）。本地模型暂不接入（[docs/decisions/local-model.md](docs/decisions/local-model.md)）。

## 工作空间验收

`npm run test:e2e -- tests/e2e/workspace.spec.ts --project=desktop-wide` 验证笔记完整生命周期、未保存保护、专注恢复、任务与 AI 上下文入口、每日收获与本地周回顾，以及 375／768／1440 宽度的全部主页面。截图保存在 `.omo/evidence/workspace/`。

快捷键：`⌘ / Ctrl + K` 随手记，`⌘ / Ctrl + Shift + K` 全局搜索，`⌘ / Ctrl + J` 展开或收起 AI。
