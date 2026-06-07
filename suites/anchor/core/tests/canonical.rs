//! Canonical serialization determinism (D30).

use anchor_core::canonical::{canonical_bytes, canonical_string, rev, CanonicalValue};

#[test]
fn object_keys_are_recursively_sorted() {
    // Insertion order must not affect output: keys come out sorted.
    let a = CanonicalValue::object([
        ("z", CanonicalValue::Int(1)),
        ("a", CanonicalValue::Int(2)),
        (
            "m",
            CanonicalValue::object([("y", CanonicalValue::Int(3)), ("x", CanonicalValue::Int(4))]),
        ),
    ]);
    assert_eq!(canonical_string(&a), "{\"a\":2,\"m\":{\"x\":4,\"y\":3},\"z\":1}");
}

#[test]
fn deterministic_across_construction_order() {
    let a = CanonicalValue::object([("b", CanonicalValue::Int(1)), ("a", CanonicalValue::Int(2))]);
    let b = CanonicalValue::object([("a", CanonicalValue::Int(2)), ("b", CanonicalValue::Int(1))]);
    assert_eq!(canonical_bytes(&a), canonical_bytes(&b));
    assert_eq!(rev(&a), rev(&b));
}

#[test]
fn integers_are_canonical_decimal() {
    assert_eq!(canonical_string(&CanonicalValue::Int(-12)), "-12");
    assert_eq!(canonical_string(&CanonicalValue::Int(0)), "0");
    assert_eq!(canonical_string(&CanonicalValue::UInt(42)), "42");
}

#[test]
fn string_escaping_is_fixed() {
    // Quote, backslash, newline, tab, backspace, and a generic control char.
    let v = CanonicalValue::str("a\"b\\c\nd\te\u{0008}f\u{0001}g");
    // Expected bytes: "a\"b\\c\nd\te\bfg"  (with literal backslash escapes)
    let expected: &[u8] = b"\"a\\\"b\\\\c\\nd\\te\\bf\\u0001g\"";
    assert_eq!(canonical_bytes(&v), expected.to_vec());
}

#[test]
fn non_ascii_is_literal_utf8() {
    let v = CanonicalValue::str("café—日本語");
    // Non-ASCII passes through as UTF-8 (JCS rule), wrapped in quotes.
    assert_eq!(canonical_string(&v), "\"café—日本語\"");
}

#[test]
fn rev_is_stable_and_excludes_nothing_unexpected() {
    let v = CanonicalValue::str("anchor:cell:body");
    assert_eq!(rev(&v).len(), 64);
    // Null hashes the literal bytes `null`.
    assert_eq!(rev(&CanonicalValue::Null), anchor_core::hash::hash_hex(b"null"));
}
