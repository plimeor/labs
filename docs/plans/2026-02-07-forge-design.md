# Forge - Note App Design

A fast, minimal, markdown-based note app with WYSIWYG editing, stored on iCloud Drive.

## Tech Stack

| Layer     | Choice                          |
| --------- | ------------------------------- |
| Framework | Tauri v2                        |
| Frontend  | React + Lexical (WYSIWYG)       |
| Backend   | Rust (rusqlite, notify)         |
| Storage   | Markdown files on iCloud Drive  |
| Index     | SQLite (FTS5) local             |
| Build     | Vite                            |

## Architecture

```
┌─────────────────────────────────────┐
│        Frontend (React + Lexical)   │
│  Sidebar, Search, Editor - unified  │
├─────────────────────────────────────┤
│        Tauri IPC (invoke/listen)    │
├─────────────────────────────────────┤
│        Rust Backend (Tauri)         │
│  File I/O, SQLite, Markdown parser, │
│  iCloud path management            │
└─────────────────────────────────────┘
         ↕ iCloud Drive (files)
```

## Project Structure

```
apps/forge/
├── src-tauri/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   │   ├── notes.rs         # CRUD, read/write .md files
│   │   │   ├── search.rs        # SQLite FTS queries
│   │   │   └── index.rs         # Index management
│   │   ├── db/
│   │   │   └── mod.rs           # rusqlite schema + queries
│   │   ├── parser/
│   │   │   └── mod.rs           # frontmatter + backlinks parsing
│   │   └── watcher.rs           # File change monitoring (notify crate)
│   ├── gen/                     # Auto-generated iOS/Android projects
│   ├── tauri.conf.json
│   ├── tauri.macos.conf.json
│   └── tauri.ios.conf.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── SearchModal.tsx
│   │   ├── NoteList.tsx
│   │   └── BacklinksPanel.tsx
│   ├── editor/
│   │   ├── Editor.tsx
│   │   ├── nodes/
│   │   │   └── BacklinkNode.tsx
│   │   ├── plugins/
│   │   │   ├── MarkdownPlugin.tsx
│   │   │   └── LinkSearchPlugin.tsx
│   │   └── themes/
│   │       └── default.css
│   └── hooks/
│       ├── useNotes.ts
│       └── useSearch.ts
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## File Format

All notes stored as flat `.md` files with YAML frontmatter:

```markdown
---
id: 01J5K8N2M3P4Q5R6S7T8U9V0
title: My Note Title
created: 2026-02-07T10:30:00+08:00
modified: 2026-02-07T11:45:00+08:00
tags: [project, idea]
---

# My Note Title

Content with a [[backlink-id|display text]] to another note.
```

**Decisions:**

- `id`: ULID (time-sortable + unique). Backlinks reference by id, immune to renames.
- Filename: `{title}.md`, human-readable.
- Flat structure: all `.md` files in one directory. Organization via tags and links only.
- Backlink syntax: `[[note-title]]` or `[[id|display text]]`.
- Nested tags supported: `project/forge`.

**iCloud Drive path:**

```
~/Library/Mobile Documents/iCloud~com.forge.app/Documents/
├── My Note Title.md
├── Another Note.md
└── .forge/                 # local, not synced
    ├── index.sqlite
    └── config.json
```

## SQLite Schema

```sql
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    filepath TEXT NOT NULL,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    body_preview TEXT,
    checksum TEXT NOT NULL
);

CREATE VIRTUAL TABLE notes_fts USING fts5(
    title, body, content=notes, tokenize='unicode61'
);

CREATE TABLE tags (
    note_id TEXT NOT NULL REFERENCES notes(id),
    tag TEXT NOT NULL,
    PRIMARY KEY (note_id, tag)
);
CREATE INDEX idx_tags_tag ON tags(tag);

CREATE TABLE links (
    source_id TEXT NOT NULL REFERENCES notes(id),
    target_id TEXT NOT NULL REFERENCES notes(id),
    context_path TEXT NOT NULL,
    context_text TEXT,
    PRIMARY KEY (source_id, target_id, context_path)
);
CREATE INDEX idx_links_target ON links(target_id);
```

## Tauri IPC

**Rust commands:**

```rust
#[tauri::command]
fn load_note(id: String) -> Result<NoteContent, String>

#[tauri::command]
fn save_note(id: String, markdown: String) -> Result<(), String>

#[tauri::command]
fn search_notes(query: String) -> Result<Vec<SearchResult>, String>

#[tauri::command]
fn list_notes() -> Result<Vec<NoteSummary>, String>

#[tauri::command]
fn get_backlinks(note_id: String) -> Result<Backlinks, String>
```

**Frontend usage:**

```typescript
const note = await invoke<NoteContent>('load_note', { id })
const results = await invoke<SearchResult[]>('search_notes', { query })
```

## Backlinks

**Linked mentions:** Explicit `[[link]]` references, stored in `links` table.

**Unlinked mentions:** FTS search for current note title in other notes. Discovered dynamically, not stored.

**Context path:** Each backlink stores the structural hierarchy path:

```json
["Meeting Notes", "Action Items", "Follow up with design team"]
```

Corresponds to the heading/list nesting where the link appears. Displayed as breadcrumbs in the backlinks panel.

**One-click link:** Unlinked mentions can be converted to explicit `[[link]]` by replacing the matched text in the source note.

## UI Layout

**macOS:**

```
┌──────────────────────────────────────────────────┐
│ ◀ ▶  🔍 Quick Search (⌘K)              ⚙️       │
├────────────┬─────────────────────────────────────┤
│            │                                     │
│  All Notes │  # Note Title                       │
│  ────────  │                                     │
│  Tags ▾    │  Content here...                    │
│   #project │                                     │
│   #idea    │  Some text with [[backlink]]        │
│            │                                     │
│  ────────  │                                     │
│  📄 Note A │  ── Backlinks (2) ──────────        │
│  📄 Note B │  📄 Meeting Notes                   │
│  📄 Note C │     Meeting › Action Items          │
│            │                                     │
├────────────┴─────────────────────────────────────┤
```

**iOS:** Stack navigation: Note List → push → Editor (fullscreen).

**Key interactions:**

| Action         | macOS              | iOS                |
| -------------- | ------------------ | ------------------ |
| Quick search   | `⌘K` modal         | Top search bar     |
| New note       | `⌘N`               | + button           |
| Insert link    | `[[` in editor     | Same               |
| Switch note    | Sidebar / `⌘K`     | Back + tap         |
| Tag filter     | Sidebar tags       | Top filter         |
| Delete note    | Right-click / `⌘⌫` | Swipe left         |
| Toggle sidebar | `⌘\`               | N/A                |

**Design principles:**

- No toolbar buttons for formatting. Pure markdown syntax + WYSIWYG rendering.
- Editor area maximized.
- Dark/light follows system.

## MVP Phases

### Phase 1 - Core

- [ ] Tauri project init + React + Vite setup
- [ ] Rust: iCloud Drive path discovery + file read/write
- [ ] Rust: SQLite schema init (rusqlite)
- [ ] Rust: Markdown frontmatter parsing (id, title, tags, created, modified)
- [ ] Rust: Incremental indexing on startup (checksum diff)
- [ ] React: Note list (sidebar)
- [ ] Lexical: WYSIWYG markdown editor basics (heading, bold, italic, code, list)
- [ ] Tauri IPC: load_note / save_note / list_notes
- [ ] Auto-save (debounce 300ms)
- [ ] Create / delete notes

### Phase 2 - Search & Links

- [ ] Rust: FTS5 full-text search
- [ ] React: `⌘K` Quick Search modal
- [ ] Lexical: `[[` link insertion + search dropdown
- [ ] Lexical: BacklinkNode rendering (clickable navigation)
- [ ] Rust: backlinks parsing + context_path extraction
- [ ] React: BacklinksPanel (linked + unlinked mentions)
- [ ] Tag filtering (sidebar tags list)

### Phase 3 - Polish

- [ ] Dark/light theme following system
- [ ] macOS shortcuts (`⌘N`, `⌘\`, `⌘⌫`)
- [ ] Rust: FileWatcher (notify crate) for external changes
- [ ] Lexical: code block syntax highlighting
- [ ] Note list sorting (by modified time / title)

### Phase 4 - Mobile

- [ ] `tauri ios init` + iOS config
- [ ] Responsive layout (sidebar collapse → stack navigation)
- [ ] iOS-specific interactions (swipe to delete, pull to refresh)
- [ ] iCloud Drive path adaptation for iOS sandbox

### Out of MVP scope

- Embed page
- Images / attachments
- Export
- Web version
- Collaborative editing
