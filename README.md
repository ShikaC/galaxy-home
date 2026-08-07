# 银河居所

本地优先的个人空间：随手记、待办、习惯、周期项目、回顾与 AI 助手。仅监听本机，无账号与云同步。

## 要求

- Node.js **≥ 24**
- 本机浏览器访问（默认不暴露到局域网）

## 启动

```bash
npm install
npm run dev
```

开发地址：<http://127.0.0.1:5173>（API 默认 `:3001`）。

生产：

```bash
npm run build
npm start
```

生产地址：<http://127.0.0.1:4173>。

## 数据目录

默认 `./data/`（可用环境变量 `GALAXY_DATA_DIR` 覆盖）：

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

完整需求见 [docs/项目说明书.md](docs/项目说明书.md)。验收勾选见 [docs/acceptance-21.md](docs/acceptance-21.md)。自用摩擦记录见 [docs/dogfood-friction.md](docs/dogfood-friction.md)。
