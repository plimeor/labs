/// Filesystem and SQLite projection layer.
/// Handles vault I/O, note scanning, atomic file writes, operation log, and SQLite rebuild.
use crate::domain::{
    extract_links, inferred_metadata, kind, kind_from_path, make_note_value, metadata_tags,
    note_id, now_iso, operation_value, parse_frontmatter, relative_path, revision,
    serialize_markdown, split_frontmatter, stable_hash, string_at, title,
};
use crate::Model;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Vault open / rebuild
// ---------------------------------------------------------------------------

pub fn rebuild_vault(vault: &Path, model: &mut Model) -> Result<(), String> {
    model.vault_path = Some(vault.to_path_buf());
    model.notes = scan_markdown_notes(vault)?;
    model.operations = load_operations(vault)?;
    model.index_status = "complete".to_string();
    rebuild_sqlite_projection(vault, &model.notes)?;
    Ok(())
}

/// Convenience wrapper that creates and populates a fresh Model in one call.
/// Used by `anchor-core serve` to load the resident model at startup.
pub fn rebuild_vault_into_model(vault: &Path) -> Result<crate::Model, crate::CoreError> {
    let mut model = crate::Model::default();
    rebuild_vault(vault, &mut model).map_err(crate::CoreError::Io)?;
    Ok(model)
}

pub fn scan_markdown_notes(vault: &Path) -> Result<Vec<Value>, String> {
    let mut files = Vec::new();
    for folder in ["journals", "notes", "references", "proposals"] {
        collect_markdown_files(&vault.join(folder), &mut files)?;
    }

    let mut notes = Vec::new();
    for path in files {
        notes.push(parse_markdown_file(vault, &path)?);
    }
    notes.sort_by(|left, right| {
        string_at(&right["metadata"], "updated").cmp(&string_at(&left["metadata"], "updated"))
    });
    Ok(notes)
}

pub fn collect_markdown_files(dir: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_markdown_files(&path, files)?;
        } else if path.extension().and_then(|value| value.to_str()) == Some("md") {
            files.push(path);
        }
    }
    Ok(())
}

pub fn parse_markdown_file(vault: &Path, path: &Path) -> Result<Value, String> {
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let rel = relative_path(vault, path)?;
    let (frontmatter, body) = split_frontmatter(&raw);
    let mut metadata = frontmatter
        .map(parse_frontmatter)
        .unwrap_or_else(|| inferred_metadata(&rel, &body));

    if !metadata.contains_key("id") {
        metadata.insert(
            "id".to_string(),
            json!(format!("transient_{}", stable_hash(&rel))),
        );
    }
    if !metadata.contains_key("kind") {
        metadata.insert("kind".to_string(), json!(kind_from_path(&rel)));
    }
    if !metadata.contains_key("title") {
        metadata.insert(
            "title".to_string(),
            json!(crate::domain::title_from_body_or_path(&body, &rel)),
        );
    }
    if !metadata.contains_key("created") {
        metadata.insert("created".to_string(), json!(now_iso()));
    }
    if !metadata.contains_key("updated") {
        metadata.insert("updated".to_string(), json!(now_iso()));
    }
    metadata
        .entry("aliases".to_string())
        .or_insert_with(|| json!([]));
    metadata
        .entry("tags".to_string())
        .or_insert_with(|| json!([]));
    metadata
        .entry("properties".to_string())
        .or_insert_with(|| json!({}));

    Ok(make_note_value(&rel, Value::Object(metadata), &body))
}

// ---------------------------------------------------------------------------
// Atomic file write
// ---------------------------------------------------------------------------

pub fn write_note_file(
    vault: &Path,
    file_path: &str,
    metadata: Value,
    body: &str,
) -> Result<Value, String> {
    let note = make_note_value(file_path, metadata, body);
    let full_path = vault.join(file_path);

    // Ensure parent directory exists.
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    // Build the content to write — must match exactly what was hashed in make_note_value.
    let content = serialize_markdown(&note["metadata"], note["body"].as_str().unwrap_or(""));

    // Atomic write: write to a sibling .anchor-tmp file, fsync, then rename.
    let tmp_path = full_path.with_extension("anchor-tmp");
    {
        let mut file = File::create(&tmp_path).map_err(|error| error.to_string())?;
        file.write_all(content.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }
    fs::rename(&tmp_path, &full_path).map_err(|error| error.to_string())?;

    Ok(note)
}

// ---------------------------------------------------------------------------
// Unique path helper
// ---------------------------------------------------------------------------

pub fn unique_file_path(vault: &Path, requested: &str) -> String {
    if !vault.join(requested).exists() {
        return requested.to_string();
    }

    let path = Path::new(requested);
    let parent = path.parent().and_then(|value| value.to_str()).unwrap_or("");
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("note");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("md");
    for index in 2..1000 {
        let candidate = if parent.is_empty() {
            format!("{stem}-{index}.{extension}")
        } else {
            format!("{parent}/{stem}-{index}.{extension}")
        };
        if !vault.join(&candidate).exists() {
            return candidate;
        }
    }
    requested.to_string()
}

// ---------------------------------------------------------------------------
// Vault structure helpers
// ---------------------------------------------------------------------------

pub fn ensure_vault_structure(vault: &Path) -> Result<(), String> {
    for folder in [
        "journals",
        "notes",
        "references",
        "proposals",
        ".anchor/config",
        ".anchor/operations",
        ".anchor/cache",
    ] {
        fs::create_dir_all(vault.join(folder)).map_err(|error| error.to_string())?;
    }

    write_file_if_missing(
        &vault.join(".anchor/config/vault.toml"),
        r#"name = "Anchor Vault"
version = "0.1.0"
source_of_truth = "markdown"
projection = ".anchor/cache/index.sqlite"
"#,
    )?;
    write_file_if_missing(
        &vault.join(".anchor/config/agent-spec.toml"),
        r#"default_mode = "ask"
allowed_outputs = ["draft", "reference", "proposal", "proposed_change"]
write_boundary = "notes_operation_core"
"#,
    )?;
    write_file_if_missing(&vault.join(".anchor/operations/operations.jsonl"), "")?;

    Ok(())
}

pub fn seed_demo_vault(vault: &Path) -> Result<(), String> {
    for folder in [
        "journals",
        "notes",
        "references",
        "proposals",
        ".anchor/cache",
        ".anchor/operations",
    ] {
        let path = vault.join(folder);
        if path.exists() {
            fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        }
    }

    for folder in [
        "journals/2026/05",
        "notes",
        "references",
        "proposals",
        ".anchor/config",
        ".anchor/operations",
        ".anchor/cache",
    ] {
        fs::create_dir_all(vault.join(folder)).map_err(|error| error.to_string())?;
    }

    write_seed_file(
        &vault.join(".anchor/config/vault.toml"),
        r#"name = "Anchor Demo Vault"
version = "0.1.0"
source_of_truth = "markdown"
projection = ".anchor/cache/index.sqlite"
"#,
    )?;
    write_seed_file(
        &vault.join(".anchor/config/agent-spec.toml"),
        r#"default_mode = "ask"
allowed_outputs = ["draft", "reference", "proposal", "proposed_change"]
write_boundary = "notes_operation_core"
"#,
    )?;
    write_seed_file(
        &vault.join(".anchor/operations/operations.jsonl"),
        &format!(
            "{}\n",
            operation_value(json!({
                "actorId": "system",
                "actorType": "system",
                "approvalState": "accepted",
                "baseRevisions": {},
                "graphImpactSummary": "Demo vault seeded from Markdown assets.",
                "mode": "manual",
                "operationType": "seed_golden_vault",
                "provenance": "suites/anchor/desktop/demo/vault",
                "resultingRevisions": {},
                "targetNoteIds": []
            }))
        ),
    )?;

    let now = "2026-05-24T10:00:00+08:00";
    write_seed_file(
        &vault.join("journals/2026/05/2026-05-24.md"),
        &serialize_markdown(
            &json!({
                "id": "journal_2026_05_24",
                "kind": "journal",
                "title": "2026-05-24",
                "created": now,
                "updated": now,
                "journalDate": "2026-05-24",
                "aliases": ["Today"],
                "tags": ["journal"],
                "properties": {}
            }),
            "# 2026-05-24\n\n- [x] Open Anchor V1 golden vault\n- [ ] Review [[Anchor V1]] readiness evidence\n\nToday links product work back to [[Local-first notes]].\n",
        ),
    )?;
    write_seed_file(
        &vault.join("notes/anchor-v1.md"),
        &serialize_markdown(
            &json!({
                "id": "note_anchor_v1",
                "kind": "note",
                "title": "Anchor V1",
                "created": now,
                "updated": now,
                "type": "Project",
                "aliases": ["Anchor"],
                "tags": ["product"],
                "properties": { "repository": "[[labs]]", "status": "active" }
            }),
            "# Anchor V1\n\nAnchor keeps Markdown files as the source of truth while rebuilding a SQLite projection on open.\n\n## Demo checklist\n\n- [x] Create a local vault\n- [x] Edit Markdown in one auto-saving surface\n- [x] Search #product notes\n- [ ] Accept an agent Proposed Change\n\nRelations: [[Local-first notes]], [[Investor demo]], [[Kent Beck]].\n\n```md\n[[Anchor V1]] and #product inside code must not become graph edges.\n```\n\n| Area | Boundary |\n| --- | --- |\n| Body | Markdown |\n| Projection | Rebuildable SQLite |\n",
        ),
    )?;
    write_seed_file(
        &vault.join("notes/local-first-notes.md"),
        &serialize_markdown(
            &json!({
                "id": "note_local_first",
                "kind": "note",
                "title": "Local-first notes",
                "created": now,
                "updated": now,
                "aliases": ["Offline core"],
                "tags": ["architecture"],
                "properties": { "status": "active" }
            }),
            "# Local-first notes\n\nThe vault remains useful without a provider: writing, links, tags, properties, search, and Local Graph all work offline.\n\nAnchor V1 remains the demo target while the vault stays usable without a provider.\n",
        ),
    )?;
    write_seed_file(
        &vault.join("notes/investor-demo.md"),
        &serialize_markdown(
            &json!({
                "id": "note_investor_demo",
                "kind": "note",
                "title": "Investor demo",
                "created": now,
                "updated": now,
                "type": "Project",
                "aliases": [],
                "tags": ["demo"],
                "properties": { "owner": "[[Anchor V1]]", "status": "ready" }
            }),
            "# Investor demo\n\nThe demo walks from Journal to Note editing, Search, Object browsing, Local Graph, and agent-safe Proposed Change approval.\n",
        ),
    )?;
    write_seed_file(
        &vault.join("notes/kent-beck.md"),
        &serialize_markdown(
            &json!({
                "id": "note_kent_beck",
                "kind": "note",
                "title": "Kent Beck",
                "created": now,
                "updated": now,
                "type": "Person",
                "aliases": [],
                "tags": ["person"],
                "properties": { "role": "author" }
            }),
            "# Kent Beck\n\nReferenced by the property-link fixture for Project and Book object examples.\n",
        ),
    )?;

    // Long-form showcase notes — the committed Markdown file is the single source
    // of truth (frontmatter + body written verbatim). Embedded via include_str!
    // so a destructive re-seed reproduces them instead of deleting them. Paths are
    // relative to this file: suites/anchor/core/src/vault.rs -> suites/anchor/desktop/demo/vault.
    write_seed_file(
        &vault.join("notes/crdt-reading-notes.md"),
        include_str!("../../desktop/demo/vault/notes/crdt-reading-notes.md"),
    )?;
    write_seed_file(
        &vault.join("notes/postgres-slow-query-playbook.md"),
        include_str!("../../desktop/demo/vault/notes/postgres-slow-query-playbook.md"),
    )?;

    Ok(())
}

pub fn write_seed_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut file = File::create(path).map_err(|error| error.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|error| error.to_string())
}

pub fn write_file_if_missing(path: &Path, content: &str) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut file = File::create(path).map_err(|error| error.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|error| error.to_string())
}

// ---------------------------------------------------------------------------
// Operation log
// ---------------------------------------------------------------------------

pub fn load_operations(vault: &Path) -> Result<Vec<Value>, String> {
    let path = vault.join(".anchor/operations/operations.jsonl");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut operations = Vec::new();
    for line in raw.lines() {
        if let Ok(value) = serde_json::from_str::<Value>(line) {
            operations.push(value);
        }
    }
    operations.reverse();
    Ok(operations)
}

pub fn append_operation(vault: &Path, model: &mut Model, operation: Value) -> Result<(), String> {
    let path = vault.join(".anchor/operations/operations.jsonl");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    writeln!(file, "{}", operation).map_err(|error| error.to_string())?;
    model.operations.insert(0, operation);
    Ok(())
}

// ---------------------------------------------------------------------------
// SQLite projection
// ---------------------------------------------------------------------------

pub fn rebuild_sqlite_projection(vault: &Path, notes: &[Value]) -> Result<(), String> {
    let cache_dir = vault.join(".anchor/cache");
    fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
    let db_path = cache_dir.join("index.sqlite");
    if db_path.exists() {
        fs::remove_file(&db_path).map_err(|error| error.to_string())?;
    }

    let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
    conn.execute_batch(
        "
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT NOT NULL,
          type TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          file_checksum TEXT NOT NULL,
          body_checksum TEXT NOT NULL,
          indexed_at TEXT NOT NULL
        );
        CREATE TABLE note_aliases (note_id TEXT NOT NULL, alias TEXT NOT NULL);
        CREATE TABLE note_tags (note_id TEXT NOT NULL, tag TEXT NOT NULL);
        CREATE TABLE note_properties (note_id TEXT NOT NULL, key TEXT NOT NULL, normalized_value TEXT NOT NULL);
        CREATE TABLE links (from_note_id TEXT NOT NULL, raw_target TEXT NOT NULL, resolved_note_id TEXT, source TEXT NOT NULL, status TEXT NOT NULL);
        CREATE TABLE index_errors (path TEXT NOT NULL, error_type TEXT NOT NULL, summary TEXT NOT NULL);
        ",
    )
    .map_err(|error| error.to_string())?;

    let indexed_at = now_iso();
    for note in notes {
        conn.execute(
            "INSERT INTO notes (id, kind, path, title, type, created, updated, file_checksum, body_checksum, indexed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                note_id(note),
                kind(note),
                note["filePath"].as_str().unwrap_or(""),
                title(note),
                string_at(&note["metadata"], "type"),
                string_at(&note["metadata"], "created").unwrap_or(""),
                string_at(&note["metadata"], "updated").unwrap_or(""),
                revision(note),
                stable_hash(note["body"].as_str().unwrap_or("")),
                indexed_at,
            ],
        )
        .map_err(|error| error.to_string())?;

        for alias in note["metadata"]["aliases"]
            .as_array()
            .cloned()
            .unwrap_or_default()
        {
            conn.execute(
                "INSERT INTO note_aliases (note_id, alias) VALUES (?1, ?2)",
                params![note_id(note), alias.as_str().unwrap_or("")],
            )
            .map_err(|error| error.to_string())?;
        }
        for tag in metadata_tags(note) {
            conn.execute(
                "INSERT INTO note_tags (note_id, tag) VALUES (?1, ?2)",
                params![note_id(note), tag],
            )
            .map_err(|error| error.to_string())?;
        }
        if let Some(properties) = note["metadata"]["properties"].as_object() {
            for (key, value) in properties {
                conn.execute(
                    "INSERT INTO note_properties (note_id, key, normalized_value) VALUES (?1, ?2, ?3)",
                    params![note_id(note), key, value.as_str().unwrap_or("")],
                )
                .map_err(|error| error.to_string())?;
            }
        }
    }

    for link in extract_links(notes) {
        conn.execute(
            "INSERT INTO links (from_note_id, raw_target, resolved_note_id, source, status) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                string_at(&link, "fromNoteId").unwrap_or(""),
                string_at(&link, "rawTarget").unwrap_or(""),
                string_at(&link, "resolvedNoteId"),
                string_at(&link, "source").unwrap_or("manual_link"),
                string_at(&link, "status").unwrap_or("unresolved"),
            ],
        )
        .map_err(|error| error.to_string())?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Workspace / diagnostics
// ---------------------------------------------------------------------------

pub fn locate_workspace_root() -> Result<PathBuf, String> {
    let mut candidates = vec![std::env::current_dir().map_err(|error| error.to_string())?];
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            candidates.push(parent.to_path_buf());
        }
    }

    for candidate in candidates {
        let mut current = candidate;
        loop {
            if current.join("desktop/demo/vault/notes").is_dir()
                && current.join("Cargo.toml").is_file()
            {
                return Ok(current);
            }
            if !current.pop() {
                break;
            }
        }
    }

    Err("workspace_root_not_found".to_string())
}

pub fn diagnostics_value(model: &Model) -> Value {
    let current_vault = model
        .vault_path
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());
    json!({
        "appVersion": "0.1.0",
        "backend": "tauri",
        "cachePath": model.vault_path.as_ref().map(|path| path.join(".anchor/cache/index.sqlite").to_string_lossy().to_string()),
        "currentVault": current_vault,
        "health": if model.vault_path.is_some() { "ok" } else { "degraded" },
        "indexStatus": if model.vault_path.is_some() { model.index_status.as_str() } else { "not_open" },
        "platform": std::env::consts::OS,
        "warnings": if model.vault_path.is_some() { Vec::<String>::new() } else { vec!["Load the demo vault to rebuild the local projection.".to_string()] }
    })
}

// ---------------------------------------------------------------------------
// Model guard helpers
// ---------------------------------------------------------------------------

pub fn require_open_model(model: &Model) -> Result<(), String> {
    if model.vault_path.is_none() {
        Err("vault_not_open".to_string())
    } else {
        Ok(())
    }
}

pub fn require_vault(model: &Model) -> Result<PathBuf, String> {
    model
        .vault_path
        .clone()
        .ok_or_else(|| "vault_not_open".to_string())
}

pub fn lock_error<T>(error: std::sync::PoisonError<T>) -> String {
    error.to_string()
}

pub fn find_note<'a>(model: &'a Model, target_id: &str) -> Result<&'a Value, String> {
    model
        .notes
        .iter()
        .find(|note| note_id(note) == target_id)
        .ok_or_else(|| format!("note_not_found:{target_id}"))
}

pub fn find_note_index(model: &Model, target_id: &str) -> Result<usize, String> {
    model
        .notes
        .iter()
        .position(|note| note_id(note) == target_id)
        .ok_or_else(|| format!("note_not_found:{target_id}"))
}

pub fn find_proposed_change_index(model: &Model, target_id: &str) -> Result<usize, String> {
    model
        .proposed_changes
        .iter()
        .position(|proposed| string_at(proposed, "id") == Some(target_id))
        .ok_or_else(|| format!("proposed_change_not_found:{target_id}"))
}
