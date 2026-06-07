//! Content-addressed identity (D08), merge-op id, and pure nanoid (no OS RNG).

use anchor_core::id::{journal_note_id, merge_op_id, mint_nanoid};

#[test]
fn journal_id_is_content_addressed_and_stable() {
    let a = journal_note_id("vault_demo_0001", "2026-06-07");
    let b = journal_note_id("vault_demo_0001", "2026-06-07");
    assert_eq!(a, b, "same vault+date must mint the same id");
    // Tied to the vendored BLAKE3 ground truth for the documented seed format.
    assert_eq!(
        a,
        "jnl_f99080f823e0815a8e1440955eb896d1c82d4ec371e19b2e0df89ad581f96b89"
    );
}

#[test]
fn journal_id_differs_by_vault_and_date() {
    let base = journal_note_id("vault_a", "2026-06-07");
    assert_ne!(base, journal_note_id("vault_b", "2026-06-07"));
    assert_ne!(base, journal_note_id("vault_a", "2026-06-08"));
    // Delimiter removes the `‖` ambiguity: (a, b) and (a:b, "") must not collide.
    assert_ne!(
        journal_note_id("a", "b"),
        journal_note_id("a:b", "")
    );
}

#[test]
fn merge_op_id_is_deterministic() {
    let a = merge_op_id("op_lower", "op_higher", 1);
    assert_eq!(a, merge_op_id("op_lower", "op_higher", 1));
    assert_ne!(a, merge_op_id("op_higher", "op_lower", 1));
    assert_ne!(a, merge_op_id("op_lower", "op_higher", 2));
    assert!(a.starts_with("mrg_"));
}

#[test]
fn nanoid_is_pure_function_of_entropy() {
    let id = mint_nanoid(&[0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);
    assert_eq!(id, mint_nanoid(&[0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]));
    // All characters are within the URL-safe alphabet.
    const ALPHABET: &str = "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    assert!(id.chars().all(|c| ALPHABET.contains(c)));
    assert_ne!(id, mint_nanoid(&[0x00; 8]));
}
