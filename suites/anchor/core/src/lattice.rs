//! `life` lattice join and terminal-`deleted` reachability (conflict §5.4 / §6.3).
//!
//! Lattice: `active (bottom) < {trashed, archived} (incomparable peers) <
//! deleted (top)`. Join is clock-independent. The `trashed`/`archived` tie
//! resolves to `archived` (keep-biased single-user default, D27). Terminal
//! `deleted` is only honoured when the delete op causally dominates every
//! concurrent content edit (via `dominates_frontier`, D20); otherwise it is
//! blocked back to reversible `trashed`.

use crate::hlc::Hlc;
use crate::model::Life;
use alloc::collections::BTreeMap;
use alloc::string::String;

fn rank(l: Life) -> u8 {
    match l {
        Life::Active => 0,
        Life::Trashed | Life::Archived => 1,
        Life::Deleted => 2,
    }
}

/// Clock-independent lattice join with the archived-wins tie (D27).
pub fn life_join(a: Life, b: Life) -> Life {
    if a == b {
        return a;
    }
    let (ra, rb) = (rank(a), rank(b));
    if ra != rb {
        return if ra > rb { a } else { b };
    }
    // Same rank, distinct ⇒ {trashed, archived} ⇒ archived wins.
    Life::Archived
}

/// Whether a terminal `delete` op's `dominates_frontier` causally dominates a
/// content edit stamped with `edit_hlc`. An edit on a device not present in the
/// frontier is treated as concurrent (not dominated), which blocks the delete.
pub fn frontier_dominates(frontier: &BTreeMap<String, Hlc>, edit_hlc: &Hlc) -> bool {
    match frontier.get(&edit_hlc.device) {
        Some(seen) => edit_hlc <= seen,
        None => false,
    }
}

/// Decide the honoured terminal state for a `deleted` op: `Deleted` iff its
/// frontier dominates every concurrent content edit hlc; otherwise blocked to
/// reversible `Trashed`.
pub fn resolve_terminal_delete<'a, I>(frontier: Option<&BTreeMap<String, Hlc>>, content_edit_hlcs: I) -> Life
where
    I: IntoIterator<Item = &'a Hlc>,
{
    let frontier = match frontier {
        Some(f) => f,
        None => return Life::Trashed, // no domination evidence ⇒ never terminal
    };
    for hlc in content_edit_hlcs {
        if !frontier_dominates(frontier, hlc) {
            return Life::Trashed;
        }
    }
    Life::Deleted
}
