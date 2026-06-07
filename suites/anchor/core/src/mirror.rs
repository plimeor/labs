//! Post-commit mirror export + structured-search parity (D15 / D16, conflict §10).
//!
//! Mirrors (`.md` / `.json`) are lossy, post-commit, derived exports — never a
//! merge input and never synced. A mirror write failure only affects freshness;
//! the op-log (and thus the materialized vault) is untouched. Structured search
//! over materialized state matches ripgrep over the exported `.md`. An open body
//! conflict renders as a git-style fence in `.md` and carries a `ConflictRecord`
//! in `.json`.

use crate::canonical::canonical_string;
use crate::model::{BodyState, Vault};
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

/// Mirror freshness after a (possibly failed) post-commit job.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MirrorStatus {
    pub fresh: bool,
    pub diagnostics: Option<String>,
}

/// Result of a post-commit mirror job. On failure the `content` is `None` and
/// the status is stale, but the caller's vault/op-log is unaffected.
pub struct MirrorJob {
    pub content: Option<String>,
    pub status: MirrorStatus,
}

fn note_anchor(id: &str) -> String {
    format!("<!-- note:{id} -->")
}

/// Export a human-readable `.md` mirror of visible notes. Open body conflicts
/// render as git-style fences.
pub fn export_md(vault: &Vault) -> String {
    let mut out = String::new();
    for node in vault.nodes.values() {
        if !node.visible {
            continue;
        }
        out.push_str(&note_anchor(&node.id));
        out.push('\n');
        match &node.content.body {
            Some(BodyState::Single(b)) => {
                out.push_str(&b.text);
                out.push('\n');
            }
            Some(BodyState::MultiValue { winner, losers }) => {
                out.push_str("<<<<<<< this device\n");
                out.push_str(&winner.text);
                out.push('\n');
                for l in losers {
                    out.push_str("=======\n");
                    out.push_str(&l.value.text);
                    out.push('\n');
                }
                out.push_str(">>>>>>> other device\n");
            }
            None => {}
        }
        out.push('\n');
    }
    out
}

/// Export a `.json` mirror carrying materialized state and conflict records.
pub fn export_json(vault: &Vault) -> String {
    let nodes = vault.canonical();
    let conflicts = crate::model::conflicts_canonical(&vault.conflicts);
    let obj = crate::canonical::CanonicalValue::object([("state", nodes), ("conflicts", conflicts)]);
    canonical_string(&obj)
}

/// Run the post-commit mirror job. `simulate_failure` models a mirror write
/// failure: the job reports stale, but nothing about the vault changes.
pub fn run_mirror_job(vault: &Vault, simulate_failure: bool) -> MirrorJob {
    if simulate_failure {
        return MirrorJob {
            content: None,
            status: MirrorStatus {
                fresh: false,
                diagnostics: Some("mirror write failed; op-log unaffected".to_string()),
            },
        };
    }
    MirrorJob {
        content: Some(export_md(vault)),
        status: MirrorStatus {
            fresh: true,
            diagnostics: None,
        },
    }
}

/// Structured search over materialized state: visible note ids whose winning
/// body text contains `query`. Sorted, deduped.
pub fn structured_search(vault: &Vault, query: &str) -> Vec<String> {
    let mut hits = Vec::new();
    for node in vault.nodes.values() {
        if !node.visible {
            continue;
        }
        if let Some(body) = &node.content.body {
            let text = match body {
                BodyState::Single(b) => &b.text,
                BodyState::MultiValue { winner, .. } => &winner.text,
            };
            if !query.is_empty() && text.contains(query) {
                hits.push(node.id.clone());
            }
        }
    }
    hits.sort();
    hits.dedup();
    hits
}

/// ripgrep-like search over an exported `.md` mirror: note ids of anchors whose
/// following lines contain `query`. Sorted, deduped. Used to assert parity with
/// [`structured_search`].
pub fn ripgrep_md(md: &str, query: &str) -> Vec<String> {
    let mut hits = Vec::new();
    let mut current: Option<String> = None;
    for line in md.lines() {
        if let Some(rest) = line.strip_prefix("<!-- note:") {
            if let Some(id) = rest.strip_suffix(" -->") {
                current = Some(id.to_string());
                continue;
            }
        }
        if !query.is_empty() && line.contains(query) {
            if let Some(id) = &current {
                hits.push(id.clone());
            }
        }
    }
    hits.sort();
    hits.dedup();
    hits
}
