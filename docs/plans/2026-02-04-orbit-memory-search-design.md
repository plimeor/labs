# Memory Search Design

Semantic memory search for Orbit agents using embeddings.

## Overview

Add `search_memory` and `get_memory` tools to agents, enabling semantic search across memory files and agent-created documents.

## Configuration

Location: `~/.config/orbit/config.toml`

```toml
[embedding]
provider = "openrouter"
model = "openai/text-embedding-3-small"
api_key = "sk-or-v1-..."

[embedding.index]
chunk_tokens = 400
chunk_overlap = 80
watch_debounce_ms = 1500

[embedding.search]
max_results = 6
min_score = 0.35
snippet_length = 700

[embedding.exclude]
files = ["IDENTITY.md", "SOUL.md", "USER.md", "AGENTS.md", "TOOLS.md"]
```

Embedding is optional. Without configuration, memory search features are disabled.

## Database Schema

```sql
CREATE TABLE memory_files (
  id INTEGER PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(agent_id, path)
);

CREATE TABLE memory_chunks (
  id INTEGER PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  text TEXT NOT NULL,
  hash TEXT NOT NULL,
  embedding TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (file_id) REFERENCES memory_files(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE memory_chunks_vec USING vec0(
  id INTEGER PRIMARY KEY,
  embedding FLOAT[1536]
);

CREATE INDEX idx_chunks_agent ON memory_chunks(agent_id);
CREATE INDEX idx_files_agent ON memory_files(agent_id);
```

## Module Structure

```
src/modules/agents/
├── services/
│   ├── memory.service.ts           # Existing: daily memory read/write
│   ├── memory-index.service.ts     # New: index management
│   └── memory-search.service.ts    # New: search execution
├── embeddings/
│   ├── provider.ts                 # EmbeddingProvider interface
│   ├── openrouter.ts               # OpenRouter implementation
│   └── chunker.ts                  # Document chunking logic
└── tools/
    ├── orbit-tools.ts              # Existing
    └── memory-tools.ts             # New: search_memory, get_memory
```

## Data Flow

### Indexing

```
File change (File Watch / On Search)
    │
    ▼
Detect changes (hash comparison)
    │
    ├─→ No change: skip
    │
    └─→ Changed:
            │
            ▼
        Chunk document (structure + token split)
            │
            ▼
        Call OpenRouter embedding API
            │
            ▼
        Write to memory_chunks + memory_chunks_vec
```

### Search

```
Agent calls search_memory(query)
    │
    ▼
Check if sync needed (lazy index)
    │
    ▼
query → OpenRouter embedding
    │
    ▼
sqlite-vec cosine search
    │
    ▼
Filter (min_score) + sort + limit (max_results)
    │
    ▼
Return [{ path, startLine, endLine, score, snippet }]
```

## Tool Interface

### search_memory

```typescript
{
  name: 'search_memory',
  description: 'Search your memories and notes semantically.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to search for' },
      maxResults: { type: 'number', description: 'Max results (default: 6)' }
    },
    required: ['query']
  }
}
```

### get_memory

```typescript
{
  name: 'get_memory',
  description: 'Read full content from a memory file at specific lines.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to workspace' },
      from: { type: 'number', description: 'Start line number (1-indexed)' },
      lines: { type: 'number', description: 'Number of lines (default: 50)' }
    },
    required: ['path']
  }
}
```

## Index Content

**Included:**

- `memory/*.md` (daily memory files)
- Agent-created files in workspace

**Excluded:**

- `IDENTITY.md`, `SOUL.md`, `USER.md`, `AGENTS.md`, `TOOLS.md`
- These are always injected into system prompt

## Index Triggers

- **On Search**: Lazy sync before search if files changed
- **File Watch**: Real-time indexing with 1.5s debounce

## Chunking Strategy

1. First split by markdown structure (`###` headers, paragraphs)
2. If chunk exceeds token limit, split by tokens with overlap

Default: 400 tokens/chunk, 80 tokens overlap

## Conditional Logic

When embedding is not configured:

- `config.embedding` is `undefined`
- File watch not started
- Vector tables not created
- Memory tools not registered
- Existing orbit-tools work normally

## Error Handling

| Scenario                   | Handling                                  |
| -------------------------- | ----------------------------------------- |
| OpenRouter API failure     | Retry 3x, log error, return empty results |
| sqlite-vec load failure    | Log warning, disable memory search        |
| File deleted               | Clean up chunks and vec records on sync   |
| Embedding dimension change | Detect and rebuild index                  |
| Empty index                | Return "No memories indexed yet"          |
| Oversized chunk            | Split by tokens                           |
