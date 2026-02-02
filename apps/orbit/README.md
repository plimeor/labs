# Orbit

个人 AI 助手和 Agent 工作平台。

## 技术栈

**前端**
- React 18+
- Vite 8
- Tailwind CSS 4
- react-router
- lucide-react

**后端**
- Elysia
- Bun
- Drizzle ORM
- SQLite
- PM2

## 开发

```bash
# 安装依赖
bun install

# 启动开发环境
bun dev

# 独立启动
bun dev:web      # 前端 (http://localhost:3000)
bun dev:server   # 后端 (http://localhost:3001)
```

## 数据库

```bash
bun db:generate  # 生成 migration
bun db:migrate   # 执行 migration
bun db:studio    # 打开 Drizzle Studio
```

## 部署

```bash
bun build
bun daemon:start
```
