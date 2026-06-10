//! `anchor` — the local structured command contract (D31 Phase-2).
//!
//! A pure dispatch shell over `anchor-core`: every write goes through
//! `Session` dispatch (the single validated chokepoint) and lands as one
//! immutable op segment; every read is materialized replay. The CLI defines
//! no truth vocabulary of its own — rows are projections of core DTOs.
//!
//! Global I/O contract: vault resolution (`--vault` / `$ANCHOR_VAULT` /
//! upward discovery), `--format tsv|json`, `--fields`, `--limit`, `--count`,
//! and fixed exit codes: 0 ok, 1 usage, 2 not_found, 3 conflict, 4 blocked,
//! 5 vault_not_open, 6 io. This is a local command contract, not MCP.

mod output;
mod vault;

use anchor_core::dto::{EditorIntent, Session, ValidationError};
use anchor_core::model::{Body, BodyState, Life, Node, TargetKind, Vault as MaterializedVault};
use anchor_core::{mirror, order};
use output::{Format, OutputOpts, Table};
use std::process::ExitCode;

const EXIT_OK: u8 = 0;
const EXIT_USAGE: u8 = 1;
const EXIT_NOT_FOUND: u8 = 2;
const EXIT_CONFLICT: u8 = 3;
const EXIT_BLOCKED: u8 = 4;
const EXIT_VAULT_NOT_OPEN: u8 = 5;
const EXIT_IO: u8 = 6;

struct Failure {
    code: u8,
    message: String,
}

impl Failure {
    fn usage(message: impl Into<String>) -> Failure {
        Failure {
            code: EXIT_USAGE,
            message: message.into(),
        }
    }
    fn not_found(message: impl Into<String>) -> Failure {
        Failure {
            code: EXIT_NOT_FOUND,
            message: message.into(),
        }
    }
    fn blocked(message: impl Into<String>) -> Failure {
        Failure {
            code: EXIT_BLOCKED,
            message: message.into(),
        }
    }
}

impl From<vault::VaultError> for Failure {
    fn from(err: vault::VaultError) -> Failure {
        let code = match err {
            vault::VaultError::NotOpen(_) => EXIT_VAULT_NOT_OPEN,
            vault::VaultError::Io(_) => EXIT_IO,
        };
        Failure {
            code,
            message: err.message().to_string(),
        }
    }
}

impl From<ValidationError> for Failure {
    fn from(err: ValidationError) -> Failure {
        Failure {
            code: EXIT_BLOCKED,
            message: format!("{}: {}", err.code(), err.message()),
        }
    }
}

const USAGE: &str = "anchor — local structured commands over an Anchor vault (apiVersion 1)

USAGE: anchor [GLOBALS] <COMMAND> [ARGS]

GLOBALS:
  --vault <path>        vault root (else $ANCHOR_VAULT, else upward discovery)
  --format <tsv|json>   output format (default tsv; json carries the apiVersion envelope)
  --fields <a,b,c>      project these row fields, in order
  --limit <n>           cap the row count
  --count               print only the row count

COMMANDS:
  init [path]                          create (or open) a vault
  notes                                list notes
  note <id>                            one note
  blocks <note_id>                     the note's block tree (depth-first)
  import <file.md>                     import markdown as a new note
  export <note_id | --all>             write the .md mirror to stdout
  move <id> --parent <id|root> [--after <id>]   reparent/reorder via dispatch
  type <id> (--set <type> | --clear)   set the primary type
  prop <id> <key> [--set <v> | --clear]  read or write one prop
  delete <id>                          trash (life = trashed; reversible)
  restore-subtree <id>                 restore a trashed subtree root
  restore-order <parent_id|root>       renormalize children order keys (F26)
  conflicts                            list open ConflictRecords (exit 3 when any)
  resolve <id> (--text <s> | --keep-winner | --keep-loser <op_id>)
  doctor                               vault diagnostics

EXIT CODES: 0 ok, 1 usage, 2 not_found, 3 conflict, 4 blocked, 5 vault_not_open, 6 io";

struct Cli {
    vault: Option<String>,
    opts: OutputOpts,
    args: Vec<String>,
}

fn parse_args() -> Result<Cli, Failure> {
    let mut raw = std::env::args().skip(1);
    let mut vault = None;
    let mut format = Format::Tsv;
    let mut fields = None;
    let mut limit = None;
    let mut count = false;
    let mut args = Vec::new();
    while let Some(arg) = raw.next() {
        match arg.as_str() {
            "--vault" => {
                vault = Some(raw.next().ok_or_else(|| Failure::usage("--vault needs a path"))?)
            }
            "--format" => {
                let value = raw.next().ok_or_else(|| Failure::usage("--format needs tsv|json"))?;
                format = match value.as_str() {
                    "tsv" => Format::Tsv,
                    "json" => Format::Json,
                    other => return Err(Failure::usage(format!("unknown format `{other}`"))),
                };
            }
            "--fields" => {
                let value = raw.next().ok_or_else(|| Failure::usage("--fields needs a list"))?;
                fields = Some(value.split(',').map(|s| s.trim().to_string()).collect());
            }
            "--limit" => {
                let value = raw.next().ok_or_else(|| Failure::usage("--limit needs a number"))?;
                limit = Some(
                    value
                        .parse::<usize>()
                        .map_err(|_| Failure::usage(format!("bad --limit `{value}`")))?,
                );
            }
            "--count" => count = true,
            "--help" | "-h" | "help" => return Err(Failure::usage(USAGE)),
            _ => args.push(arg),
        }
    }
    Ok(Cli {
        vault,
        opts: OutputOpts {
            format,
            fields,
            limit,
            count,
        },
        args,
    })
}

fn main() -> ExitCode {
    let cli = match parse_args() {
        Ok(cli) => cli,
        Err(failure) => return exit_with(failure),
    };
    match run(&cli) {
        Ok(code) => ExitCode::from(code),
        Err(failure) => exit_with(failure),
    }
}

fn exit_with(failure: Failure) -> ExitCode {
    eprintln!("{}", failure.message);
    ExitCode::from(failure.code)
}

fn run(cli: &Cli) -> Result<u8, Failure> {
    let Some(command) = cli.args.first() else {
        return Err(Failure::usage(USAGE));
    };
    let rest: Vec<&str> = cli.args[1..].iter().map(String::as_str).collect();
    match command.as_str() {
        "init" => cmd_init(cli, &rest),
        "notes" => cmd_notes(cli),
        "note" => cmd_note(cli, &rest),
        "blocks" => cmd_blocks(cli, &rest),
        "import" => cmd_import(cli, &rest),
        "export" => cmd_export(cli, &rest),
        "move" => cmd_move(cli, &rest),
        "type" => cmd_type(cli, &rest),
        "prop" => cmd_prop(cli, &rest),
        "delete" => cmd_life(cli, &rest, Life::Trashed, "delete"),
        "restore-subtree" => cmd_life(cli, &rest, Life::Active, "restore-subtree"),
        "restore-order" => cmd_restore_order(cli, &rest),
        "conflicts" => cmd_conflicts(cli),
        "resolve" => cmd_resolve(cli, &rest),
        "doctor" => cmd_doctor(cli),
        other => Err(Failure::usage(format!("unknown command `{other}`\n\n{USAGE}"))),
    }
}

fn open_session(cli: &Cli) -> Result<(vault::Vault, Session, usize), Failure> {
    let vault = vault::resolve(cli.vault.as_deref())?;
    let (session, len) = vault::load(&vault)?;
    Ok((vault, session, len))
}

fn print_table(table: &Table, cli: &Cli) -> Result<(), Failure> {
    let rendered = output::render(table, &cli.opts).map_err(Failure::usage)?;
    print!("{rendered}");
    Ok(())
}

/// Run one write through dispatch and persist it as a segment. The closure
/// returns the command's result table; a validation error maps to `blocked`.
fn commit_write(
    cli: &Cli,
    write: impl FnOnce(&mut Session, anchor_core::dto::OpStamp) -> Result<Table, Failure>,
) -> Result<u8, Failure> {
    let (vault, mut session, base_len) = open_session(cli)?;
    let stamp = vault::next_stamp(&vault, &session);
    let mut table = write(&mut session, stamp)?;
    let segment = vault::persist_new_ops(&vault, &session, base_len)?;
    let segment = segment
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    for row in &mut table.rows {
        row.push(("segment", segment.clone()));
    }
    table.fields.push("segment");
    print_table(&table, cli)?;
    Ok(EXIT_OK)
}

fn require_node<'a>(session: &'a Session, id: &str) -> Result<&'a Node, Failure> {
    session
        .vault()
        .nodes
        .get(id)
        .ok_or_else(|| Failure::not_found(format!("no such target `{id}`")))
}

fn body_text(node: &Node) -> String {
    node.content
        .body
        .as_ref()
        .map(|state| state.winner().text.clone())
        .unwrap_or_default()
}

fn children_sorted<'a>(session: &'a Session, parent: &str) -> Vec<&'a Node> {
    let mut children: Vec<&Node> = session
        .vault()
        .nodes
        .values()
        .filter(|n| n.location.parent.as_deref() == Some(parent))
        .collect();
    children.sort_by(|a, b| {
        a.location
            .order
            .cmp(&b.location.order)
            .then(a.id.cmp(&b.id))
    });
    children
}

fn cmd_init(cli: &Cli, rest: &[&str]) -> Result<u8, Failure> {
    let path = rest.first().copied().or(cli.vault.as_deref());
    let vault = vault::init(path)?;
    let mut table = Table::new("init", vec!["vault_id", "root"]);
    table.push(vec![
        ("vault_id", vault.vault_id.clone()),
        ("root", vault.root.display().to_string()),
    ]);
    print_table(&table, cli)?;
    Ok(EXIT_OK)
}

fn cmd_notes(cli: &Cli) -> Result<u8, Failure> {
    let (_, session, _) = open_session(cli)?;
    let mut table = Table::new("notes", vec!["id", "life", "blocks", "title", "rev"]);
    for node in session.vault().nodes.values() {
        if node.kind != TargetKind::Note {
            continue;
        }
        let children = children_sorted(&session, &node.id);
        let living: Vec<&&Node> = children.iter().filter(|c| c.life.is_living()).collect();
        let title = living
            .first()
            .map(|c| body_text(c).lines().next().unwrap_or_default().to_string())
            .unwrap_or_default();
        table.push(vec![
            ("id", node.id.clone()),
            ("life", node.life.as_str().to_string()),
            ("blocks", living.len().to_string()),
            ("title", title),
            (
                "rev",
                session.vault().node_snapshot_revision(&node.id).unwrap_or_default(),
            ),
        ]);
    }
    print_table(&table, cli)?;
    Ok(EXIT_OK)
}

fn cmd_note(cli: &Cli, rest: &[&str]) -> Result<u8, Failure> {
    let id = rest.first().ok_or_else(|| Failure::usage("usage: anchor note <id>"))?;
    let (_, session, _) = open_session(cli)?;
    let node = require_node(&session, id)?;
    if node.kind != TargetKind::Note {
        return Err(Failure::not_found(format!("`{id}` is not a note")));
    }
    let mut table = Table::new(
        "note",
        vec!["id", "parent", "order", "life", "visible", "type", "tags", "rev"],
    );
    table.push(vec![
        ("id", node.id.clone()),
        ("parent", node.location.parent.clone().unwrap_or_default()),
        ("order", node.location.order.clone()),
        ("life", node.life.as_str().to_string()),
        ("visible", node.visible.to_string()),
        ("type", node.content.type_id.clone().unwrap_or_default()),
        (
            "tags",
            node.content.tags.iter().cloned().collect::<Vec<_>>().join(","),
        ),
        (
            "rev",
            session.vault().node_snapshot_revision(&node.id).unwrap_or_default(),
        ),
    ]);
    print_table(&table, cli)?;
    Ok(EXIT_OK)
}

fn cmd_blocks(cli: &Cli, rest: &[&str]) -> Result<u8, Failure> {
    let note_id = rest
        .first()
        .ok_or_else(|| Failure::usage("usage: anchor blocks <note_id>"))?;
    let (_, session, _) = open_session(cli)?;
    let node = require_node(&session, note_id)?;
    if node.kind != TargetKind::Note {
        return Err(Failure::not_found(format!("`{note_id}` is not a note")));
    }
    let mut table = Table::new(
        "blocks",
        vec!["id", "parent", "order", "life", "type", "text"],
    );
    // Depth-first over the materialized tree, children in (order, id).
    let mut stack: Vec<&Node> = children_sorted(&session, note_id)
        .into_iter()
        .rev()
        .collect();
    while let Some(block) = stack.pop() {
        table.push(vec![
            ("id", block.id.clone()),
            ("parent", block.location.parent.clone().unwrap_or_default()),
            ("order", block.location.order.clone()),
            ("life", block.life.as_str().to_string()),
            ("type", block.content.type_id.clone().unwrap_or_default()),
            ("text", body_text(block)),
        ]);
        for child in children_sorted(&session, &block.id).into_iter().rev() {
            stack.push(child);
        }
    }
    print_table(&table, cli)?;
    Ok(EXIT_OK)
}

fn cmd_import(cli: &Cli, rest: &[&str]) -> Result<u8, Failure> {
    let file = rest
        .first()
        .ok_or_else(|| Failure::usage("usage: anchor import <file.md>"))?;
    let markdown = std::fs::read_to_string(file).map_err(|e| Failure {
        code: EXIT_IO,
        message: format!("read {file}: {e}"),
    })?;
    commit_write(cli, |session, stamp| {
        let note_id = format!("note_{}", stamp.op_id);
        let result = session.dispatch_import_markdown(&markdown, stamp);
        if let Some(error) = result.validation_error {
            return Err(error.into());
        }
        let mut table = Table::new("import", vec!["note_id", "blocks"]);
        table.push(vec![
            ("note_id", note_id),
            ("blocks", result.changed_ids.len().saturating_sub(1).to_string()),
        ]);
        Ok(table)
    })
}

fn cmd_export(cli: &Cli, rest: &[&str]) -> Result<u8, Failure> {
    let target = rest
        .first()
        .ok_or_else(|| Failure::usage("usage: anchor export <note_id | --all>"))?;
    let (_, session, _) = open_session(cli)?;
    let vault = if *target == "--all" {
        session.vault().clone()
    } else {
        let node = require_node(&session, target)?;
        if node.kind != TargetKind::Note {
            return Err(Failure::not_found(format!("`{target}` is not a note")));
        }
        // The note's whole subtree, transitively.
        let mut keep = MaterializedVault::default();
        let mut stack = vec![node.id.clone()];
        while let Some(id) = stack.pop() {
            if let Some(n) = session.vault().nodes.get(&id) {
                keep.nodes.insert(id.clone(), n.clone());
            }
            for child in children_sorted(&session, &id) {
                stack.push(child.id.clone());
            }
        }
        keep
    };
    // The mirror is a raw derived artifact, not a row table.
    print!("{}", mirror::export_md(&vault));
    Ok(EXIT_OK)
}

fn flag_value<'a>(rest: &[&'a str], flag: &str) -> Option<&'a str> {
    rest.iter()
        .position(|a| *a == flag)
        .and_then(|i| rest.get(i + 1).copied())
}

fn has_flag(rest: &[&str], flag: &str) -> bool {
    rest.contains(&flag)
}

fn cmd_move(cli: &Cli, rest: &[&str]) -> Result<u8, Failure> {
    let id = rest
        .first()
        .filter(|a| !a.starts_with("--"))
        .ok_or_else(|| Failure::usage("usage: anchor move <id> --parent <id|root> [--after <id>]"))?
        .to_string();
    let parent = flag_value(rest, "--parent")
        .ok_or_else(|| Failure::usage("move needs --parent <id|root>"))?
        .to_string();
    let after = flag_value(rest, "--after").map(String::from);
    commit_write(cli, move |session, stamp| {
        require_node(session, &id)?;
        let parent_opt = (parent != "root").then(|| parent.clone());
        if let Some(p) = &parent_opt {
            require_node(session, p)?;
        }
        // The order key comes from the slot after `--after` (or the end of the
        // destination's children); the move itself is a plain dispatch intent.
        let siblings: Vec<(String, String)> = session
            .vault()
            .nodes
            .values()
            .filter(|n| n.location.parent == parent_opt && n.id != id)
            .map(|n| (n.id.clone(), n.location.order.clone()))
            .collect();
        let order = match &after {
            Some(after_id) => {
                require_node(session, after_id)?;
                let Some((_, after_order)) = siblings.iter().find(|(sid, _)| sid == after_id)
                else {
                    return Err(Failure::not_found(format!(
                        "`{after_id}` is not a child of the destination"
                    )));
                };
                let upper = siblings
                    .iter()
                    .filter(|(_, o)| o > after_order)
                    .map(|(_, o)| o.clone())
                    .min();
                order::key_between(Some(after_order), upper.as_deref())
            }
            None => {
                let last = siblings.iter().map(|(_, o)| o.clone()).max();
                order::key_between(last.as_deref(), None)
            }
        }
        .map_err(|_| Failure::blocked("could not derive an order key for that slot"))?;
        let result = session.dispatch(
            EditorIntent::Move {
                target_id: id.clone(),
                parent: parent_opt,
                order: order.clone(),
            },
            stamp,
        );
        if let Some(error) = result.validation_error {
            return Err(error.into());
        }
        let mut table = Table::new("move", vec!["id", "parent", "order"]);
        table.push(vec![
            ("id", id.clone()),
            ("parent", parent.clone()),
            ("order", order),
        ]);
        Ok(table)
    })
}

fn cmd_type(cli: &Cli, rest: &[&str]) -> Result<u8, Failure> {
    let id = rest
        .first()
        .filter(|a| !a.starts_with("--"))
        .ok_or_else(|| Failure::usage("usage: anchor type <id> (--set <type> | --clear)"))?
        .to_string();
    let set = flag_value(rest, "--set").map(String::from);
    let clear = has_flag(rest, "--clear");
    if set.is_none() && !clear {
        return Err(Failure::usage("type needs --set <type> or --clear"));
    }
    commit_write(cli, move |session, stamp| {
        require_node(session, &id)?;
        let result = session.dispatch(
            EditorIntent::SetType {
                target_id: id.clone(),
                type_id: set.clone(),
            },
            stamp,
        );
        if let Some(error) = result.validation_error {
            return Err(error.into());
        }
        let mut table = Table::new("type", vec!["id", "type"]);
        table.push(vec![("id", id.clone()), ("type", set.clone().unwrap_or_default())]);
        Ok(table)
    })
}

fn cmd_prop(cli: &Cli, rest: &[&str]) -> Result<u8, Failure> {
    let positional: Vec<&&str> = rest.iter().filter(|a| !a.starts_with("--")).collect();
    let (Some(id), Some(key)) = (positional.first(), positional.get(1)) else {
        return Err(Failure::usage(
            "usage: anchor prop <id> <key> [--set <value> | --clear]",
        ));
    };
    let id = id.to_string();
    let key = key.to_string();
    let set = flag_value(rest, "--set").map(String::from);
    let clear = has_flag(rest, "--clear");
    if set.is_none() && !clear {
        // Read-only: print the current value.
        let (_, session, _) = open_session(cli)?;
        let node = require_node(&session, &id)?;
        let mut table = Table::new("prop", vec!["id", "key", "value"]);
        table.push(vec![
            ("id", id.clone()),
            ("key", key.clone()),
            ("value", node.content.props.get(&key).cloned().unwrap_or_default()),
        ]);
        print_table(&table, cli)?;
        return Ok(EXIT_OK);
    }
    commit_write(cli, move |session, stamp| {
        require_node(session, &id)?;
        let result = session.dispatch(
            EditorIntent::SetProp {
                target_id: id.clone(),
                key: key.clone(),
                value: set.clone(),
            },
            stamp,
        );
        if let Some(error) = result.validation_error {
            return Err(error.into());
        }
        let mut table = Table::new("prop", vec!["id", "key", "value"]);
        table.push(vec![
            ("id", id.clone()),
            ("key", key.clone()),
            ("value", set.clone().unwrap_or_default()),
        ]);
        Ok(table)
    })
}

fn cmd_life(cli: &Cli, rest: &[&str], life: Life, command: &'static str) -> Result<u8, Failure> {
    let id = rest
        .first()
        .ok_or_else(|| Failure::usage(format!("usage: anchor {command} <id>")))?
        .to_string();
    commit_write(cli, move |session, stamp| {
        require_node(session, &id)?;
        let result = session.dispatch(
            EditorIntent::SetLife {
                target_id: id.clone(),
                life,
            },
            stamp,
        );
        if let Some(error) = result.validation_error {
            return Err(error.into());
        }
        let mut table = Table::new(command, vec!["id", "life"]);
        table.push(vec![("id", id.clone()), ("life", life.as_str().to_string())]);
        Ok(table)
    })
}

fn cmd_restore_order(cli: &Cli, rest: &[&str]) -> Result<u8, Failure> {
    let parent = rest
        .first()
        .ok_or_else(|| Failure::usage("usage: anchor restore-order <parent_id|root>"))?
        .to_string();
    commit_write(cli, move |session, stamp| {
        let parent_opt = (parent != "root").then_some(parent.as_str());
        if let Some(p) = parent_opt {
            require_node(session, p)?;
        }
        let result = session.dispatch_renormalize_children(parent_opt, stamp);
        if let Some(error) = result.validation_error {
            return Err(error.into());
        }
        let mut table = Table::new("restore-order", vec!["parent", "renormalized"]);
        table.push(vec![
            ("parent", parent.clone()),
            ("renormalized", result.changed_ids.len().to_string()),
        ]);
        Ok(table)
    })
}

/// The Phase-2 public conflict schema (D31): one row per derived
/// `ConflictRecord`. Open conflicts exit 3 — the first-release "conflict
/// visibility is exit code 3" contract, now with the full record surface.
fn cmd_conflicts(cli: &Cli) -> Result<u8, Failure> {
    let (_, session, _) = open_session(cli)?;
    let mut table = Table::new(
        "conflicts",
        vec![
            "target_id",
            "kind",
            "sub_field_key",
            "live_op_id",
            "losing_op_ids",
            "pinned_op_ids",
        ],
    );
    for record in &session.vault().conflicts {
        table.push(vec![
            ("target_id", record.target_id.clone()),
            ("kind", record.kind.as_str().to_string()),
            ("sub_field_key", record.sub_field_key.clone().unwrap_or_default()),
            ("live_op_id", record.live_op_id.clone().unwrap_or_default()),
            ("losing_op_ids", record.losing_op_ids.join(",")),
            ("pinned_op_ids", record.pinned_op_ids.join(",")),
        ]);
    }
    let open = table.rows.len();
    print_table(&table, cli)?;
    Ok(if open == 0 { EXIT_OK } else { EXIT_CONFLICT })
}

fn cmd_resolve(cli: &Cli, rest: &[&str]) -> Result<u8, Failure> {
    let id = rest
        .first()
        .filter(|a| !a.starts_with("--"))
        .ok_or_else(|| {
            Failure::usage("usage: anchor resolve <id> (--text <s> | --keep-winner | --keep-loser <op_id>)")
        })?
        .to_string();
    let text = flag_value(rest, "--text").map(String::from);
    let keep_winner = has_flag(rest, "--keep-winner");
    let keep_loser = flag_value(rest, "--keep-loser").map(String::from);
    if [text.is_some(), keep_winner, keep_loser.is_some()]
        .iter()
        .filter(|set| **set)
        .count()
        != 1
    {
        return Err(Failure::usage(
            "resolve needs exactly one of --text, --keep-winner, --keep-loser",
        ));
    }
    commit_write(cli, move |session, stamp| {
        let node = require_node(session, &id)?;
        let Some(BodyState::MultiValue { winner, losers }) = node.content.body.clone() else {
            return Err(Failure::blocked(format!("`{id}` has no open body conflict")));
        };
        let chosen = if let Some(text) = &text {
            Body::plain(text.clone())
        } else if keep_winner {
            winner
        } else {
            let op_id = keep_loser.as_deref().unwrap_or_default();
            losers
                .iter()
                .find(|l| l.losing_op_id == op_id)
                .map(|l| l.value.clone())
                .ok_or_else(|| {
                    Failure::not_found(format!("`{op_id}` is not a pinned loser of `{id}`"))
                })?
        };
        let chosen_text = chosen.text.clone();
        let result = session.dispatch_resolve_body(&id, chosen, stamp);
        if let Some(error) = result.validation_error {
            return Err(error.into());
        }
        let mut table = Table::new("resolve", vec!["id", "text"]);
        table.push(vec![("id", id.clone()), ("text", chosen_text)]);
        Ok(table)
    })
}

fn cmd_doctor(cli: &Cli) -> Result<u8, Failure> {
    let (vault, session, ops) = open_session(cli)?;
    let notes = session
        .vault()
        .nodes
        .values()
        .filter(|n| n.kind == TargetKind::Note)
        .count();
    let blocks = session.vault().nodes.len() - notes;
    let mut table = Table::new(
        "doctor",
        vec![
            "vault_id",
            "device_id",
            "root",
            "segments",
            "ops",
            "notes",
            "blocks",
            "conflicts",
            "snapshot_revision",
        ],
    );
    // Loading at all already proves every segment decodes strictly canonical.
    table.push(vec![
        ("vault_id", vault.vault_id.clone()),
        ("device_id", vault.device_id.clone()),
        ("root", vault.root.display().to_string()),
        ("segments", vault::segment_count(&vault).to_string()),
        ("ops", ops.to_string()),
        ("notes", notes.to_string()),
        ("blocks", blocks.to_string()),
        ("conflicts", session.vault().conflicts.len().to_string()),
        ("snapshot_revision", session.vault().snapshot_revision()),
    ]);
    print_table(&table, cli)?;
    Ok(EXIT_OK)
}
