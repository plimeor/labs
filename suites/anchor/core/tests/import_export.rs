//! Markdown import + import/export parity.
//!
//! The importer is paragraph-granular and content-preserving; the export mirror
//! is lossy-by-design (winner text only). The parity proof: importing a
//! document, exporting the mirror, and re-planning the export recovers exactly
//! the original block plan — and the import itself is one atomic macro that a
//! partial delivery can never half-apply.

use anchor_core::dto::{OpStamp, Session};
use anchor_core::hlc::Hlc;
use anchor_core::importer::plan_import;
use anchor_core::mirror::{export_md, ripgrep_md, structured_search};
use anchor_core::model::TargetKind;
use anchor_core::replay::replay;

fn stamp(op_id: &str) -> OpStamp {
    OpStamp {
        op_id: op_id.to_string(),
        hlc: Hlc::new(5_000, 0, "device_import"),
        actor: "user".to_string(),
        seq: 1,
    }
}

const SAMPLE_MD: &str = "# Inbox\r\n\r\nFirst thought with **bold**.\nIt has a soft newline.\r\n\r\n\r\n- a list item\n- another item\r\n\r\n```rust\nfn main() {\n\n    println!(\"hi\");\n}\n```\n";

#[test]
fn plan_is_paragraph_granular_and_preserves_text() {
    let plan = plan_import(SAMPLE_MD);
    assert_eq!(
        plan,
        vec![
            "# Inbox".to_string(),
            "First thought with **bold**.\nIt has a soft newline.".to_string(),
            "- a list item\n- another item".to_string(),
            "```rust\nfn main() {\n\n    println!(\"hi\");\n}\n```".to_string(),
        ],
        "blank lines split paragraphs but never a fenced code block"
    );
}

#[test]
fn import_creates_one_note_with_ordered_blocks() {
    let mut session = Session::open_empty();
    let result = session.dispatch_import_markdown(SAMPLE_MD, stamp("op_import"));
    assert!(result.validation_error.is_none());
    assert_eq!(result.changed_ids.len(), 5, "1 note + 4 blocks");

    let vault = session.vault();
    let note = vault.nodes.get("note_op_import").expect("note exists");
    assert_eq!(note.kind, TargetKind::Note);
    assert!(note.visible);

    // Blocks parent on the note and their order keys ascend in paragraph order.
    let plan = plan_import(SAMPLE_MD);
    let mut blocks: Vec<_> = vault
        .nodes
        .values()
        .filter(|n| n.kind == TargetKind::Block)
        .collect();
    blocks.sort_by(|a, b| a.location.order.cmp(&b.location.order));
    assert_eq!(blocks.len(), plan.len());
    for (block, text) in blocks.iter().zip(&plan) {
        assert_eq!(block.location.parent.as_deref(), Some("note_op_import"));
        assert_eq!(&block.content.body.as_ref().unwrap().winner().text, text);
    }
}

#[test]
fn import_export_round_trip_recovers_the_plan() {
    let mut session = Session::open_empty();
    session.dispatch_import_markdown(SAMPLE_MD, stamp("op_import"));

    let md = export_md(session.vault());
    assert_eq!(
        plan_import(&md),
        plan_import(SAMPLE_MD),
        "export → re-plan is identity on the block plan"
    );

    // And a second full cycle is a fixed point (normalization is idempotent).
    let mut second = Session::open_empty();
    second.dispatch_import_markdown(&md, stamp("op_import"));
    assert_eq!(export_md(second.vault()), md);
}

#[test]
fn imported_content_is_searchable_with_mirror_parity() {
    let mut session = Session::open_empty();
    session.dispatch_import_markdown(SAMPLE_MD, stamp("op_import"));
    let md = export_md(session.vault());
    assert_eq!(
        structured_search(session.vault(), "soft newline"),
        ripgrep_md(&md, "soft newline"),
        "structured search and ripgrep-over-mirror agree on imported content"
    );
    assert_eq!(structured_search(session.vault(), "soft newline").len(), 1);
}

#[test]
fn import_is_all_or_nothing() {
    let mut session = Session::open_empty();
    session.dispatch_import_markdown(SAMPLE_MD, stamp("op_import"));

    // Drop one op of the import macro: the whole import must not materialize.
    let partial: Vec<_> = session.log()[..session.log().len() - 1].to_vec();
    let vault = replay(&partial);
    assert!(
        vault.nodes.is_empty(),
        "a partially delivered import never half-applies"
    );
}

#[test]
fn import_into_existing_vault_appends_after_root_siblings() {
    let mut session = Session::open_fixture();
    let last_root_order = session
        .vault()
        .nodes
        .values()
        .filter(|n| n.location.parent.is_none())
        .map(|n| n.location.order.clone())
        .max()
        .unwrap();
    session.dispatch_import_markdown("Imported paragraph.", stamp("op_import"));
    let note = session.vault().nodes.get("note_op_import").unwrap();
    assert!(note.location.parent.is_none());
    assert!(
        note.location.order > last_root_order,
        "imported note lands after existing root siblings"
    );
}

/// A sanitized fixture distilled from a real vault's structural patterns:
/// YAML frontmatter, wikilinks, CJK + emoji + surrogate pairs, blockquotes,
/// nested lists, tables, a thematic break, a 4-backtick fence nesting a
/// 3-backtick fence with blank lines, and a tilde fence.
const COMPLEX_MD: &str = include_str!("fixtures/complex-note.md");

#[test]
fn complex_note_round_trips_without_content_loss() {
    let plan = plan_import(COMPLEX_MD);
    let nested_fence = plan
        .iter()
        .find(|b| b.starts_with("````markdown"))
        .expect("outer fence is one block");
    assert!(
        nested_fence.contains("```rust") && nested_fence.contains("blank line above"),
        "inner fence and its blank lines stay inside the outer fence block"
    );
    assert!(plan.iter().any(|b| b.starts_with("---\ntags:")), "frontmatter is one block");
    assert!(plan.iter().any(|b| b.starts_with("~~~text")), "tilde fence is one block");

    let mut session = Session::open_empty();
    let result = session.dispatch_import_markdown(COMPLEX_MD, stamp("op_complex"));
    assert!(result.validation_error.is_none());

    let md = export_md(session.vault());
    assert_eq!(plan_import(&md), plan, "export → re-plan is identity");

    let mut second = Session::open_empty();
    second.dispatch_import_markdown(&md, stamp("op_complex"));
    assert_eq!(export_md(second.vault()), md, "second cycle is a fixed point");

    // The real op log round-trips through the codec byte-identically.
    let bytes = session.read_segment();
    let decoded = anchor_core::codec::decode_segment(&bytes).expect("segment decodes");
    assert_eq!(decoded.as_slice(), session.log());
}

#[test]
fn empty_markdown_imports_an_empty_note() {
    let mut session = Session::open_empty();
    let result = session.dispatch_import_markdown("\n\n", stamp("op_import"));
    assert!(result.validation_error.is_none());
    assert_eq!(session.vault().nodes.len(), 1, "just the note, no blocks");
}
