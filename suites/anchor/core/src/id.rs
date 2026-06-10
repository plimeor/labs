//! Identity: content-addressed journal ids, deterministic merge-op ids, and a
//! pure entropy→nanoid minter.
//!
//! The core never calls a platform RNG. Random ids (regular Note/Block nanoids)
//! are minted from caller-supplied entropy bytes; content-addressed ids (journal
//! notes, deterministically-minted merge ops) are pure functions of their
//! inputs. This keeps the deterministic path free of OS randomness (D36).

use crate::hash;
use alloc::format;
use alloc::string::String;

/// URL-safe nanoid alphabet (64 symbols).
const NANOID_ALPHABET: &[u8; 64] =
    b"_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/// Content-addressed journal Note id (D08 / conflict §6.9).
///
/// The CP-0 contract states `note_id = blake3("journal:" ‖ vault_id ‖
/// calendar_date)`. This is the Stage-1 concrete realization of the abstract
/// `‖`: a colon-delimited seed, so that `(vault="a", date="b")` can never
/// collide with `(vault="a:b", date="")`. `vault_id` is a nanoid (no `:`) and
/// `calendar_date` is fixed-width ISO `YYYY-MM-DD` (no `:`), so the delimiter is
/// unambiguous. Same vault + same calendar date ⇒ same id, by construction
/// (identity invariant; no runtime dedup).
pub fn journal_note_id(vault_id: &str, calendar_date: &str) -> String {
    let seed = format!("journal:{vault_id}:{calendar_date}");
    let digest = hash::hash_hex(seed.as_bytes());
    format!("jnl_{digest}")
}

/// Deterministically-minted merge-op id (conflict §5.1 / §7.3).
///
/// `op_id = blake3("merge" ‖ lower.op_id ‖ higher.op_id ‖ diff_algo_version)`.
/// A single emitter mints this; `op_id` dedup converges every device to one op.
pub fn merge_op_id(lower_op_id: &str, higher_op_id: &str, diff_algo_version: u32) -> String {
    let seed = format!("merge:{lower_op_id}:{higher_op_id}:{diff_algo_version}");
    let digest = hash::hash_hex(seed.as_bytes());
    format!("mrg_{digest}")
}

/// Pure entropy → nanoid. The platform supplies `entropy`; the core maps it onto
/// the alphabet. 16 bytes → a 21-ish char id. Deterministic for given entropy
/// (so tests are reproducible), but the core itself never generates entropy.
pub fn mint_nanoid(entropy: &[u8]) -> String {
    // ceil(8*len / 6) output symbols, 6 bits each.
    let mut out = String::with_capacity((entropy.len() * 8).div_ceil(6));
    // 6 bits per output symbol; pack the entropy bitstream.
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    for &byte in entropy {
        acc = (acc << 8) | byte as u32;
        bits += 8;
        while bits >= 6 {
            bits -= 6;
            let idx = ((acc >> bits) & 0x3f) as usize;
            out.push(NANOID_ALPHABET[idx] as char);
        }
    }
    if bits > 0 {
        let idx = ((acc << (6 - bits)) & 0x3f) as usize;
        out.push(NANOID_ALPHABET[idx] as char);
    }
    out
}
