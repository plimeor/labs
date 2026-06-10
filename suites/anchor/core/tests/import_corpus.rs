//! Real-corpus import/export soak: run the importer over an operator-local
//! markdown corpus (NOT committed — point `ANCHOR_IMPORT_CORPUS` at a directory
//! of `.md` files, e.g. a copy of a personal vault) and hold the same
//! invariants the hermetic fixtures prove, per file:
//!
//! 1. plan parity — `plan_import(export_md(import(md))) == plan_import(md)`
//! 2. mirror fixed point — a second import/export cycle is byte-identical
//! 3. codec round trip — the import session's segment bytes decode back to the
//!    identical op log (re-encode is byte-identical)
//! 4. no content loss — every planned block body materializes verbatim
//!
//! ```sh
//! ANCHOR_IMPORT_CORPUS=/path/to/md-corpus \
//!   cargo test --manifest-path suites/anchor/Cargo.toml \
//!   --test import_corpus -- --ignored --nocapture
//! ```

use anchor_core::codec::{decode_segment, encode_segment};
use anchor_core::dto::{OpStamp, Session};
use anchor_core::hlc::Hlc;
use anchor_core::importer::plan_import;
use anchor_core::mirror::export_md;
use std::fs;
use std::path::{Path, PathBuf};

fn collect_md(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_md(&path, out);
        } else if path.extension().is_some_and(|e| e == "md") {
            out.push(path);
        }
    }
}

#[test]
#[ignore = "operator-local corpus; set ANCHOR_IMPORT_CORPUS and run with --ignored"]
fn corpus_round_trips_without_content_loss() {
    let root = std::env::var("ANCHOR_IMPORT_CORPUS")
        .expect("set ANCHOR_IMPORT_CORPUS to a directory of .md files");
    let mut files = Vec::new();
    collect_md(Path::new(&root), &mut files);
    files.sort();
    assert!(!files.is_empty(), "no .md files under {root}");

    let mut planned_blocks = 0usize;
    for (index, path) in files.iter().enumerate() {
        let Ok(md) = fs::read_to_string(path) else {
            // Non-UTF-8 input is out of the importer's contract.
            println!("skip (not UTF-8): {}", path.display());
            continue;
        };
        let plan = plan_import(&md);
        planned_blocks += plan.len();

        let mut session = Session::open_empty();
        let result = session.dispatch_import_markdown(
            &md,
            OpStamp {
                op_id: format!("op_corpus_{index:05}"),
                hlc: Hlc::new(10_000 + index as u64, 0, "device_corpus"),
                actor: "corpus".to_string(),
                seq: 1,
            },
        );
        assert!(
            result.validation_error.is_none(),
            "{}: import rejected: {:?}",
            path.display(),
            result.validation_error
        );

        // 4. Every planned block materialized verbatim.
        let bodies: Vec<&str> = {
            let mut blocks: Vec<_> = session
                .vault()
                .nodes
                .values()
                .filter(|n| n.kind == anchor_core::model::TargetKind::Block)
                .collect();
            blocks.sort_by(|a, b| a.location.order.cmp(&b.location.order));
            blocks
                .iter()
                .map(|n| n.content.body.as_ref().unwrap().winner().text.as_str())
                .collect()
        };
        assert_eq!(bodies, plan.iter().map(String::as_str).collect::<Vec<_>>());

        // 1. Plan parity through the mirror.
        let exported = export_md(session.vault());
        assert_eq!(
            plan_import(&exported),
            plan,
            "{}: export → re-plan drifted",
            path.display()
        );

        // 2. Second cycle is a fixed point.
        let mut second = Session::open_empty();
        second.dispatch_import_markdown(
            &exported,
            OpStamp {
                op_id: format!("op_corpus_{index:05}"),
                hlc: Hlc::new(10_000 + index as u64, 0, "device_corpus"),
                actor: "corpus".to_string(),
                seq: 1,
            },
        );
        assert_eq!(
            export_md(second.vault()),
            exported,
            "{}: second import/export cycle is not a fixed point",
            path.display()
        );

        // 3. Codec round trip on the real op log.
        let bytes = session.read_segment();
        let decoded = decode_segment(&bytes)
            .unwrap_or_else(|e| panic!("{}: segment decode failed: {e:?}", path.display()));
        assert_eq!(decoded.as_slice(), session.log());
        assert_eq!(encode_segment(&decoded), bytes);
    }
    println!(
        "corpus ok: {} files, {planned_blocks} blocks round-tripped",
        files.len()
    );
}
