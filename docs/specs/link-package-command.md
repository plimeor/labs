# 规格：Link Package Command

创建日期：2026-04-25

## 目标

新增一个 root command，用来安装、构建并把内部 workspace package 注册到 Bun 的 global link registry。

它服务本 monorepo 的 `@plimeor/*` packages 本地开发。日常使用时只传短 package name：

```bash
bun run link-package skills
```

这会解析为 `@plimeor/skills`。

## 行为

Root command 是：

```bash
bun run link-package <package>
```

接受：

- `skills`
- `@plimeor/skills`

拒绝：

- 缺少 package name。
- 多于一个 package name。
- 不属于 `@plimeor/*` 的 scoped package。
- 包含 slash 但不等于 `@plimeor/<name>` 的 package name。
- 不在 root workspace package list 中的 package。

解析出 package 后，命令按这个顺序跑：

```bash
bun install --filter <workspace-package-path>
bun run build    # 如果 package 定义了 build
bun run prepack  # 否则，如果 package 定义了 prepack
cd <resolved-package-directory>
bun link
```

`bun link` 必须在 package directory 中运行。Bun 的 package-directory `bun link` 会把当前 package 注册为 linkable；这里不使用 `bun link --global`。

Install filter 用解析后的 workspace package path。原因是 Bun 的 `install --filter` 在不同版本中不一定稳定匹配 package name。

## 实现说明

- 脚本位于 `scripts/link-package.ts`。
- Root `package.json` 将它暴露为 `link-package`。
- 脚本由 Bun 运行，只用 `zx` 执行 subprocess。
- 脚本读取 root `workspaces` 字段和 package-level `package.json`，按实际 package name 定位 package。
- 不把 `packages/<name>` 硬编码为解析机制；package 的真实 name 仍由 package-level `package.json` 决定。

## 验证

除非另行要求，这里不新增测试；这个命令的风险先用手动验证覆盖。

手动验证：

```bash
bun run link-package
bun run link-package missing
bun run link-package skills
```

前两个命令应在 install、prepare 或 link 之前失败。最后一个命令应安装目标 workspace dependencies，运行该 package 可用的 preparation script，并通过 Bun link 注册它。
