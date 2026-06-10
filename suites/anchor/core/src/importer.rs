//! Markdown importer: external `.md` text → a deterministic import plan.
//!
//! The plan is paragraph-granular and content-preserving: blank lines separate
//! blocks, single newlines stay soft newlines *inside* a block body, and the
//! block text is the raw markdown (no inline parsing — type/mark enrichment is a
//! later, separate concern). A fenced code block (``` / ~~~) is one block even
//! when it contains blank lines. Lines that are exactly a mirror note anchor
//! (`<!-- note:… -->`) are markers, not content, and are skipped — so importing
//! an exported `.md` mirror recovers the exported body texts (the import/export
//! parity proof). Turning a plan into committed ops is `Session::
//! dispatch_import_markdown`, which goes through the single validated dispatch
//! chokepoint as one atomic macro.

use alloc::string::String;
use alloc::vec::Vec;

/// Split markdown into paragraph-granular block bodies (see module docs).
/// Deterministic and pure: same input, same plan, on every target.
pub fn plan_import(md: &str) -> Vec<String> {
    let mut blocks: Vec<String> = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    let mut fence: Option<Fence> = None;
    // `str::lines` already treats `\r\n` as one line break; a bare `\r` is
    // handled by trimming it from the line end below.
    for raw in md.lines() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        if let Some(open) = &fence {
            current.push(line);
            if closes_fence(line, open) {
                fence = None;
                flush(&mut current, &mut blocks);
            }
            continue;
        }
        if is_note_anchor(line) {
            continue;
        }
        if line.trim().is_empty() {
            flush(&mut current, &mut blocks);
            continue;
        }
        if let Some(open) = opens_fence(line) {
            // A fence starts its own block; preceding prose is a separate one.
            flush(&mut current, &mut blocks);
            fence = Some(open);
        }
        current.push(line);
    }
    flush(&mut current, &mut blocks);
    blocks
}

fn flush(current: &mut Vec<&str>, blocks: &mut Vec<String>) {
    if current.is_empty() {
        return;
    }
    blocks.push(current.join("\n"));
    current.clear();
}

/// A mirror note-anchor marker line (`mirror::export_md` writes these).
fn is_note_anchor(line: &str) -> bool {
    line.starts_with("<!-- note:") && line.ends_with(" -->")
}

/// An open code fence: its marker char (`` ` `` or `~`) and run length.
struct Fence {
    marker: char,
    len: usize,
}

/// If `line` opens a fenced code block (CommonMark): up to three leading
/// spaces, then a run of ≥3 backticks or tildes. A backtick fence's info
/// string may not contain a backtick (that is inline code, not a fence).
fn opens_fence(line: &str) -> Option<Fence> {
    let trimmed = line.trim_start_matches(' ');
    if line.len() - trimmed.len() > 3 {
        return None;
    }
    let marker = match trimmed.chars().next() {
        Some(c @ ('`' | '~')) => c,
        _ => return None,
    };
    let len = trimmed.chars().take_while(|&c| c == marker).count();
    if len < 3 {
        return None;
    }
    if marker == '`' && trimmed[len..].contains('`') {
        return None;
    }
    Some(Fence { marker, len })
}

/// A closing fence line: same marker char, run **at least as long** as the
/// opener (so an inner shorter fence stays content), nothing but whitespace
/// after it.
fn closes_fence(line: &str, open: &Fence) -> bool {
    let trimmed = line.trim_start_matches(' ');
    if line.len() - trimmed.len() > 3 {
        return false;
    }
    let len = trimmed.chars().take_while(|&c| c == open.marker).count();
    len >= open.len && trimmed[len..].trim().is_empty()
}
