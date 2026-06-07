//! Tag OR-Set, add-wins (conflict §5.3 / §6.7 / D28).
//!
//! Add-identity = the `tag_add` op's `op_id` (no new envelope field). A
//! `tag_remove` carries the set of add op_ids it observed. A tag is present iff
//! some add's `op_id` is not contained in any remove's observed set. "Add to an
//! already-present tag" is simply another add op (a fresh identity). Membership
//! is a pure, order-independent function of the op set.

use alloc::collections::BTreeSet;

/// Membership of one tag, given the set of add identities (op_ids) and the union
/// of all observed-add ids across that tag's removes.
pub fn tag_present(add_ids: &BTreeSet<alloc::string::String>, removed_observed: &BTreeSet<alloc::string::String>) -> bool {
    add_ids.iter().any(|id| !removed_observed.contains(id))
}

/// Surviving add identities (adds not yet observed-removed). These are the ones
/// a watermark-bounded GC may eventually collapse once causally stable.
pub fn live_add_ids(
    add_ids: &BTreeSet<alloc::string::String>,
    removed_observed: &BTreeSet<alloc::string::String>,
) -> BTreeSet<alloc::string::String> {
    add_ids
        .iter()
        .filter(|id| !removed_observed.contains(*id))
        .cloned()
        .collect()
}
