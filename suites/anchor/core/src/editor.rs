//! `anchor-editor-core` selection rules (F21): the platform-agnostic
//! promote/demote ladder for `Selection::{Text, Block, Embedded}`.
//!
//! The ladder is owned here, not by platform adapters: repeated select-all
//! (`Cmd+A`) escalates `partial → full range → block`, and escape (`Esc`)
//! demotes `embedded/text → block → workspace focus`. Workspace focus itself
//! is adapter-owned, so demoting a block selection returns `None`. These are
//! pure functions over the materialized vault — no UI types, no persistence.

use crate::diff3::to_utf16;
use crate::dto::Selection;
use crate::model::Vault;

/// UTF-16 length of the block's current body (the embedded payload is the
/// body too — code blocks store their code there).
fn body_len(vault: &Vault, block_id: &str) -> u32 {
    vault
        .nodes
        .get(block_id)
        .and_then(|node| node.content.body.as_ref())
        .map(|state| to_utf16(&state.winner().text).len() as u32)
        .unwrap_or(0)
}

/// One select-all step (`Cmd+A`): a partial text/embedded selection grows to
/// the full payload; a full one promotes to the enclosing block selection; a
/// block selection stays (promoting to workspace focus is adapter-owned).
pub fn escalate(vault: &Vault, selection: &Selection) -> Selection {
    match selection {
        Selection::Text {
            block_id,
            start,
            end,
        } => {
            let len = body_len(vault, block_id);
            if *start == 0 && *end == len {
                Selection::Block {
                    block_id: block_id.clone(),
                }
            } else {
                Selection::Text {
                    block_id: block_id.clone(),
                    start: 0,
                    end: len,
                }
            }
        }
        Selection::Embedded {
            block_id,
            start,
            end,
        } => {
            let len = body_len(vault, block_id);
            if *start == 0 && *end == len {
                Selection::Block {
                    block_id: block_id.clone(),
                }
            } else {
                Selection::Embedded {
                    block_id: block_id.clone(),
                    start: 0,
                    end: len,
                }
            }
        }
        Selection::Block { block_id } => Selection::Block {
            block_id: block_id.clone(),
        },
    }
}

/// One escape step (`Esc`): an embedded or text selection demotes to the
/// enclosing block selection; a block selection leaves the ladder (`None` =
/// workspace focus, owned by the adapter).
pub fn demote(selection: &Selection) -> Option<Selection> {
    match selection {
        Selection::Text { block_id, .. } | Selection::Embedded { block_id, .. } => {
            Some(Selection::Block {
                block_id: block_id.clone(),
            })
        }
        Selection::Block { .. } => None,
    }
}
