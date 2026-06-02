# @plimeor/git-kit

Small Git source and checkout primitives for Bun CLI tools.

`@plimeor/git-kit` keeps local Git process work behind a typed resource model:
normalize a remote source, create or open a local checkout, resolve refs, inspect
the worktree, and clean up temporary checkouts through one lifecycle handle.

## Install

```bash
bun add @plimeor/git-kit
```

The package is Bun-first and shells out to the local `git` executable.

## Core Model

There are two public resources:

- `Repository` represents a normalized remote Git source.
- `Checkout` represents a local Git worktree and owns checkout-scoped
  operations.

```ts
import * as Git from '@plimeor/git-kit'

const repo = Git.repository('plimeor/agent-skills')
console.log(repo.source) // https://github.com/plimeor/agent-skills.git
console.log(repo.identity) // plimeor__agent-skills

const checkout = await repo.checkout({ ref: 'main' })
try {
  console.log(checkout.directory)
  console.log(checkout.headSha)
} finally {
  await checkout.dispose()
}
```

## Temporary Checkouts

When `directory` is omitted, `checkout()` clones into a temporary directory and
`dispose()` removes that temporary checkout root.

```ts
await Git.withCheckout({ source: 'plimeor/agent-skills', ref: 'main' }, async checkout => {
  const files = await checkout.listWorktreeFiles()
  console.log(files)
})
```

`withCheckout()` is the preferred shape when the checkout is only needed inside
one async operation.

## Fixed Directories

Pass `directory` to clone into a stable worktree path. Fixed-directory checkouts
are not removed by `dispose()`.

```ts
const checkout = await Git.checkout({
  directory: '/tmp/agent-skills',
  source: 'plimeor/agent-skills',
  ref: 'main',
})

await checkout.dispose() // no-op for fixed directories
```

Use `reuseExisting` to validate and reuse an existing Git worktree at
`directory`.

```ts
const checkout = await Git.checkout({
  directory: '/tmp/agent-skills',
  reuseExisting: true,
  source: 'plimeor/agent-skills',
  ref: 'main',
})
```

Reused worktrees must have the same `origin` fetch URL as the normalized source.
The requested ref is fetched and checked out before the checkout is returned.

## Open Existing Worktrees

Use `openWorktree()` when the directory already contains a Git worktree and no
clone should be performed.

```ts
const checkout = await Git.openWorktree(process.cwd())
console.log(checkout.snapshot())
```

## Ref Operations

`Checkout#fetch()` resolves a remote ref without switching the worktree.

```ts
const main = await checkout.fetch('main')
console.log(main.headSha)

const defaultBranch = await checkout.fetch('HEAD')
console.log(defaultBranch.ref)
```

Resolution order:

- `HEAD` resolves the remote default branch.
- Branch names resolve against `refs/heads/<name>`.
- Tag names resolve against `refs/tags/<name>`.
- Other refs are fetched through `git fetch origin <ref>` and resolved through
  `FETCH_HEAD`.
- If direct fetch fails, branches and tags are fetched broadly, then `<ref>` is
  resolved locally as a commit-ish.

`Checkout#switch()` checks out a ref and refreshes the checkout snapshot.

```ts
await checkout.switch({ ref: 'release' })
await checkout.switch({ ref: checkout.headSha, detach: true })
```

## Worktree Reads

`listWorktreeFiles()` returns sorted repository-relative paths from:

- tracked files
- untracked files
- files not excluded by Git ignore rules

It uses `git ls-files -co --exclude-standard -z`.

```ts
const files = await checkout.listWorktreeFiles()
```

`collectIgnorePaths()` collects positive path rules from `.gitignore` files
under the checkout.

```ts
const ignored = await checkout.collectIgnorePaths()
```

This helper is for concrete path collection. It does not implement full Git
ignore matching semantics: comments and negated rules are skipped, and glob
patterns are returned as normalized paths rather than evaluated.

## API

### `repository(source)`

Creates a `Repository`.

`source` must be a non-empty remote source. GitHub shorthand in the form
`owner/name` is normalized to `https://github.com/owner/name.git`. Local paths
such as `../repo`, `./repo`, `/repo`, `.`, and `..` are rejected.

### `checkout(request)`

Clones or reuses a checkout and returns a `Checkout`.

```ts
type CheckoutRequest = {
  directory?: string
  ref?: string
  reuseExisting?: boolean
  source: string
}
```

### `withCheckout(request, callback)`

Creates a checkout, passes it to `callback`, then disposes it in `finally`.

### `openWorktree(directory)`

Opens an existing Git worktree and returns a `Checkout`.

### `Checkout`

Properties:

- `currentRef`
- `directory`
- `headSha`
- `identity`
- `source`

Methods:

- `snapshot()`
- `refresh()`
- `fetch(ref?)`
- `switch({ ref, detach? })`
- `listWorktreeFiles()`
- `collectIgnorePaths(input?)`
- `dispose()`

## Development

```bash
bun run --filter @plimeor/git-kit lint
bun run --filter @plimeor/git-kit test
```
