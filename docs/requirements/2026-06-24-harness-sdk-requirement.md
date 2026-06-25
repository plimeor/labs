---
date: 2026-06-24
status: completed
---

# @plimeor/harness SDK 需求

## 目标

创建新的 publishable workspace package `@plimeor/harness`，作为可复用的
library-only SDK，提供一个统一入口来驱动、集成和健康检查 CLI coding-agent
harness。第一批内置 adapter 覆盖 Codex CLI、Claude Code、Kiro CLI 和 pi。

## 范围

- 提供 `HarnessRegistry`、`HarnessAdapter`、`HarnessHandle`、process 和 extension 的公共 SDK 契约。
- SDK 可列出已注册 adapter，并可返回当前 detected harness 列表。
- 检测 harness CLI 是否安装，并识别实际 harness 身份。
- Health check 检查 CLI 是否安装，以及 CLI 是否能响应一次 adapter-owned smoke prompt。
- Codex 和 Claude 的 Health check 在 smoke prompt 前先检查本地是否能访问
  `google.com`；无法访问时返回网络不可达的失败信息，且不执行 smoke prompt。
- 通过 SDK/API 规划并执行某个 harness，并支持 text、JSONL、structured output
  和最终文本提取。
- Structured output 使用 `StandardSchemaV1` 表达 schema。
- Structured output 的解析或 schema 校验失败必须通过 run-time typed error 暴露。
- 提供 harness extension 机制；extension resources 按 Skills、MCP server 和 hooks 分组。
- Skills resource 是待安装 skill 的文件系统路径列表。
- `mcpServers` 是 server name 到 stdio server 配置的映射，server 配置包含
  `command`、可选 `args` 和可选 `env`。
- 调用方传入的 extension id 和 native resource name 承担 namespace 前缀；adapter
  不为业务资源发明额外命名空间。
- 每个 adapter 自行实现 user-scope extension 安装和卸载能力。
- 每个 adapter 暴露只读 extension compatibility check，用于校验资源类型和 hook event
  名称兼容性。
- 内置 adapter 随包发布，并可通过 import self-register。
- Kiro adapter 使用 `kiro-cli` 直接检测、运行、注册 MCP server，并在 user-scope
  hooks 目录安装 native hook 文件。

## 非目标

- 不提供 `bin` 或公开 CLI。
- 不把消费者业务逻辑放进 `@plimeor/harness`。
- 不使用 `plugin` 作为核心概念，避免与各 CLI 的 native plugin 概念冲突。
- 不承诺不同 CLI 的权限模型、hook lifecycle、event stream 或 native plugin 完全可移植。
- Project-scope extension 安装和卸载不属于本需求范围。
- Core 不提供通用配置 preview、dry-run 或 change-record API。
- 调用 adapter 的 `extensions.install` / `extensions.uninstall` 即表示调用方授权 adapter 执行对应 user-scope 配置变更。

## 约束

- Package 位于 `packages/harness`。
- README 只记录公开稳定行为；设计和计划记录放在 `docs/` 工作流文档中。
- 默认实现路径保持 lean；复杂抽象只有在 contract 和 ownership 稳定且有明确需求时进入范围。
- 所有配置安装、extension 安装、MCP server 注册、hooks 和 skills 写入都必须通过对应 adapter 的 install/uninstall 实现完成。
- Extension install 是 all-or-nothing：任何 unsupported 或 conflict 都阻止 native 写入。
- 卸载只能删除、还原或修改 adapter 能够证明属于该 extension 的内容；无法证明所有权时应产生 conflict 或 unsupported 结果。
- Adapter 直接写入配置文件时使用同目录 atomic rename；native CLI 写入保留目标 CLI 的
  写入语义。SDK install/uninstall 使用 adapter-local lock 串行化。
- 无法支持的 output mode 或 adapter-owned 参数必须在 plan 阶段通过 typed error 暴露。
- 请求 structured output 后产生的解析或 schema 校验失败必须在 run result 阶段通过 typed error 暴露。

## 验收标准

- SDK 可列出已注册 adapter。
- SDK 可通过 detectAll 返回当前 detected harness 列表。
- SDK 可对 adapter 做 detect 和 health check。
- SDK 可为 harness run 生成 command plan。
- SDK 可执行调用方审查后的 command plan，并暴露 stdout、stderr、events、result、kill 和 finalText。
- Extension install 和 uninstall 都由 adapter 暴露并实现。
- Extension compatibility check 可在不写文件、不检查 native config 的情况下返回兼容性问题。
- Unsupported 和 conflict 信息对调用方可见。
