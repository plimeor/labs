//! Inline marks and UTF-16 offset re-clamping (conflict §6.1).
//!
//! After a body text change, every mark offset is re-clamped against the edit:
//! `expand` marks (bold) grow into inserted text at a seam, non-`expand` marks
//! (link/ref/mention) do not; marks that collapse to an empty range are dropped.
//! Offsets are UTF-16 code units (the external Apple boundary, D18). The core
//! never reaches for platform text APIs — re-clamp is a pure function of the
//! mark set and an edit list.

use alloc::string::String;
use alloc::vec::Vec;

/// A typed inline mark over a UTF-16 `[start, end)` range.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Mark {
    pub kind: String,
    pub start: u32,
    pub end: u32,
    /// Whether the mark grows into text inserted at its boundary (bold = true,
    /// link/ref/mention = false).
    pub expand: bool,
}

impl Mark {
    pub fn new(kind: impl Into<String>, start: u32, end: u32, expand: bool) -> Self {
        Mark {
            kind: kind.into(),
            start,
            end,
            expand,
        }
    }
}

/// A splice on the UTF-16 text: replace `[at, at+old_len)` with `new_len` units.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Splice {
    pub at: u32,
    pub old_len: u32,
    pub new_len: u32,
}

/// Map a single UTF-16 offset through one splice. `is_end` and `expand` decide
/// behaviour when the offset falls inside the replaced region or exactly at the
/// seam.
fn map_offset(off: u32, sp: &Splice, is_end: bool, expand: bool) -> u32 {
    let splice_end = sp.at + sp.old_len;
    if off < sp.at {
        // Strictly before the splice: unaffected.
        return off;
    }
    if off == sp.at {
        // Exactly at the left seam. Whether the boundary absorbs text inserted
        // here depends on the boundary side and `expand`:
        //   start, expand     → stay (insertion joins the mark)
        //   start, non-expand → skip past the insertion
        //   end,   expand     → extend over the insertion
        //   end,   non-expand → stay
        return match (is_end, expand) {
            (false, true) => sp.at,
            (false, false) => sp.at + sp.new_len,
            (true, true) => sp.at + sp.new_len,
            (true, false) => sp.at,
        };
    }
    if off >= splice_end {
        // After the splice: shift by the length delta.
        return (off as i64 + sp.new_len as i64 - sp.old_len as i64) as u32;
    }
    // Strictly inside the replaced region: a start clamps to the splice start, an
    // end clamps to the (post-edit) splice end, so the mark shrinks rather than
    // spanning deleted text.
    if is_end {
        sp.at + sp.new_len
    } else {
        sp.at
    }
}

/// Rebuild a mark at the new `[start, end)` range, surviving only if the range is
/// non-empty (`end > start`). Owns the shared survive/rebuild rule used by both
/// re-clamp callers, so a future `Mark` field is updated in exactly one place.
fn survive(m: &Mark, start: u32, end: u32) -> Option<Mark> {
    (end > start).then(|| Mark {
        kind: m.kind.clone(),
        start,
        end,
        expand: m.expand,
    })
}

/// Re-clamp a mark set against an ordered, non-overlapping list of splices
/// (ascending `at`). Returns surviving marks; marks whose range collapses to
/// empty are dropped. Output preserves input order then is deterministic.
pub fn reclamp(marks: &[Mark], splices: &[Splice]) -> Vec<Mark> {
    marks
        .iter()
        .filter_map(|m| {
            let mut start = m.start;
            let mut end = m.end;
            // Apply splices from the right so earlier `at` values stay valid.
            for sp in splices.iter().rev() {
                start = map_offset(start, sp, false, m.expand);
                end = map_offset(end, sp, true, m.expand);
            }
            survive(m, start, end)
        })
        .collect()
}

/// Clamp marks into `[0, len]`, dropping any that collapse. Used after keep-both
/// when a body value is paired with a possibly-shorter text.
pub fn clamp_to_len(marks: &[Mark], len: u32) -> Vec<Mark> {
    marks
        .iter()
        .filter_map(|m| survive(m, m.start.min(len), m.end.min(len)))
        .collect()
}
