//! Canonical serialization (JCS-style) and content-address revisions (D30).
//!
//! Rules: recursively sorted object keys, fixed string escaping, no insignificant
//! whitespace, **integers only — `f64` is unrepresentable** (no float variant),
//! numbers as canonical decimal. The output bytes are identical on every target,
//! so `rev = blake3(canonical_bytes(value))` and `snapshot_revision` are stable
//! across runs and devices, excluding any actor/jitter metadata by construction
//! (callers simply do not put it into the `CanonicalValue`).

use crate::hash;
use alloc::collections::BTreeMap;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

/// A value that can be canonically serialized. No floating-point variant exists,
/// which enforces the "no `f64` in hashed values" rule at the type level.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CanonicalValue {
    Null,
    Bool(bool),
    /// Reserved for future signed fields; currently exercised only by a determinism vector.
    Int(i64),
    UInt(u64),
    Str(String),
    Array(Vec<CanonicalValue>),
    /// Keys are sorted by construction (BTreeMap), giving recursive key ordering.
    Object(BTreeMap<String, CanonicalValue>),
}

impl CanonicalValue {
    pub fn str(s: impl Into<String>) -> Self {
        CanonicalValue::Str(s.into())
    }

    pub fn array(items: Vec<CanonicalValue>) -> Self {
        CanonicalValue::Array(items)
    }

    /// Build an object from key/value pairs; later duplicate keys overwrite.
    pub fn object<I>(pairs: I) -> Self
    where
        I: IntoIterator<Item = (&'static str, CanonicalValue)>,
    {
        let mut map = BTreeMap::new();
        for (k, v) in pairs {
            map.insert(k.to_string(), v);
        }
        CanonicalValue::Object(map)
    }

    /// Optional string field helper: `None` → `Null`.
    pub fn opt_str(s: &Option<String>) -> Self {
        match s {
            Some(v) => CanonicalValue::Str(v.clone()),
            None => CanonicalValue::Null,
        }
    }
}

fn escape_into(s: &str, out: &mut Vec<u8>) {
    out.push(b'"');
    for ch in s.chars() {
        match ch {
            '"' => out.extend_from_slice(b"\\\""),
            '\\' => out.extend_from_slice(b"\\\\"),
            '\n' => out.extend_from_slice(b"\\n"),
            '\r' => out.extend_from_slice(b"\\r"),
            '\t' => out.extend_from_slice(b"\\t"),
            '\u{0008}' => out.extend_from_slice(b"\\b"),
            '\u{000C}' => out.extend_from_slice(b"\\f"),
            c if (c as u32) < 0x20 => {
                // \u00XX for other control characters.
                let code = c as u32;
                out.extend_from_slice(b"\\u00");
                out.push(hash::HEX_LOWER[((code >> 4) & 0xf) as usize]);
                out.push(hash::HEX_LOWER[(code & 0xf) as usize]);
            }
            c => {
                let mut buf = [0u8; 4];
                let encoded = c.encode_utf8(&mut buf);
                out.extend_from_slice(encoded.as_bytes());
            }
        }
    }
    out.push(b'"');
}

fn write_value(value: &CanonicalValue, out: &mut Vec<u8>) {
    match value {
        CanonicalValue::Null => out.extend_from_slice(b"null"),
        CanonicalValue::Bool(true) => out.extend_from_slice(b"true"),
        CanonicalValue::Bool(false) => out.extend_from_slice(b"false"),
        CanonicalValue::Int(n) => out.extend_from_slice(n.to_string().as_bytes()),
        CanonicalValue::UInt(n) => out.extend_from_slice(n.to_string().as_bytes()),
        CanonicalValue::Str(s) => escape_into(s, out),
        CanonicalValue::Array(items) => {
            out.push(b'[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(b',');
                }
                write_value(item, out);
            }
            out.push(b']');
        }
        CanonicalValue::Object(map) => {
            out.push(b'{');
            for (i, (k, v)) in map.iter().enumerate() {
                if i > 0 {
                    out.push(b',');
                }
                escape_into(k, out);
                out.push(b':');
                write_value(v, out);
            }
            out.push(b'}');
        }
    }
}

/// Canonical byte encoding of a value.
pub fn canonical_bytes(value: &CanonicalValue) -> Vec<u8> {
    let mut out = Vec::new();
    write_value(value, &mut out);
    out
}

/// Canonical string encoding (valid UTF-8 by construction).
pub fn canonical_string(value: &CanonicalValue) -> String {
    let bytes = canonical_bytes(value);
    debug_assert!(
        core::str::from_utf8(&bytes).is_ok(),
        "canonical bytes must be UTF-8"
    );
    String::from_utf8(bytes).expect("canonical output is valid UTF-8")
}

/// Content-address revision of a value: lowercase hex BLAKE3 of its canonical
/// bytes. This is `rev` / `sub_rev` / `snapshot_revision`.
pub fn rev(value: &CanonicalValue) -> String {
    hash::hash_hex(&canonical_bytes(value))
}
