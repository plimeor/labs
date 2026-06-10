//! End-to-end tests of the `anchor` binary: the global I/O contract (vault
//! resolution, formats, fields/limit/count, fixed exit codes), the read/write
//! commands over a real on-disk vault, and the Phase-2 conflict surface
//! (`conflicts` exits 3, `resolve` clears it) fed by a handcrafted
//! second-device segment.

use anchor_core::codec;
use anchor_core::hlc::Hlc;
use anchor_core::model::{body_sub_rev, Body};
use anchor_core::op::{OpBuilder, OpKind, OpPayload, Register, SubFieldKey};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static DIR_SEQ: AtomicU64 = AtomicU64::new(0);

fn temp_vault() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!(
        "anchor-cli-test-{}-{}-{}",
        std::process::id(),
        nanos,
        DIR_SEQ.fetch_add(1, Ordering::SeqCst)
    ));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn anchor(vault: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_anchor"))
        .arg("--vault")
        .arg(vault)
        .args(args)
        .env("ANCHOR_ACTOR", "tester")
        .output()
        .expect("spawn anchor")
}

fn stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).to_string()
}

fn exit_code(output: &Output) -> i32 {
    output.status.code().unwrap_or(-1)
}

fn init_vault() -> PathBuf {
    let dir = temp_vault();
    let out = anchor(&dir, &["init"]);
    assert_eq!(exit_code(&out), 0, "init failed: {out:?}");
    dir
}

/// Import two paragraphs and return (note_id, first_block_id, second_block_id).
fn import_fixture(dir: &Path) -> (String, String, String) {
    let md = dir.join("note.md");
    fs::write(&md, "Original text.\n\nSecond paragraph.").unwrap();
    let out = anchor(dir, &["import", md.to_str().unwrap()]);
    assert_eq!(exit_code(&out), 0, "import failed: {out:?}");
    let note_id = stdout(&out)
        .lines()
        .next()
        .unwrap()
        .split('\t')
        .next()
        .unwrap()
        .to_string();
    let blocks = anchor(dir, &["--fields", "id", "blocks", &note_id]);
    assert_eq!(exit_code(&blocks), 0);
    let listing = stdout(&blocks);
    let mut ids = listing.lines();
    let first = ids.next().unwrap().to_string();
    let second = ids.next().unwrap().to_string();
    (note_id, first, second)
}

#[test]
fn exit_codes_follow_the_contract() {
    // 5: no vault at/above the path.
    let empty = temp_vault();
    assert_eq!(exit_code(&anchor(&empty, &["notes"])), 5);
    // 1: unknown command / missing command.
    let dir = init_vault();
    assert_eq!(exit_code(&anchor(&dir, &["bogus"])), 1);
    assert_eq!(exit_code(&anchor(&dir, &[])), 1);
    // 2: missing target.
    assert_eq!(exit_code(&anchor(&dir, &["note", "no_such_note"])), 2);
    // 0: healthy vault.
    assert_eq!(exit_code(&anchor(&dir, &["doctor"])), 0);
}

#[test]
fn import_lists_and_exports_the_note() {
    let dir = init_vault();
    let (note_id, first, _) = import_fixture(&dir);

    let notes = anchor(&dir, &["notes"]);
    assert_eq!(exit_code(&notes), 0);
    let listing = stdout(&notes);
    assert!(listing.contains(&note_id));
    assert!(listing.contains("Original text."), "title column: {listing}");

    let blocks = anchor(&dir, &["blocks", &note_id]);
    let listing = stdout(&blocks);
    assert!(listing.contains(&first));
    assert!(listing.contains("Second paragraph."));

    let export = anchor(&dir, &["export", &note_id]);
    assert_eq!(exit_code(&export), 0);
    let md = stdout(&export);
    assert!(md.contains("Original text."));
    assert!(md.contains("Second paragraph."));
}

#[test]
fn global_io_flags_shape_the_output() {
    let dir = init_vault();
    let (note_id, _, _) = import_fixture(&dir);

    let json = anchor(&dir, &["--format", "json", "notes"]);
    let body = stdout(&json);
    assert!(body.contains("\"apiVersion\":1"), "envelope: {body}");
    assert!(body.contains("\"command\":\"notes\""));

    let count = anchor(&dir, &["--count", "notes"]);
    assert_eq!(stdout(&count).trim(), "1");

    let limited = anchor(&dir, &["--limit", "1", "blocks", &note_id]);
    assert_eq!(stdout(&limited).lines().count(), 1);

    let fields = anchor(&dir, &["--fields", "life", "notes"]);
    assert_eq!(stdout(&fields).trim(), "active");

    let unknown = anchor(&dir, &["--fields", "nope", "notes"]);
    assert_eq!(exit_code(&unknown), 1);
}

#[test]
fn write_commands_go_through_dispatch_and_persist_segments() {
    let dir = init_vault();
    let (note_id, first, second) = import_fixture(&dir);

    // type / prop round-trip.
    assert_eq!(exit_code(&anchor(&dir, &["type", &first, "--set", "heading"])), 0);
    assert_eq!(
        exit_code(&anchor(&dir, &["prop", &first, "status", "--set", "draft"])),
        0
    );
    let read = anchor(&dir, &["--fields", "value", "prop", &first, "status"]);
    assert_eq!(stdout(&read).trim(), "draft");

    // move the first block to the end; the listing order flips.
    assert_eq!(
        exit_code(&anchor(&dir, &["move", &first, "--parent", &note_id])),
        0
    );
    let listing = anchor(&dir, &["--fields", "id", "blocks", &note_id]);
    let order: Vec<String> = stdout(&listing).lines().map(String::from).collect();
    assert_eq!(order, vec![second.clone(), first.clone()]);

    // delete is a reversible trash; restore-subtree brings it back.
    assert_eq!(exit_code(&anchor(&dir, &["delete", &first])), 0);
    let lives = anchor(&dir, &["--fields", "id,life", "blocks", &note_id]);
    assert!(stdout(&lives).contains(&format!("{first}\ttrashed")));
    assert_eq!(exit_code(&anchor(&dir, &["restore-subtree", &first])), 0);
    let lives = anchor(&dir, &["--fields", "id,life", "blocks", &note_id]);
    assert!(stdout(&lives).contains(&format!("{first}\tactive")));

    // restore-order renormalizes the children deterministically.
    assert_eq!(exit_code(&anchor(&dir, &["restore-order", &note_id])), 0);

    // Every write landed as an immutable segment; doctor still loads strictly.
    let doctor = anchor(&dir, &["--format", "json", "doctor"]);
    assert_eq!(exit_code(&doctor), 0);
    let body = stdout(&doctor);
    assert!(body.contains("\"conflicts\":\"0\""), "doctor: {body}");
}

/// Two fake remote devices rewrite the same block from the same base — the
/// segment lands on disk exactly like a synced one. `conflicts` must surface
/// the keep-both (exit 3) and `resolve` must clear it (back to exit 0).
#[test]
fn conflicts_surface_with_exit_3_and_resolve_clears_them() {
    let dir = init_vault();
    let (_, first, _) = import_fixture(&dir);

    let base_rev = body_sub_rev(&Body::plain("Original text."));
    let mut remote_ops = Vec::new();
    for (suffix, text) in [("a", "Conflict A."), ("b", "Conflict B.")] {
        let body = Body::plain(text);
        remote_ops.push(
            OpBuilder::new(
                format!("op_conflict_{suffix}"),
                Hlc::new(99_999_999_999_999, 0, format!("device_{suffix}")),
                format!("user_{suffix}"),
                first.clone(),
                anchor_core::model::TargetKind::Block,
                Register::Content,
                OpKind::Set,
                OpPayload::SetBody {
                    text: body.text.clone(),
                    marks: Vec::new(),
                },
            )
            .seq(1)
            .sub_field(SubFieldKey::Body)
            .base_sub_rev(base_rev.clone())
            .new_sub_rev(body_sub_rev(&body))
            .build(),
        );
    }
    let remote_dir = dir.join(".anchor/operations/dev_remote");
    fs::create_dir_all(&remote_dir).unwrap();
    fs::write(remote_dir.join("00000001.seg"), codec::encode_segment(&remote_ops)).unwrap();

    let conflicts = anchor(&dir, &["conflicts"]);
    assert_eq!(exit_code(&conflicts), 3, "open conflict must exit 3");
    let listing = stdout(&conflicts);
    assert!(listing.contains(&first));
    assert!(listing.contains("body_overlap"));

    let resolve = anchor(&dir, &["resolve", &first, "--text", "Settled text."]);
    assert_eq!(exit_code(&resolve), 0, "resolve failed: {resolve:?}");

    let conflicts = anchor(&dir, &["conflicts"]);
    assert_eq!(exit_code(&conflicts), 0, "resolved vault must exit 0");
    assert!(stdout(&conflicts).trim().is_empty());

    let notes = anchor(&dir, &["--fields", "id", "notes"]);
    let note_id = stdout(&notes).trim().to_string();
    let blocks = anchor(&dir, &["--fields", "id,text", "blocks", &note_id]);
    assert!(stdout(&blocks).contains(&format!("{first}\tSettled text.")));

    // resolve without an open conflict is blocked (4).
    let again = anchor(&dir, &["resolve", &first, "--text", "Again."]);
    assert_eq!(exit_code(&again), 4);
}
