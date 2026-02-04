# Orbit QMD Integration Design

**Date**: 2026-02-04
**Status**: Draft
**Version**: v1.0

## Overview

Replace the custom memory search implementation with [QMD](https://github.com/tobi/qmd) (Query Markup Documents), a local-first hybrid search engine for markdown files.

### Why QMD?

| Aspect | Original Design | QMD |
|--------|-----------------|-----|
| Search Quality | Vector-only | BM25 + Vector + LLM Rerank |
| Query Understanding | Direct embedding | LLM expansion (3 variants) |
| Dependencies | OpenRouter API (cloud) | Local GGUF models |
| Implementation | 5+ custom modules | CLI tool integration |
| Maintenance | High | Low |

---

## QMD Architecture

### Search Pipeline

```
User Query
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Initial Retrieval (BM25)                                     │
│    - Quick keyword match via SQLite FTS5                        │
│    - Detect strong signal (high-confidence match)               │
│    - If strong signal found → skip expansion, return early      │
└─────────────────────────────────────────────────────────────────┘
    │ (no strong signal)
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Query Expansion (LLM: Qwen3-0.6B)                            │
│    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│    │   Lexical   │ │  Semantic   │ │    HyDE     │              │
│    │  Variants   │ │  Variants   │ │  Variants   │              │
│    │ (keywords)  │ │ (synonyms)  │ │ (hypothetic │              │
│    │             │ │             │ │  document)  │              │
│    └─────────────┘ └─────────────┘ └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Parallel Search                                              │
│                                                                 │
│    ┌──────────────────┐        ┌──────────────────┐             │
│    │    FTS5 / BM25   │        │  Vector / Cosine │             │
│    │  (SQLite FTS5)   │        │  (sqlite-vec)    │             │
│    │                  │        │                  │             │
│    │  Fast keyword    │        │  Semantic        │             │
│    │  matching        │        │  similarity      │             │
│    └────────┬─────────┘        └────────┬─────────┘             │
│             │                           │                       │
│             └───────────┬───────────────┘                       │
│                         ▼                                       │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Reciprocal Rank Fusion (RRF)                                 │
│                                                                 │
│    score(d) = Σ  1 / (k + rank_i(d))                            │
│              i∈queries                                          │
│                                                                 │
│    - Original query results: 2x weight                          │
│    - Expanded query results: 1x weight                          │
│    - Merges rankings from multiple search runs                  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Cross-Encoder Reranking (Qwen3-Reranker-0.6B)                │
│                                                                 │
│    - Take top 40 candidates from RRF                            │
│    - Score each (query, document) pair                          │
│    - Cross-encoder sees both simultaneously (more accurate)     │
│    - Aggregate scores per document                              │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Position-Aware Blending                                      │
│                                                                 │
│    - Preserve strong retrieval signals                          │
│    - Interpolate final ordering                                 │
│    - Balance precision and recall                               │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
Final Ranked Results
```

### Indexing Pipeline

```
Markdown Files
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. File Detection                                               │
│    - Glob pattern matching (e.g., **/*.md)                      │
│    - Content hash comparison (skip unchanged)                   │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Chunking (Token-based)                                       │
│                                                                 │
│    ┌─────────────────────────────────────────┐                  │
│    │ Document                                │                  │
│    │ ┌─────────┬─────────┬─────────┬───────┐ │                  │
│    │ │ Chunk 1 │ Chunk 2 │ Chunk 3 │  ...  │ │                  │
│    │ │ 800 tok │ 800 tok │ 800 tok │       │ │                  │
│    │ └────┬────┴────┬────┴────┬────┴───────┘ │                  │
│    │      │ overlap │ overlap │              │                  │
│    │      │  15%    │  15%    │              │                  │
│    └──────┴─────────┴─────────┴──────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Embedding (EmbeddingGemma-300M)                              │
│    - Local GGUF model via node-llama-cpp                        │
│    - Batch processing for efficiency                            │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Storage (SQLite)                                             │
│                                                                 │
│    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│    │   content    │  │  documents   │  │content_vectors│        │
│    │ (hash→body)  │  │ (path→meta)  │  │ (embeddings) │         │
│    └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
│    ┌──────────────────────────────────────────────────┐         │
│    │            FTS5 Virtual Table (BM25)             │         │
│    └──────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### Local Models

| Model | Parameters | Quantization | Size | Purpose |
|-------|------------|--------------|------|---------|
| EmbeddingGemma | 300M | Q8_0 | ~300MB | Vector embeddings |
| Qwen3 | 0.6B | Q8_0 | ~600MB | Query expansion |
| Qwen3-Reranker | 0.6B | Q8_0 | ~600MB | Cross-encoder rerank |

**Total**: ~1.5GB disk, ~2-3GB runtime memory (shared across all agents)

---

## Integration Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Orbit Server (Elysia)                           │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Agent Runtime                               │   │
│  │                                                                  │   │
│  │   executeAgent() ──→ composeSystemPrompt() ──→ Agent SDK        │   │
│  │         │                                           │            │   │
│  │         │                                           │            │   │
│  │         ▼                                           ▼            │   │
│  │   ┌──────────────┐                         ┌──────────────┐     │   │
│  │   │ Memory Tools │                         │  Orbit MCP   │     │   │
│  │   │              │                         │  (existing)  │     │   │
│  │   │ search_memory│                         │              │     │   │
│  │   │ get_memory   │                         │ schedule_task│     │   │
│  │   └──────┬───────┘                         │ send_to_agent│     │   │
│  │          │                                 └──────────────┘     │   │
│  └──────────┼──────────────────────────────────────────────────────┘   │
│             │                                                           │
│             ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      QMD Service                                 │   │
│  │                                                                  │   │
│  │   ┌─────────────────────────────────────────────────────────┐   │   │
│  │   │                  QMD Process (Singleton)                 │   │   │
│  │   │                                                          │   │   │
│  │   │   Models loaded once, shared across all agents           │   │   │
│  │   │                                                          │   │   │
│  │   │   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │   │   │
│  │   │   │ Embedding   │ │   Query     │ │  Reranker   │       │   │   │
│  │   │   │ Gemma-300M  │ │ Qwen3-0.6B  │ │ Qwen3-0.6B  │       │   │   │
│  │   │   └─────────────┘ └─────────────┘ └─────────────┘       │   │   │
│  │   └─────────────────────────────────────────────────────────┘   │   │
│  │                              │                                   │   │
│  │                              ▼                                   │   │
│  │   ┌─────────────────────────────────────────────────────────┐   │   │
│  │   │              Per-Agent Index (Isolated)                  │   │   │
│  │   │                                                          │   │   │
│  │   │   INDEX_PATH=~/.config/orbit/agents/alice/qmd.sqlite    │   │   │
│  │   │   INDEX_PATH=~/.config/orbit/agents/bob/qmd.sqlite      │   │   │
│  │   │   INDEX_PATH=~/.config/orbit/agents/carol/qmd.sqlite    │   │   │
│  │   └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     Agent Workspace (File System)                        │
│                                                                         │
│   ~/.config/orbit/agents/                                               │
│   ├── alice/                                                            │
│   │   ├── IDENTITY.md                                                   │
│   │   ├── SOUL.md                                                       │
│   │   ├── USER.md                                                       │
│   │   ├── AGENTS.md                                                     │
│   │   ├── TOOLS.md                                                      │
│   │   ├── memory/                                                       │
│   │   │   ├── long-term.md          ◄─── Indexed by QMD                │
│   │   │   └── daily/                                                    │
│   │   │       ├── 2026-02-01.md     ◄─── Indexed by QMD                │
│   │   │       ├── 2026-02-02.md     ◄─── Indexed by QMD                │
│   │   │       └── 2026-02-03.md     ◄─── Indexed by QMD                │
│   │   ├── workspace/                                                    │
│   │   │   └── notes/*.md            ◄─── Indexed by QMD                │
│   │   └── qmd.sqlite                ◄─── Agent-specific QMD index      │
│   │                                                                     │
│   ├── bob/                                                              │
│   │   ├── ...                                                           │
│   │   └── qmd.sqlite                ◄─── Isolated index                │
│   │                                                                     │
│   └── carol/                                                            │
│       ├── ...                                                           │
│       └── qmd.sqlite                ◄─── Isolated index                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      Shared Model Cache                                  │
│                                                                         │
│   ~/.cache/qmd/                                                         │
│   └── models/                                                           │
│       ├── embeddinggemma-300M-Q8_0.gguf     (~300MB)                   │
│       ├── Qwen3-0.6B-Q8_0.gguf              (~600MB)                   │
│       └── qwen3-reranker-0.6b-q8_0.gguf     (~600MB)                   │
│                                                                         │
│   Models are downloaded once, shared by all agents                      │
│   Memory: Only loaded once per Orbit server process                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Multi-Agent Isolation

```
┌─────────────────────────────────────────────────────────────────┐
│                     QMD Service Layer                           │
│                                                                 │
│   search(agentName, query)                                      │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  Resolve index path:                                     │  │
│   │  ~/.config/orbit/agents/${agentName}/qmd.sqlite         │  │
│   └─────────────────────────────────────────────────────────┘  │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  Execute QMD with INDEX_PATH env:                        │  │
│   │                                                          │  │
│   │  INDEX_PATH=/path/to/agent/qmd.sqlite qmd query "..."   │  │
│   │                                                          │  │
│   │  Same QMD process, different database file               │  │
│   │  Models remain loaded (no reload overhead)               │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Memory Impact:
┌─────────────────────────────────────────────────────────────────┐
│  Models (shared):     ~2-3GB  (loaded once)                     │
│  Index per agent:     ~1-50MB (depends on memory file count)    │
│                                                                 │
│  10 agents = 2-3GB models + ~500MB indexes = ~3.5GB total       │
│  NOT 10x model memory!                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Directory Structure

```
apps/orbit/server/
├── src/
│   ├── modules/
│   │   ├── agents/
│   │   │   ├── services/
│   │   │   │   ├── memory.service.ts         # Existing: daily memory read/write
│   │   │   │   └── qmd.service.ts            # New: QMD wrapper
│   │   │   └── tools/
│   │   │       ├── orbit-tools.ts            # Existing
│   │   │       └── memory-tools.ts           # New: search_memory, get_memory
```

### QMD Service

```typescript
// src/modules/agents/services/qmd.service.ts

import { $ } from 'bun'
import { resolve } from 'path'
import { getAgentWorkspacePath } from './agent.service'

interface SearchResult {
  docid: string
  path: string
  score: number
  title: string
  snippet: string
  lines?: { start: number; end: number }
}

interface QmdConfig {
  agentName: string
  maxResults?: number
}

/**
 * Get the QMD index path for an agent
 */
function getIndexPath(agentName: string): string {
  const workspace = getAgentWorkspacePath(agentName)
  return resolve(workspace, 'qmd.sqlite')
}

/**
 * Initialize QMD collection for an agent
 * Called when agent is created or on first search
 */
export async function initializeIndex(agentName: string): Promise<void> {
  const workspace = getAgentWorkspacePath(agentName)
  const indexPath = getIndexPath(agentName)

  // Add memory directory as collection
  await $`INDEX_PATH=${indexPath} qmd collection add ${workspace}/memory --name memory`

  // Add workspace directory (agent-created files)
  await $`INDEX_PATH=${indexPath} qmd collection add ${workspace}/workspace --name workspace`

  // Add context for better retrieval
  await $`INDEX_PATH=${indexPath} qmd context add "qmd://memory" "Agent daily memories and long-term notes"`
  await $`INDEX_PATH=${indexPath} qmd context add "qmd://workspace" "Files and documents created by the agent"`

  // Generate initial embeddings
  await $`INDEX_PATH=${indexPath} qmd embed`
}

/**
 * Update index when memory files change
 * Called after memory write operations
 */
export async function updateIndex(agentName: string): Promise<void> {
  const indexPath = getIndexPath(agentName)
  await $`INDEX_PATH=${indexPath} qmd update`
  await $`INDEX_PATH=${indexPath} qmd embed`
}

/**
 * Search agent's memory using QMD hybrid search
 */
export async function search(config: QmdConfig, query: string): Promise<SearchResult[]> {
  const indexPath = getIndexPath(config.agentName)
  const maxResults = config.maxResults ?? 6

  // Use 'query' command for hybrid search with reranking
  const result = await $`INDEX_PATH=${indexPath} qmd query ${query} --limit ${maxResults} --format json`.json()

  return result.map((item: any) => ({
    docid: item.docid,
    path: item.path,
    score: item.score,
    title: item.title,
    snippet: item.snippet,
    lines: item.lines,
  }))
}

/**
 * Get full document content
 */
export async function getDocument(
  agentName: string,
  path: string,
  options?: { from?: number; lines?: number }
): Promise<string> {
  const indexPath = getIndexPath(agentName)

  let cmd = `INDEX_PATH=${indexPath} qmd get "${path}"`
  if (options?.from) {
    cmd += ` --from ${options.from}`
  }
  if (options?.lines) {
    cmd += ` --lines ${options.lines}`
  }

  const result = await $`${cmd}`.text()
  return result
}

/**
 * Check if index exists for agent
 */
export async function indexExists(agentName: string): Promise<boolean> {
  const indexPath = getIndexPath(agentName)
  const file = Bun.file(indexPath)
  return file.exists()
}
```

### Memory Tools (MCP)

```typescript
// src/modules/agents/tools/memory-tools.ts

import { tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import * as qmd from '../services/qmd.service'

export function createMemoryTools(agentName: string) {
  return [
    tool(
      'search_memory',
      `Search your memories and notes semantically.

Uses hybrid search combining:
- Keyword matching (BM25)
- Semantic similarity (vector)
- LLM reranking for best results

Returns relevant snippets with file paths and line numbers.`,
      {
        query: z.string().describe('What to search for'),
        maxResults: z.number().optional().describe('Max results (default: 6)'),
      },
      async (args) => {
        // Ensure index exists
        if (!(await qmd.indexExists(agentName))) {
          await qmd.initializeIndex(agentName)
        }

        const results = await qmd.search(
          { agentName, maxResults: args.maxResults },
          args.query
        )

        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: 'No relevant memories found.' }],
          }
        }

        const formatted = results
          .map((r, i) => {
            const location = r.lines
              ? `${r.path}:${r.lines.start}-${r.lines.end}`
              : r.path
            return `${i + 1}. [${r.score.toFixed(2)}] ${location}\n   ${r.title}\n   ${r.snippet}`
          })
          .join('\n\n')

        return {
          content: [{ type: 'text', text: formatted }],
        }
      }
    ),

    tool(
      'get_memory',
      `Read full content from a memory file.

Use this after search_memory to get complete context around a relevant snippet.`,
      {
        path: z.string().describe('File path (from search results)'),
        from: z.number().optional().describe('Start line number (1-indexed)'),
        lines: z.number().optional().describe('Number of lines (default: 50)'),
      },
      async (args) => {
        const content = await qmd.getDocument(agentName, args.path, {
          from: args.from,
          lines: args.lines ?? 50,
        })

        return {
          content: [{ type: 'text', text: content }],
        }
      }
    ),
  ]
}
```

### Integration with Agent Runtime

```typescript
// src/modules/agents/agent.runtime.ts (modified)

import { createMemoryTools } from './tools/memory-tools'
import * as qmd from './services/qmd.service'

export async function executeAgent(params: {
  agentName: string
  prompt: string
  sessionType: 'chat' | 'heartbeat' | 'cron'
  sessionId?: string
}): Promise<{ result: string; newSessionId: string }> {
  // ... existing code ...

  // Create MCP tools including memory tools
  const orbitMcp = createOrbitMcp(params.agentName)
  const memoryTools = createMemoryTools(params.agentName)

  // Execute Agent SDK with memory tools
  for await (const message of query({
    prompt: params.prompt,
    options: {
      cwd: workspacePath,
      resume: params.sessionId,
      systemPrompt: systemPrompt,
      allowedTools: [
        'Bash',
        'Read',
        'Write',
        'Edit',
        'Glob',
        'Grep',
        'WebSearch',
        'WebFetch',
        'mcp__orbit__*',
        'search_memory',    // New
        'get_memory',       // New
      ],
      // ... rest of options ...
    },
  })) {
    // ... handle messages ...
  }

  // After writing to today's memory, update QMD index
  await appendDailyMemory(params.agentName, {
    sessionType: params.sessionType,
    prompt: params.prompt,
    result: result,
    timestamp: new Date(),
  })

  // Trigger async index update (non-blocking)
  qmd.updateIndex(params.agentName).catch(console.error)

  return { result, newSessionId }
}
```

---

## Index Content

### Included

| Path | Description |
|------|-------------|
| `memory/*.md` | Daily memory files |
| `memory/long-term.md` | Long-term memory |
| `workspace/**/*.md` | Agent-created documents |

### Excluded

Files always injected into system prompt (no need to search):

- `IDENTITY.md`
- `SOUL.md`
- `USER.md`
- `AGENTS.md`
- `TOOLS.md`
- `HEARTBEAT.md`
- `BOOTSTRAP.md`

---

## Index Lifecycle

### Creation

```
Agent Created
    │
    ▼
First search_memory call
    │
    ▼
qmd.initializeIndex(agentName)
    │
    ├──→ qmd collection add memory/
    ├──→ qmd collection add workspace/
    ├──→ qmd context add (metadata)
    └──→ qmd embed (initial vectors)
```

### Update

```
Memory Write (appendDailyMemory)
    │
    ▼
qmd.updateIndex(agentName)  [async, non-blocking]
    │
    ├──→ qmd update (detect changed files)
    └──→ qmd embed (update vectors)
```

### Search

```
Agent calls search_memory(query)
    │
    ▼
Check index exists
    │
    ├──→ No: initializeIndex()
    │
    └──→ Yes: continue
    │
    ▼
qmd query "..." --format json
    │
    ▼
Return formatted results
```

---

## Configuration

### Environment Variables

```bash
# QMD model cache (shared across all agents)
XDG_CACHE_HOME=~/.cache

# Per-agent index path (set dynamically by qmd.service.ts)
INDEX_PATH=~/.config/orbit/agents/<agent-name>/qmd.sqlite
```

### Optional: TOOLS.md Update

Add to agent's `TOOLS.md`:

```markdown
## Memory Search

You have access to semantic search across your memories:

### search_memory

Search your memories and notes using natural language. Returns relevant snippets with file locations.

Example: `search_memory("when did user mention their vacation plans")`

### get_memory

Read full content from a memory file after finding relevant snippets.

Example: `get_memory("memory/daily/2026-01-15.md", from=10, lines=30)`
```

---

## Resource Usage

### Disk

| Component | Size |
|-----------|------|
| Models (shared) | ~1.5GB |
| Index per agent | 1-50MB |

### Memory (Runtime)

| Component | Size | Notes |
|-----------|------|-------|
| Models | ~2-3GB | Loaded once, shared |
| Per-search overhead | ~50MB | Temporary |

### Performance

| Operation | Expected Time |
|-----------|---------------|
| First index (100 files) | 30-60s |
| Incremental update | 1-5s |
| Search query | 1-3s |

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| QMD not installed | Log error, disable memory tools |
| Model download fails | Retry 3x, then disable |
| Index corruption | Delete and rebuild on next search |
| Search timeout | Return empty results with warning |
| Empty index | Return "No memories indexed yet" |

---

## Migration from Original Design

If the original memory search was partially implemented:

1. Remove:
   - `memory-index.service.ts`
   - `memory-search.service.ts`
   - `embeddings/` directory
   - `memory_files`, `memory_chunks`, `memory_chunks_vec` tables

2. Add:
   - `qmd.service.ts`
   - `memory-tools.ts`

3. Keep:
   - `memory.service.ts` (daily memory read/write)
   - Existing workspace structure

---

## Future Enhancements

1. **MCP Server Mode**: Run QMD as persistent MCP server instead of CLI calls
2. **Streaming Results**: Support streaming for large result sets
3. **Cross-Agent Search**: Optional shared index for multi-agent knowledge
4. **Custom Collections**: Allow agents to define additional indexed directories

---

## References

- [QMD Repository](https://github.com/tobi/qmd)
- [sqlite-vec](https://github.com/asg017/sqlite-vec)
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp)
- [Reciprocal Rank Fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
