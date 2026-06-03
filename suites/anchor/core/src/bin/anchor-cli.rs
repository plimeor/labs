/// Anchor CLI binary.
///
/// Global I/O contract (spec §Global I/O contract):
///   --vault <path>  |  $ANCHOR_VAULT  |  upward discovery from cwd
///   --format tsv|json   (tsv default; json = single valid document incl. errors)
///   --fields a,b,c      field selection
///   --limit N           row cap
///   --count             print {"count":N} instead of rows
///
/// Exit codes: 0 ok · 1 usage · 2 not_found · 3 conflict · 4 blocked
///             5 vault_not_open · 6 io
///
/// # HTTP bridge — `anchor serve`
///
/// Binds to localhost only (dev tool). Holds ONE resident Model behind a
/// tokio Mutex (loaded once at startup). See `anchor_core::serve` for the full
/// route table and implementation.
use anchor_core::{
    core,
    vault::{ensure_vault_structure, locate_workspace_root, rebuild_vault},
    CoreError, Model,
};
use clap::{Parser, Subcommand};
use serde_json::{json, Value};
use std::io::{self, Read};
use std::path::PathBuf;
use std::process;

// ---------------------------------------------------------------------------
// Clap: top-level CLI
// ---------------------------------------------------------------------------

#[derive(Parser, Debug)]
#[command(
    name = "anchor",
    bin_name = "anchor",
    version = env!("CARGO_PKG_VERSION"),
    about = "Anchor vault CLI",
    long_about = "Command-line interface to the Anchor vault.\n\n\
                  Vault resolution order:\n  \
                  1. --vault <path>\n  \
                  2. $ANCHOR_VAULT environment variable\n  \
                  3. Upward discovery from current working directory"
)]
struct Cli {
    /// Path to the Anchor vault directory.
    /// Falls back to $ANCHOR_VAULT, then upward discovery from cwd.
    #[arg(long, env = "ANCHOR_VAULT", global = true)]
    vault: Option<PathBuf>,

    /// Output format: tsv (human-readable default) or json (machine-readable).
    #[arg(long, default_value = "tsv", global = true)]
    format: String,

    /// Comma-separated list of fields to include in output (or "all").
    #[arg(long, global = true)]
    fields: Option<String>,

    /// Maximum number of results to return.
    #[arg(long, global = true)]
    limit: Option<usize>,

    /// Print only the count {"count": N} instead of full rows.
    #[arg(long, global = true)]
    count: bool,

    #[command(subcommand)]
    command: Option<Commands>,
}

// ---------------------------------------------------------------------------
// Subcommand tree
// ---------------------------------------------------------------------------

#[derive(Subcommand, Debug)]
enum Commands {
    /// Show full note object for a given ID.
    Show { id: String },

    /// Print exact note source body as {"content":"..."}.
    Cat { id: String },

    /// List all notes (summary view).
    List {
        /// Filter by kind (note, journal, reference, proposal).
        #[arg(long)]
        kind: Option<String>,
        /// Filter by type field.
        #[arg(long, name = "type")]
        note_type: Option<String>,
        /// Filter by tag.
        #[arg(long)]
        tag: Option<String>,
        /// Include archived notes in the listing.
        #[arg(long)]
        include_archived: bool,
        /// Include trashed notes in the listing.
        #[arg(long)]
        include_trashed: bool,
    },

    /// Full-text search across the vault.
    Search {
        query: String,
        /// Restrict scope (e.g. tag:<name>).
        #[arg(long)]
        scope: Option<String>,
        /// Filter by tag.
        #[arg(long)]
        tag: Option<String>,
        /// Filter by type.
        #[arg(long, name = "type")]
        note_type: Option<String>,
        /// Include archived notes in search results.
        #[arg(long)]
        include_archived: bool,
        /// Include trashed notes in search results.
        #[arg(long)]
        include_trashed: bool,
    },

    /// Search within a single note's body.
    SearchIn { id: String, query: String },

    /// Create a new note (body from stdin).
    Create {
        /// Note title.
        #[arg(long)]
        title: Option<String>,
        /// Note type (e.g. Project, Person).
        #[arg(long, name = "type")]
        note_type: Option<String>,
        /// Note kind (note, journal, reference, proposal).
        #[arg(long)]
        kind: Option<String>,
    },

    /// Append content to an existing note (body from stdin).
    Append {
        id: String,
        /// Prepend instead of append.
        #[arg(long)]
        prepend: bool,
        /// Expected current revision; mismatch -> conflict.
        #[arg(long)]
        if_match: Option<String>,
    },

    /// Find-and-replace text in a note.
    Edit {
        id: String,
        /// Text to find.
        #[arg(long)]
        find: String,
        /// Replacement text (omit to delete).
        #[arg(long)]
        replace: Option<String>,
        /// Expected current revision.
        #[arg(long)]
        if_match: Option<String>,
    },

    /// Overwrite a note body completely (body from stdin).
    Overwrite {
        id: String,
        /// Expected current revision; mismatch -> conflict.
        #[arg(long)]
        if_match: Option<String>,
    },

    /// Tag management.
    Tag {
        id: String,
        #[command(subcommand)]
        action: TagAction,
    },

    /// Type management.
    Type {
        #[command(subcommand)]
        action: TypeAction,
    },

    /// Property management.
    Prop {
        #[command(subcommand)]
        action: PropAction,
    },

    /// Archive a note (soft-delete, descoped — no archive op in core yet).
    Archive { id: String },

    /// Move a note to trash (descoped — no trash op in core yet).
    Trash { id: String },

    /// Restore an archived/trashed note (descoped — no restore op in core yet).
    Restore { id: String },

    /// List outgoing links from a note.
    Links { id: String },

    /// List incoming links (backlinks) to a note.
    Backlinks { id: String },

    /// List unlinked plain-text mentions of a note title.
    Mentions { id: String },

    /// Journal commands.
    Journal {
        #[command(subcommand)]
        action: JournalAction,
    },

    /// Proposed-change / reference / change commands.
    Reference {
        #[command(subcommand)]
        action: ReferenceAction,
    },

    /// Proposal commands.
    Proposal {
        #[command(subcommand)]
        action: ProposalAction,
    },

    /// Change (proposed-change diff) commands.
    Change {
        #[command(subcommand)]
        action: ChangeAction,
    },

    /// Show graph neighborhood for a note.
    Graph {
        id: String,
        /// Traversal depth: 1 or 2 (default 1).
        #[arg(long, default_value = "1")]
        depth: u8,
    },

    /// List all defined object types and their notes.
    Types,

    /// Vault management commands.
    Vault {
        #[command(subcommand)]
        action: VaultAction,
    },

    /// Rebuild the SQLite index projection.
    IndexRebuild,

    /// Run vault diagnostics.
    Doctor,

    /// List operation records (audit log).
    Ops,

    /// Print version and build information.
    Version,

    /// Start the Axum HTTP bridge (dev-only, localhost).
    ///
    /// Loads the vault once into a resident Model and exposes the op registry
    /// over HTTP. See the module-level doc for the full route table.
    ///
    /// Usage:  anchor serve --vault <path>
    ///         anchor serve --http 127.0.0.1:4317
    Serve {
        /// Address to bind (default: 127.0.0.1:4317).
        #[arg(long, default_value = "127.0.0.1:4317")]
        http: String,
    },
}

// ---------------------------------------------------------------------------
// Sub-enums for nested commands
// ---------------------------------------------------------------------------

#[derive(Subcommand, Debug)]
enum TagAction {
    /// Add a tag to a note.
    Add { tag: String },
    /// Remove a tag from a note.
    Rm { tag: String },
}

#[derive(Subcommand, Debug)]
enum TypeAction {
    /// Set the type field of a note.
    Set { id: String, note_type: String },
}

#[derive(Subcommand, Debug)]
enum PropAction {
    /// Set a property key=value on a note.
    Set {
        id: String,
        key: String,
        value: Option<String>,
    },
    /// Remove a property from a note.
    Rm { id: String, key: String },
}

#[derive(Subcommand, Debug)]
enum JournalAction {
    /// Open or create today's journal entry.
    Today,
    /// Open journal entry for a specific date (YYYY-MM-DD).
    Open { date: String },
}

#[derive(Subcommand, Debug)]
enum ReferenceAction {
    /// Create a new reference note (body from stdin).
    Create {
        #[arg(long)]
        title: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
enum ProposalAction {
    /// List all proposed changes.
    List,
    /// Create a new proposed change (body from stdin).
    Create {
        #[arg(long)]
        note_id: String,
        #[arg(long, default_value = "ask")]
        mode: String,
        #[arg(long, default_value = "cli")]
        provenance: String,
    },
    /// Accept a proposed change.
    Accept { id: String },
    /// Reject a proposed change.
    Reject { id: String },
}

#[derive(Subcommand, Debug)]
enum ChangeAction {
    /// Show a proposed change.
    Show { id: String },
    /// Apply (accept) a proposed change.
    Apply { id: String },
    /// Reject a proposed change.
    Reject { id: String },
}

#[derive(Subcommand, Debug)]
enum VaultAction {
    /// Open (or create) a vault at the given path.
    Open { path: PathBuf },
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

fn is_json(cli: &Cli) -> bool {
    cli.format.to_lowercase() == "json"
}

fn print_output(value: &Value, cli: &Cli) {
    if is_json(cli) {
        println!("{}", serde_json::to_string(value).unwrap_or_default());
    } else {
        // TSV: best-effort human rendering
        match value {
            Value::Array(items) => {
                for item in items {
                    println!("{}", tsv_row(item));
                }
            }
            _ => println!("{}", tsv_row(value)),
        }
    }
}

fn tsv_row(value: &Value) -> String {
    match value {
        Value::Object(map) => map
            .values()
            .map(|v| tsv_cell(v))
            .collect::<Vec<_>>()
            .join("\t"),
        _ => tsv_cell(value),
    }
}

fn tsv_cell(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn print_error(err: &CoreError, json_mode: bool) {
    if json_mode {
        let envelope = json!({"error": {"code": err.code(), "message": err.message()}});
        println!("{}", serde_json::to_string(&envelope).unwrap_or_default());
    } else {
        eprintln!("error [{}]: {}", err.code(), err.message());
    }
}

fn apply_fields(value: Value, fields: &Option<String>) -> Value {
    let Some(fields_str) = fields else {
        return value;
    };
    if fields_str == "all" {
        return value;
    }
    let keys: Vec<&str> = fields_str.split(',').map(str::trim).collect();
    match value {
        Value::Array(items) => Value::Array(
            items
                .into_iter()
                .map(|item| filter_object_fields(item, &keys))
                .collect(),
        ),
        obj @ Value::Object(_) => filter_object_fields(obj, &keys),
        other => other,
    }
}

fn filter_object_fields(value: Value, keys: &[&str]) -> Value {
    match value {
        Value::Object(map) => {
            let filtered: serde_json::Map<String, Value> = map
                .into_iter()
                .filter(|(k, _)| keys.contains(&k.as_str()))
                .collect();
            Value::Object(filtered)
        }
        other => other,
    }
}

fn read_stdin() -> String {
    let mut buf = String::new();
    io::stdin().read_to_string(&mut buf).unwrap_or_default();
    buf
}

// ---------------------------------------------------------------------------
// Vault resolution
// ---------------------------------------------------------------------------

fn resolve_vault(cli_vault: &Option<PathBuf>) -> Result<PathBuf, CoreError> {
    if let Some(path) = cli_vault {
        return Ok(path.clone());
    }
    // upward discovery
    if let Ok(root) = locate_workspace_root() {
        let candidate = root.join("desktop/demo/vault");
        // The .anchor/config is git-ignored and regenerated on load, so key the
        // default-discovery check off the committed `notes/` dir instead.
        if candidate.join("notes").is_dir() {
            return Ok(candidate);
        }
    }
    Err(CoreError::VaultNotOpen)
}

fn load_model(vault: &PathBuf) -> Result<Model, CoreError> {
    let mut model = Model::default();
    rebuild_vault(vault, &mut model).map_err(|e| CoreError::Io(e))?;
    Ok(model)
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

fn main() {
    let cli = Cli::parse();
    let json_mode = is_json(&cli);

    // `serve` needs an async tokio runtime; all other commands are sync.
    if let Some(Commands::Serve { http }) = &cli.command {
        let vault = match resolve_vault(&cli.vault) {
            Ok(v) => v,
            Err(err) => {
                print_error(&err, json_mode);
                process::exit(err.exit_code());
            }
        };
        let addr = http.clone();
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        if let Err(err) = rt.block_on(anchor_core::serve::serve_http(vault, addr)) {
            print_error(&err, json_mode);
            process::exit(err.exit_code());
        }
        return;
    }

    let result = run(&cli, json_mode);
    match result {
        Ok(()) => process::exit(0),
        Err(err) => {
            print_error(&err, json_mode);
            process::exit(err.exit_code());
        }
    }
}

fn run(cli: &Cli, json_mode: bool) -> Result<(), CoreError> {
    match &cli.command {
        // ------------------------------------------------------------------ version
        Some(Commands::Version) | None => {
            let v = json!({
                "version": env!("CARGO_PKG_VERSION"),
                "name": "anchor"
            });
            if json_mode {
                println!("{}", serde_json::to_string(&v).unwrap_or_default());
            } else {
                println!("anchor {}", env!("CARGO_PKG_VERSION"));
            }
            Ok(())
        }

        // ------------------------------------------------------------------ vault open
        Some(Commands::Vault {
            action: VaultAction::Open { path },
        }) => {
            ensure_vault_structure(path).map_err(|e| CoreError::Io(e))?;
            let mut model = Model::default();
            core::open_vault(path.to_string_lossy().to_string(), &mut model)?;
            let diag = core::diagnostics(&model)?;
            print_output(&diag, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ doctor
        Some(Commands::Doctor) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            let diag = core::diagnostics(&model)?;
            print_output(&diag, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ index rebuild
        Some(Commands::IndexRebuild) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            anchor_core::vault::rebuild_sqlite_projection(&vault, &model.notes)
                .map_err(|e| CoreError::Io(e))?;
            let out = json!({"status": "ok", "notes": model.notes.len()});
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ types
        Some(Commands::Types) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            let types = core::get_object_types(&model)?;
            let mut out = Value::Array(types);
            if cli.count {
                out = json!({"count": out.as_array().map(|a| a.len()).unwrap_or(0)});
                print_output(&out, cli);
                return Ok(());
            }
            out = apply_fields(out, &cli.fields);
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ ops
        Some(Commands::Ops) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            let mut ops = core::list_operation_records(&model)?;
            if let Some(limit) = cli.limit {
                ops.truncate(limit);
            }
            let mut out = Value::Array(ops);
            if cli.count {
                out = json!({"count": out.as_array().map(|a| a.len()).unwrap_or(0)});
                print_output(&out, cli);
                return Ok(());
            }
            out = apply_fields(out, &cli.fields);
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ show
        Some(Commands::Show { id }) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            let note = core::read_note(id.clone(), &model)?;
            let out = apply_fields(note, &cli.fields);
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ cat
        Some(Commands::Cat { id }) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            let note = core::read_note(id.clone(), &model)?;
            let body = note["body"].as_str().unwrap_or("").to_string();
            let out = json!({"content": body});
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ list
        Some(Commands::List {
            kind,
            note_type,
            tag,
            include_archived,
            include_trashed,
        }) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            // Use list_notes_all when any include flag is set so we can post-filter.
            // list_notes (the Tauri-compatible version) always excludes archived+trashed.
            let mut notes = if *include_archived || *include_trashed {
                core::list_notes_all(&model)?
            } else {
                core::list_notes(&model)?
            };

            // When opted in, filter to include only the requested statuses plus active.
            if *include_archived || *include_trashed {
                notes.retain(|n| {
                    let s = n["status"].as_str().unwrap_or("active");
                    s == "active"
                        || (*include_archived && s == "archived")
                        || (*include_trashed && s == "trashed")
                });
            }

            // Apply field filters
            if let Some(k) = kind {
                notes.retain(|n| n["kind"].as_str().unwrap_or("") == k);
            }
            if let Some(t) = note_type {
                notes.retain(|n| n["type"].as_str().unwrap_or("") == t);
            }
            if let Some(tg) = tag {
                notes.retain(|n| {
                    n["tags"]
                        .as_array()
                        .map(|arr| arr.iter().any(|v| v.as_str().unwrap_or("") == tg))
                        .unwrap_or(false)
                });
            }

            if let Some(limit) = cli.limit {
                notes.truncate(limit);
            }

            if cli.count {
                let out = json!({"count": notes.len()});
                print_output(&out, cli);
                return Ok(());
            }

            let out = apply_fields(Value::Array(notes), &cli.fields);
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ search
        Some(Commands::Search {
            query,
            scope,
            tag,
            note_type,
            include_archived,
            include_trashed,
        }) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;

            let limit = cli.limit.unwrap_or(30) as u64;
            let mut request = json!({
                "query": query,
                "limit": limit
            });
            if let Some(tg) = tag {
                request["tag"] = json!(tg);
            }
            if let Some(t) = note_type {
                request["type"] = json!(t);
            }
            if let Some(sc) = scope {
                // scope format: "kind:value" e.g. "tag:idea"
                if let Some((kind_key, kind_val)) = sc.split_once(':') {
                    request["scope"] = json!({"kind": kind_key, "value": kind_val});
                }
            }
            // Build the include array for note_matches_filters.
            let mut include_statuses: Vec<serde_json::Value> = Vec::new();
            if *include_archived {
                include_statuses.push(json!("archived"));
            }
            if *include_trashed {
                include_statuses.push(json!("trashed"));
            }
            if !include_statuses.is_empty() {
                request["include"] = json!(include_statuses);
            }

            let results = core::search_notes(request, &model)?;
            let count = results.len();

            if cli.count {
                let out = json!({"count": count});
                print_output(&out, cli);
                return Ok(());
            }

            let out = apply_fields(Value::Array(results), &cli.fields);
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ search-in
        Some(Commands::SearchIn { id, query }) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            let note = core::read_note(id.clone(), &model)?;
            let body = note["body"].as_str().unwrap_or("");
            let q = query.to_lowercase();
            let mut matches: Vec<Value> = Vec::new();
            for (line_no, line) in body.lines().enumerate() {
                if line.to_lowercase().contains(&q) {
                    matches.push(json!({
                        "line": line_no + 1,
                        "text": line
                    }));
                }
            }

            if cli.count {
                let out = json!({"count": matches.len()});
                print_output(&out, cli);
                return Ok(());
            }

            let out = apply_fields(Value::Array(matches), &cli.fields);
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ create
        Some(Commands::Create {
            title,
            note_type,
            kind,
        }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;

            let body = read_stdin();
            let mut input = json!({});
            if let Some(t) = title {
                input["title"] = json!(t);
            }
            if let Some(t) = note_type {
                input["type"] = json!(t);
            }
            if !body.trim().is_empty() {
                input["body"] = json!(body.trim_end());
            }
            // kind is informational for now; create_note defaults to "note"
            let _ = kind;

            let note = core::create_note(input, &mut model, &vault)?;
            let note_id = anchor_core::domain::note_id(&note).to_string();
            let revision = anchor_core::domain::revision(&note).to_string();
            let path = note["filePath"].as_str().unwrap_or("").to_string();
            let out = json!({"id": note_id, "revision": revision, "path": path});
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ append
        Some(Commands::Append {
            id,
            prepend,
            if_match,
        }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;

            let extra = read_stdin();
            let note = core::read_note(id.clone(), &model)?;
            let current_rev = anchor_core::domain::revision(&note).to_string();

            if let Some(expected) = if_match {
                if &current_rev != expected {
                    return Err(CoreError::Conflict(format!(
                        "revision mismatch: expected {expected}, got {current_rev}"
                    )));
                }
            }

            let old_body = note["body"].as_str().unwrap_or("").to_string();
            let new_body = if *prepend {
                format!("{}\n{}", extra.trim_end(), old_body)
            } else {
                format!("{}\n{}", old_body.trim_end(), extra.trim_end())
            };

            let input = json!({
                "noteId": id,
                "baseRevision": current_rev,
                "body": new_body
            });
            let updated = core::update_note(input, &mut model, &vault)?;
            let rev = anchor_core::domain::revision(&updated).to_string();
            let out = json!({"id": id, "revision": rev, "path": updated["filePath"]});
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ edit (find/replace)
        Some(Commands::Edit {
            id,
            find,
            replace,
            if_match,
        }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;

            let note = core::read_note(id.clone(), &model)?;
            let current_rev = anchor_core::domain::revision(&note).to_string();

            if let Some(expected) = if_match {
                if &current_rev != expected {
                    return Err(CoreError::Conflict(format!(
                        "revision mismatch: expected {expected}, got {current_rev}"
                    )));
                }
            }

            let old_body = note["body"].as_str().unwrap_or("").to_string();
            let replacement = replace.as_deref().unwrap_or("");
            let new_body = old_body.replacen(find.as_str(), replacement, 1);

            if new_body == old_body {
                return Err(CoreError::NotFound(format!(
                    "pattern not found in note {id}: {find}"
                )));
            }

            let input = json!({
                "noteId": id,
                "baseRevision": current_rev,
                "body": new_body
            });
            let updated = core::update_note(input, &mut model, &vault)?;
            let rev = anchor_core::domain::revision(&updated).to_string();
            let out = json!({"id": id, "revision": rev, "path": updated["filePath"]});
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ overwrite
        Some(Commands::Overwrite { id, if_match }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;

            let note = core::read_note(id.clone(), &model)?;
            let current_rev = anchor_core::domain::revision(&note).to_string();

            if let Some(expected) = if_match {
                if &current_rev != expected {
                    return Err(CoreError::Conflict(format!(
                        "revision mismatch: expected {expected}, got {current_rev}"
                    )));
                }
            }

            let new_body = read_stdin();
            let input = json!({
                "noteId": id,
                "baseRevision": current_rev,
                "body": new_body.trim_end()
            });
            let updated = core::update_note(input, &mut model, &vault)?;
            let rev = anchor_core::domain::revision(&updated).to_string();
            let path = updated["filePath"].as_str().unwrap_or("").to_string();
            let out = json!({"id": id, "revision": rev, "path": path});
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ tag add/rm
        Some(Commands::Tag { id, action }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;

            let note = core::read_note(id.clone(), &model)?;
            let current_rev = anchor_core::domain::revision(&note).to_string();
            let mut tags: Vec<String> = note["metadata"]["tags"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect();

            match action {
                TagAction::Add { tag } => {
                    if !tags.contains(tag) {
                        tags.push(tag.clone());
                    }
                }
                TagAction::Rm { tag } => {
                    tags.retain(|t| t != tag);
                }
            }

            let input = json!({
                "noteId": id,
                "baseRevision": current_rev,
                "metadataPatch": { "tags": tags }
            });
            let updated = core::update_note(input, &mut model, &vault)?;
            let rev = anchor_core::domain::revision(&updated).to_string();
            let out = json!({"id": id, "revision": rev, "path": updated["filePath"]});
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ type set
        Some(Commands::Type {
            action: TypeAction::Set { id, note_type },
        }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;

            let note = core::read_note(id.clone(), &model)?;
            let current_rev = anchor_core::domain::revision(&note).to_string();

            let input = json!({
                "noteId": id,
                "baseRevision": current_rev,
                "metadataPatch": { "type": note_type }
            });
            let updated = core::update_note(input, &mut model, &vault)?;
            let rev = anchor_core::domain::revision(&updated).to_string();
            let out = json!({"id": id, "revision": rev, "path": updated["filePath"]});
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ prop set/rm
        Some(Commands::Prop { action }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;

            match action {
                PropAction::Set { id, key, value } => {
                    let note = core::read_note(id.clone(), &model)?;
                    let current_rev = anchor_core::domain::revision(&note).to_string();
                    let mut props = note["metadata"]["properties"]
                        .as_object()
                        .cloned()
                        .unwrap_or_default();
                    props.insert(key.clone(), json!(value.as_deref().unwrap_or("")));

                    let input = json!({
                        "noteId": id,
                        "baseRevision": current_rev,
                        "metadataPatch": { "properties": props }
                    });
                    let updated = core::update_note(input, &mut model, &vault)?;
                    let rev = anchor_core::domain::revision(&updated).to_string();
                    let out = json!({"id": id, "revision": rev, "path": updated["filePath"]});
                    print_output(&out, cli);
                }
                PropAction::Rm { id, key } => {
                    let note = core::read_note(id.clone(), &model)?;
                    let current_rev = anchor_core::domain::revision(&note).to_string();
                    let mut props = note["metadata"]["properties"]
                        .as_object()
                        .cloned()
                        .unwrap_or_default();
                    props.remove(key);

                    let input = json!({
                        "noteId": id,
                        "baseRevision": current_rev,
                        "metadataPatch": { "properties": props }
                    });
                    let updated = core::update_note(input, &mut model, &vault)?;
                    let rev = anchor_core::domain::revision(&updated).to_string();
                    let out = json!({"id": id, "revision": rev, "path": updated["filePath"]});
                    print_output(&out, cli);
                }
            }
            Ok(())
        }

        // ------------------------------------------------------------------ archive
        Some(Commands::Archive { id }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;
            let note = core::read_note(id.clone(), &model)?;
            let current_rev = anchor_core::domain::revision(&note).to_string();
            // --if-match is not yet a flag on Archive; honour it via the read above as
            // a no-op guard (the note must exist).
            let _ = current_rev;
            let result = core::archive_note(id.clone(), &mut model, &vault)?;
            print_output(&result, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ trash
        Some(Commands::Trash { id }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;
            let result = core::trash_note(id.clone(), &mut model, &vault)?;
            print_output(&result, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ restore
        Some(Commands::Restore { id }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;
            let result = core::restore_note(id.clone(), &mut model, &vault)?;
            print_output(&result, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ links
        Some(Commands::Links { id }) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            let links = core::get_links(id.clone(), &model)?;
            let out = apply_fields(Value::Array(links), &cli.fields);
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ backlinks
        Some(Commands::Backlinks { id }) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            let links = core::get_backlinks(id.clone(), &model)?;
            let out = apply_fields(Value::Array(links), &cli.fields);
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ mentions
        Some(Commands::Mentions { id }) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            let mentions = core::get_unlinked_mentions(id.clone(), &model)?;
            let out = apply_fields(Value::Array(mentions), &cli.fields);
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ journal today
        Some(Commands::Journal {
            action: JournalAction::Today,
        }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;
            let note = core::open_today_journal(&mut model, &vault)?;
            let out = apply_fields(note, &cli.fields);
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ journal open <date>
        Some(Commands::Journal {
            action: JournalAction::Open { date },
        }) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            // Find existing journal for date, or return not-found
            let note = model
                .notes
                .iter()
                .find(|n| {
                    n["metadata"]["kind"] == "journal"
                        && n["metadata"]["journalDate"].as_str().unwrap_or("") == date
                })
                .cloned()
                .ok_or_else(|| CoreError::NotFound(format!("journal_not_found:{date}")))?;
            let out = apply_fields(note, &cli.fields);
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ graph
        Some(Commands::Graph { id, depth }) => {
            let vault = resolve_vault(&cli.vault)?;
            let model = load_model(&vault)?;
            let graph = core::get_graph_neighborhood(id.clone(), *depth, &model)?;
            print_output(&graph, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ reference create
        Some(Commands::Reference {
            action: ReferenceAction::Create { title },
        }) => {
            let vault = resolve_vault(&cli.vault)?;
            let mut model = load_model(&vault)?;

            let body = read_stdin();
            let mut input = json!({"kind": "reference"});
            if let Some(t) = title {
                input["title"] = json!(t);
            }
            if !body.trim().is_empty() {
                input["body"] = json!(body.trim_end());
            }
            let note = core::create_note(input, &mut model, &vault)?;
            let note_id = anchor_core::domain::note_id(&note).to_string();
            let revision = anchor_core::domain::revision(&note).to_string();
            let path = note["filePath"].as_str().unwrap_or("").to_string();
            let out = json!({"id": note_id, "revision": revision, "path": path});
            print_output(&out, cli);
            Ok(())
        }

        // ------------------------------------------------------------------ proposal list / create / accept / reject
        Some(Commands::Proposal { action }) => {
            let vault = resolve_vault(&cli.vault)?;
            match action {
                ProposalAction::List => {
                    let model = load_model(&vault)?;
                    let proposals = core::get_proposed_changes(&model)?;
                    let out = apply_fields(Value::Array(proposals), &cli.fields);
                    print_output(&out, cli);
                }
                ProposalAction::Create {
                    note_id,
                    mode,
                    provenance,
                } => {
                    let mut model = load_model(&vault)?;
                    let body = read_stdin();
                    let input = json!({
                        "noteId": note_id,
                        "mode": mode,
                        "bodyAppend": body.trim_end(),
                        "provenance": provenance
                    });
                    let proposed = core::create_proposed_change(input, &mut model)?;
                    print_output(&proposed, cli);
                }
                ProposalAction::Accept { id } => {
                    let mut model = load_model(&vault)?;
                    let result = core::apply_proposed_change(id.clone(), &mut model, &vault)?;
                    print_output(&result, cli);
                }
                ProposalAction::Reject { id } => {
                    let mut model = load_model(&vault)?;
                    let result = core::reject_proposed_change(id.clone(), &mut model, &vault)?;
                    print_output(&result, cli);
                }
            }
            Ok(())
        }

        // ------------------------------------------------------------------ change show/apply/reject
        Some(Commands::Change { action }) => {
            let vault = resolve_vault(&cli.vault)?;
            match action {
                ChangeAction::Show { id } => {
                    let model = load_model(&vault)?;
                    let proposals = core::get_proposed_changes(&model)?;
                    let proposed = proposals
                        .into_iter()
                        .find(|p| p["id"].as_str().unwrap_or("") == id)
                        .ok_or_else(|| {
                            CoreError::NotFound(format!("proposed_change_not_found:{id}"))
                        })?;
                    print_output(&proposed, cli);
                }
                ChangeAction::Apply { id } => {
                    let mut model = load_model(&vault)?;
                    let result = core::apply_proposed_change(id.clone(), &mut model, &vault)?;
                    print_output(&result, cli);
                }
                ChangeAction::Reject { id } => {
                    let mut model = load_model(&vault)?;
                    let result = core::reject_proposed_change(id.clone(), &mut model, &vault)?;
                    print_output(&result, cli);
                }
            }
            Ok(())
        }

        // ------------------------------------------------------------------ serve
        // Handled before entering `run` (needs async runtime). Unreachable here.
        Some(Commands::Serve { .. }) => Ok(()),
    }
}
