//! Fractional-index order keys (D26): strictly-between, ordered, deterministic,
//! no floating point, no trailing zero.

use anchor_core::order::{key_between, keys_after, OrderError};

#[test]
fn first_key_is_canonical() {
    assert_eq!(key_between(None, None).unwrap(), "V");
}

#[test]
fn keys_are_strictly_between() {
    let a = key_between(None, None).unwrap(); // "V"
    let before = key_between(None, Some(&a)).unwrap();
    let after = key_between(Some(&a), None).unwrap();
    assert!(before < a, "{before} should sort before {a}");
    assert!(a < after, "{a} should sort before {after}");

    let mid = key_between(Some(&before), Some(&a)).unwrap();
    assert!(before < mid && mid < a, "{before} < {mid} < {a}");
}

#[test]
fn deterministic_same_inputs_same_bytes() {
    // The pinned generator: identical inputs ⇒ byte-identical key.
    let k1 = key_between(Some("5"), Some("6")).unwrap();
    let k2 = key_between(Some("5"), Some("6")).unwrap();
    assert_eq!(k1, k2);
    assert!("5" < k1.as_str() && k1.as_str() < "6");
}

#[test]
fn rejects_misordered_bounds() {
    assert_eq!(key_between(Some("6"), Some("5")), Err(OrderError::NotOrdered));
    assert_eq!(key_between(Some("5"), Some("5")), Err(OrderError::NotOrdered));
}

#[test]
fn no_trailing_zero_invariant() {
    // Generate many keys and confirm none end in '0' and all stay ordered.
    let keys = keys_after(None, 64).unwrap();
    for k in &keys {
        assert!(!k.ends_with('0'), "key {k} ends in trailing zero");
    }
    let mut sorted = keys.clone();
    sorted.sort();
    assert_eq!(keys, sorted, "sequential keys must already be sorted");
}

#[test]
fn dense_insertions_stay_ordered() {
    // Repeatedly insert between the first two keys; order must hold.
    let mut lo = key_between(None, None).unwrap();
    let hi = key_between(Some(&lo), None).unwrap();
    for _ in 0..40 {
        let mid = key_between(Some(&lo), Some(&hi)).unwrap();
        assert!(lo < mid && mid < hi);
        lo = mid;
    }
}
