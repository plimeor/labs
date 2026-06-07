//! Replay cost curve (run explicitly: `cargo test --release -- --ignored`).
//! Not part of the default gate; it produces the scale data point for the
//! report (core-side replay is O(ops); the synced segment-file scale gate is
//! Codex's runtime spike).

mod common;
use common::*;

use anchor_core::replay::replay;
use std::time::Instant;

fn generate(n: usize) -> Vec<anchor_core::op::Op> {
    let mut ops = Vec::with_capacity(n * 2);
    let devices = ["mac", "iph", "ipad"];
    let nodes = (n / 4).max(1);
    for i in 0..n {
        let node = i % nodes;
        let id = format!("blk{node:06}");
        let dev = devices[i % devices.len()];
        if i < nodes {
            ops.push(create_block(
                &format!("c{i}"),
                (i as u64) + 1,
                dev,
                "u",
                &id,
                None,
                "V",
            ));
        }
        ops.push(set_body(
            &format!("b{i}"),
            hlc((i as u64) + 1_000_000, dev),
            "u",
            &id,
            &format!("edit {i}"),
            None,
        ));
    }
    ops
}

#[test]
#[ignore]
fn replay_cost_curve() {
    for &n in &[10_000usize, 100_000, 500_000, 1_000_000] {
        let ops = generate(n);
        let total = ops.len();
        let start = Instant::now();
        let vault = replay(&ops);
        let elapsed = start.elapsed();
        eprintln!(
            "ops={total:>8}  nodes={:>7}  replay={:>8.1}ms  snapshot={}",
            vault.nodes.len(),
            elapsed.as_secs_f64() * 1000.0,
            &vault.snapshot_revision()[..12],
        );
    }
}
