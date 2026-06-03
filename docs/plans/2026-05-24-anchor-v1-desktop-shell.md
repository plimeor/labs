# 计划：Anchor V1 Desktop Shell

创建日期：2026-05-24

## 目标

建立 Anchor 的桌面应用外壳，让后续模块有稳定运行入口、路由结构、Tauri command bridge 和基础 UI 框架。

这个模块只负责 shell，不拥有笔记语义、索引语义或 agent 写入语义。所有业务读写都通过后续 `Notes Operation Core` 暴露的 Tauri commands 进入。

## 技术栈映射

- Tauri v2：桌面窗口、菜单、文件选择、应用数据目录、Rust command bridge。
- Rust：应用状态、错误类型、command handler、跨模块服务注入。
- SolidJS：应用视图和状态边界。
- Tailwind CSS：基础布局、颜色、spacing、响应式密度。
- Tiptap：后续 editor 模块的编辑器基础，shell 只预留承载区域。
- TanStack Solid Router：路由和深链。
- TanStack Solid Query：Tauri command query / mutation cache。
- TanStack Solid Virtual：note list、search result 和 task timeline 的长列表基础。
- Vite v8：前端开发和构建。

## 范围

包含：

- 初始化 Tauri v2 + SolidJS + Vite v8 应用结构。
- 建立主窗口、应用菜单和基础 settings storage。
- 建立 production build / packaged app 的最小交付路径。
- 建立全局 shell layout：sidebar、main panel、right inspector。
- 建立 note route 的 editor host 区域，支持 Bear-like single-surface editor 和 right inspector 同屏。
- 建立路由：
  - `/today`
  - `/notes/:noteId`
  - `/search`
  - `/graph`
  - `/objects`
  - `/agents`
  - `/settings`
- 建立 Tauri command client wrapper，统一处理 request id、loading、error 和 retry。
- 建立 app-level error boundary 和 recoverable error toast。
- 建立 vault 未打开、vault 已打开、projection rebuilding、offline agent unavailable 等基础状态面。
- 建立可复用 unsaved-state route guard shell contract，供 editor 模块接入。

不包含：

- Markdown 文件 schema。
- SQLite projection shape。
- Note CRUD 语义。
- Search / Graph 实现。
- Markdown editor 实现。
- Agent provider、OAuth、ACP 连接。
- 复杂视觉设计系统。

## 数据边界

Desktop shell 不直接访问文件系统、SQLite 或 provider credentials。

前端只通过 Tauri commands 与 Rust 后端交互：

- query commands 返回可序列化 DTO。
- mutation commands 返回 result DTO 或 typed error。
- mutation 成功后通过 TanStack Query invalidation 刷新相关 query。

Rust shell 层只保存应用状态引用：

- current vault pointer。
- service registry。
- app settings。
- active long-running job handles。

Vault 内容、索引、operation records 和 agent task records 属于后续模块。

## 路由结构

V1 路由按产品对象组织，而不是按技术模块组织：

- `/today`：打开当天 Journal。
- `/notes/:noteId`：打开普通 Note、Journal、Reference 或 Proposal。
- `/search`：搜索和筛选结果。
- `/graph`：当前 scope 的 Local Graph。
- `/objects`：Object Type 和 Properties 浏览。
- `/agents`：Agent Spec、task timeline 和 approval surface。
- `/settings`：vault、appearance、agent feature flags 和 diagnostics。

这些路由可以在 shell 阶段先落占位视图，但不能伪造未实现的能力。

## 工作序列

1. 创建 Tauri v2 + SolidJS + Vite v8 基础应用。
2. 建立 Tailwind CSS 配置和全局样式入口。
3. 建立 TanStack Solid Router 的 route tree。
4. 建立 Tauri command client wrapper 和 typed error display。
5. 建立 shell layout：sidebar、main area、right inspector。
6. 建立 note route editor host：loading、empty、read-only、error、source-view-capable 和 inspector-open 状态。
7. 建立 vault state 面：未打开、打开中、已打开、错误。
8. 建立 query / mutation cache 约定：query keys、mutation invalidation、long-running job polling。
9. 接入最小 diagnostics route，展示 app version、platform、current vault 和 backend health。
10. 建立 packaged app smoke path，确认非 dev server 环境能打开主窗口和 vault picker。

## 接受标准

- 应用能通过 Tauri dev 启动并打开主窗口。
- 应用能通过 production build 或 release candidate runbook 启动主窗口。
- route navigation 不刷新窗口，不丢失 shell state。
- 未打开 vault 时，笔记相关 route 显示明确 empty state。
- `/notes/:noteId` 有稳定 editor host 和 right inspector 布局，后续 single-surface editor 接入时不需要改变 route contract。
- route navigation 可以被 editor 模块的 unsaved-state guard 拦截。
- Tauri command error 能以 typed error 显示，不暴露 Rust panic 文本作为用户文案。
- query / mutation wrapper 能支撑后续模块复用。
- shell 不直接读写 Markdown、SQLite 或 provider secrets。

## 验证方式

实现阶段验证：

- `bun run check`
- `bun run lint`
- Tauri dev smoke：启动桌面应用、打开主窗口、切换 `/today`、`/notes/:noteId`、`/search`、`/graph`、`/objects`、`/agents` 和 `/settings`。
- Packaged app smoke：从 production build 或 release candidate runbook 启动应用，打开 diagnostics route 和 vault picker。
- Route smoke：未打开 vault 时 note route 显示 empty state；已打开 vault 的 mock state 能进入 editor host。
- Error smoke：模拟 typed Tauri error，确认 UI 显示用户文案而不是 Rust panic 文本。
- Layout smoke：note route 是单主编辑区 + right inspector，不出现默认分屏 preview pane。

## 风险与规避

- Shell 过早绑定业务数据结构会增加后续重构成本。规避：shell 只定义 route 和 command client，不定义 note schema。
- 前端状态绕过 Operation Core 会破坏不变量。规避：所有业务 mutation 都走 Tauri command mutation wrapper。
- Agent 和 editor route 过早做成完整 UI 会扩大范围。规避：先建立稳定 surface 和空状态，具体交互在对应模块落地。
- Shell 布局如果默认做成分屏 preview，会和 V1 编辑体感冲突。规避：shell 只提供单主编辑区和 inspector，不内置 preview pane。

## 暂停条件

遇到以下情况暂停确认：

- 需要引入超出核心技术栈的大型 UI framework。
- 需要把 provider credentials 存入前端或 Markdown 资产。
- Tauri packaging、signing、notarization 或平台权限要求超出本地 demo release candidate。

## 停止条件

本模块完成时应停在这个状态：

- 桌面应用可运行。
- production build 或 release candidate runbook 可启动主窗口。
- 路由、布局、command wrapper 和错误面可供后续模块复用。
- 没有引入笔记、索引或 agent 的业务写入逻辑。
