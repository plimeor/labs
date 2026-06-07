//! Per-cell `base_sub_rev` stale guard for local writes (D11, conflict §3.4).
//!
//! A local UI/CLI write carries the `base_sub_rev` of the cell it touches. The
//! dispatch returns `Conflict` (CLI exit 3) only when *that cell* changed
//! underneath. Concurrent writes to *different* cells stay independently
//! mergeable — the sub-field decomposition removes manufactured conflicts. This
//! is a dispatch-time guard, distinct from sync-ingestion merge.

use crate::model::{body_sub_rev, scalar_sub_rev, Node, Vault};
use crate::op::SubFieldKey;
use alloc::string::String;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DispatchOutcome {
    Applied,
    /// CLI exit code 3.
    Conflict,
}

/// Current `sub_rev` of a content cell from materialized state. Tags use the
/// OR-Set (no scalar guard), so they return `None`.
pub fn current_cell_sub_rev(node: &Node, sub: &SubFieldKey) -> Option<String> {
    match sub {
        SubFieldKey::Body => node.content.body.as_ref().map(|s| body_sub_rev(s.winner())),
        SubFieldKey::TypeId => Some(scalar_sub_rev(node.content.type_id.as_deref())),
        SubFieldKey::Prop(k) => {
            Some(scalar_sub_rev(node.content.props.get(k).map(String::as_str)))
        }
        SubFieldKey::Tag(_) => None,
    }
}

/// Compare a write's `base_sub_rev` against the current cell `sub_rev`.
pub fn would_conflict(current: Option<&str>, base_sub_rev: Option<&str>) -> bool {
    match (current, base_sub_rev) {
        (Some(c), Some(b)) => c != b,
        // Editing from a base on a cell that is now absent/changed shape.
        (None, Some(_)) => true,
        // Fresh create (no base) or no current to clash with.
        _ => false,
    }
}

/// Dispatch-time stale check for a local write to `target_id`'s `sub` cell.
pub fn dispatch_local(
    vault: &Vault,
    target_id: &str,
    sub: &SubFieldKey,
    base_sub_rev: Option<&str>,
) -> DispatchOutcome {
    let current = vault
        .nodes
        .get(target_id)
        .and_then(|n| current_cell_sub_rev(n, sub));
    if would_conflict(current.as_deref(), base_sub_rev) {
        DispatchOutcome::Conflict
    } else {
        DispatchOutcome::Applied
    }
}
