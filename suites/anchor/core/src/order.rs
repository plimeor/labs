//! Fractional-index order keys (D26).
//!
//! Keys are base-62 strings interpreted as fractions in `(0, 1)`. The alphabet
//! is in ascending ASCII order so plain byte (lexicographic) comparison equals
//! fraction comparison. **No floating point** is used anywhere — the generator
//! is the single pinned implementation, identical on every target by
//! construction; the cross-target vector set is the CI gate.
//!
//! Invariant: generated keys never end in the digit `'0'` (index 0), which keeps
//! lexicographic order consistent with fraction order even across differing
//! lengths (no value-equal prefixes).

use alloc::string::String;
use alloc::vec::Vec;

/// base-62 digits, ascending ASCII: '0'..'9' < 'A'..'Z' < 'a'..'z'.
const DIGITS: &[u8; 62] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE: u8 = 62;

#[derive(Debug, PartialEq, Eq)]
pub enum OrderError {
    /// `lower` was not strictly less than `upper`.
    NotOrdered,
    /// A key contained a character outside the base-62 alphabet.
    BadDigit,
    /// A key ended in the digit `'0'`, violating the no-trailing-zero invariant.
    TrailingZero,
}

fn index_of(c: u8) -> Result<u8, OrderError> {
    DIGITS
        .iter()
        .position(|&d| d == c)
        .map(|p| p as u8)
        .ok_or(OrderError::BadDigit)
}

fn parse(key: &str) -> Result<Vec<u8>, OrderError> {
    let bytes = key.as_bytes();
    if bytes.last() == Some(&b'0') {
        return Err(OrderError::TrailingZero);
    }
    bytes.iter().map(|&c| index_of(c)).collect()
}

fn render(digits: &[u8]) -> String {
    let mut s = String::with_capacity(digits.len());
    for &d in digits {
        s.push(DIGITS[d as usize] as char);
    }
    s
}

/// Strictly-between digit sequence. `lower` is `[]`-padded with 0; `upper` is
/// honoured only if `has_upper` (missing trailing digits = exact, i.e. 0),
/// otherwise the upper bound is `1.0` (boundary digit `BASE`).
fn between(lower: &[u8], upper: &[u8], has_upper: bool) -> Vec<u8> {
    let mut out = Vec::new();
    let mut i = 0;
    loop {
        let lo = lower.get(i).copied().unwrap_or(0);
        let hi = if has_upper {
            upper.get(i).copied().unwrap_or(0)
        } else {
            BASE
        };
        if lo == hi {
            out.push(lo);
            i += 1;
            continue;
        }
        // lo < hi is guaranteed by the caller's ordering check.
        let mid = (lo + hi) / 2;
        if mid != lo {
            out.push(mid);
            return out;
        }
        // hi == lo + 1: no room at this position. Take the lower digit; deeper
        // positions are then unconstrained from above (we are already below the
        // upper bound), so find something strictly greater than the lower tail.
        out.push(lo);
        i += 1;
        let tail = between(&lower[i..], &[], false);
        out.extend(tail);
        return out;
    }
}

/// A key strictly between `lower` and `upper` (either may be `None` for an open
/// bound). `key_between(None, None)` is the canonical first key.
pub fn key_between(lower: Option<&str>, upper: Option<&str>) -> Result<String, OrderError> {
    let lo = match lower {
        Some(s) => parse(s)?,
        None => Vec::new(),
    };
    match upper {
        Some(s) => {
            let hi = parse(s)?;
            if lower.is_some() && lower >= upper {
                return Err(OrderError::NotOrdered);
            }
            // Empty lower bound + any upper still needs lo < hi as fractions;
            // lo = [] (=0) < any non-empty hi, so this holds.
            Ok(render(&between(&lo, &hi, true)))
        }
        None => Ok(render(&between(&lo, &[], false))),
    }
}

/// Generate `n` evenly-spread keys after `after` (open right bound). Useful for
/// seeding a list deterministically.
pub fn keys_after(after: Option<&str>, n: usize) -> Result<Vec<String>, OrderError> {
    let mut out = Vec::with_capacity(n);
    let mut prev = after.map(String::from);
    for _ in 0..n {
        let next = key_between(prev.as_deref(), None)?;
        prev = Some(next.clone());
        out.push(next);
    }
    Ok(out)
}
