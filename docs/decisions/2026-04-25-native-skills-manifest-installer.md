# 采用原生 skills manifest 安装器

## 状态

已接受

## 日期

2026-04-25

## 背景

`packages/skills` 要解决的是重复安装问题：同一组 agent skills 要能落到 global scope，也要能落到 project scope。一次性的安装命令做不到这一点；一旦 dotfiles 或某个项目开始依赖固定 skills，预期集合就必须能被审查、复现和恢复。

这里最容易混在一起的是两类状态：人想维护的目标集合，以及机器实际安装出来的结果。前者应该保持干净，后者必须记录 commit、安装路径、安装时间等生成信息。

## 决策

`@plimeor/skills` 直接做成原生 TypeScript CLI，不再包 upstream `skills` package。

持久状态拆成两层：

- `skills.json` 是用户维护的期望状态，只描述想安装什么。
- `skills.lock.json` 是解析后的安装状态，记录实际装成了什么。
- 安装后的 skill 目录复制到当前 scope 对应的 `.agents/skills` 目录。
- 第一版支持 Git source 和本地文件系统 source。

`add`、`remove`、`list`、`sync`、`update` 和 `migrate` 都由这个 CLI 自己实现。

## 备选方案

### 继续包 upstream CLI

这样做可以少写安装逻辑，但 manifest 仍会被 upstream command 行为和它的 state shape 牵着走。

拒绝原因：这里要稳定下来的就是 `skills.json` / `skills.lock.json` 这组契约。如果它只是另一个 CLI 之上的适配层，后续同步、迁移和恢复都会被外部行为卡住。

### 第一版就支持多 agent fan-out

安装器可以一开始就支持多个 agent-specific 目录。

拒绝原因：第一版先把 scope 收窄到一个 global 或 project-local `.agents/skills` 目录。多 agent fan-out 以后可以加，但不应该先污染 manifest 和 lock 的核心模型。

## 后果

- `packages/skills` 自己拥有安装语义，不再受 upstream npm package 的兼容性约束。
- `skills.json` 可以进 dotfiles 或项目仓库；审查时看到的是期望集合，不是安装日志。
- `skills.lock.json` 可以放心记录 exact commits、timestamps、install paths 和 copy metadata。
- agent fan-out、discovery、authoring commands 以后要作为显式扩展加入，不能偷偷塞进当前 native contract。
