# @plimeor/note-kit

Note gateway and Codex runner utilities for agent workflows.

`note-kit` currently has two submodules:

- `note-gateway` defines a scoped note-operation interface and a Bear adapter.
- `agent-runner` runs Codex and injects a short reminder that agents may use the
  readonly `note-gateway` CLI to inspect notes.

## Install

```bash
bun add @plimeor/note-kit
```

## First Command

```bash
note-gateway search "wiki" --limit 5 --json
```

## note-gateway

The CLI is intentionally readonly. It can search notes and read a single note,
but it does not expose create, append, replace, tag, or wikilink mutation
operations.

```bash
note-gateway search "AI-first" --required-tag wiki --json
note-gateway get 12345678-ABCD --json
```

Library callers can import the full gateway surface:

```ts
import { BearNoteGateway } from '@plimeor/note-kit/note-gateway'

const gateway = new BearNoteGateway({ requiredTags: ['wiki'] })
const notes = await gateway.search({ text: 'workflow', limit: 10 })
```

The Bear adapter is also exported directly:

```ts
import { BearNoteGateway } from '@plimeor/note-kit/note-gateway/bear-adapter'
```

## agent-runner

```ts
import { agentRunner } from '@plimeor/note-kit/agent-runner'

const result = await agentRunner('Summarize the relevant notes about workflow drift.')
```
