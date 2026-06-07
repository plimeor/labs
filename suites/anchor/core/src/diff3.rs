//! The single pinned deterministic 3-way merge (D19, `DIFF_ALGO_VERSION`).
//!
//! Line-level diff3: disjoint hunks auto-merge; overlapping hunks report a
//! conflict (the caller then does keep-both, never silent LWW). The LCS uses a
//! fixed tie-break, so the output is identical on every target by construction —
//! the cross-target vector set is the CI gate, not a per-platform reimplementation.
//!
//! Also provides UTF-16 char-level splice derivation so marks can be re-clamped
//! from a winning side's coordinates into merged-text coordinates.

use crate::marks::Splice;
use alloc::collections::BTreeMap;
use alloc::string::String;
use alloc::vec::Vec;

/// Outcome of a 3-way merge.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Diff3Outcome {
    /// Clean auto-merge (disjoint hunks).
    Merged(Vec<String>),
    /// Overlapping change — caller performs keep-both.
    Conflict,
}

/// Longest common subsequence as matched index pairs, with a deterministic
/// tie-break (prefer the diagonal, then "up", then "left").
fn lcs_pairs<T: PartialEq>(a: &[T], b: &[T]) -> Vec<(usize, usize)> {
    let n = a.len();
    let m = b.len();
    // dp[i][j] = LCS length of a[i..], b[j..].
    let mut dp = alloc::vec![alloc::vec![0u32; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[i][j] = if a[i] == b[j] {
                dp[i + 1][j + 1] + 1
            } else {
                dp[i + 1][j].max(dp[i][j + 1])
            };
        }
    }
    let mut pairs = Vec::new();
    let (mut i, mut j) = (0usize, 0usize);
    while i < n && j < m {
        if a[i] == b[j] {
            pairs.push((i, j));
            i += 1;
            j += 1;
        } else if dp[i + 1][j] >= dp[i][j + 1] {
            i += 1;
        } else {
            j += 1;
        }
    }
    pairs
}

fn matched_map<T: PartialEq>(base: &[T], other: &[T]) -> BTreeMap<usize, usize> {
    let mut map = BTreeMap::new();
    for (b, o) in lcs_pairs(base, other) {
        map.insert(b, o);
    }
    map
}

fn process_region(
    base_s: &[String],
    a_s: &[String],
    b_s: &[String],
    out: &mut Vec<String>,
    conflict: &mut bool,
) {
    if a_s == base_s {
        out.extend_from_slice(b_s); // only b changed
    } else if b_s == base_s {
        out.extend_from_slice(a_s); // only a changed
    } else if a_s == b_s {
        out.extend_from_slice(a_s); // identical change on both sides
    } else {
        *conflict = true;
    }
}

/// Deterministic line-level 3-way merge of `(base, a, b)`.
pub fn diff3_lines(base: &[String], a: &[String], b: &[String]) -> Diff3Outcome {
    let map_a = matched_map(base, a);
    let map_b = matched_map(base, b);

    // Anchors: base indices matched in BOTH a and b. BTreeMap keys are sorted.
    let mut points: Vec<(usize, usize, usize)> = Vec::new();
    for (&bi, &ai) in &map_a {
        if let Some(&bbi) = map_b.get(&bi) {
            points.push((bi, ai, bbi));
        }
    }

    let mut out = Vec::new();
    let mut conflict = false;
    let (mut cb, mut ca, mut cbb) = (0usize, 0usize, 0usize);
    for &(pi, pai, pbi) in &points {
        process_region(
            &base[cb..pi],
            &a[ca..pai],
            &b[cbb..pbi],
            &mut out,
            &mut conflict,
        );
        out.push(base[pi].clone());
        cb = pi + 1;
        ca = pai + 1;
        cbb = pbi + 1;
    }
    process_region(&base[cb..], &a[ca..], &b[cbb..], &mut out, &mut conflict);

    if conflict {
        Diff3Outcome::Conflict
    } else {
        Diff3Outcome::Merged(out)
    }
}

/// Split text into lines on `'\n'` (the soft-newline within a body cell).
pub fn split_lines(text: &str) -> Vec<String> {
    text.split('\n').map(String::from).collect()
}

/// Join lines back with `'\n'`.
pub fn join_lines(lines: &[String]) -> String {
    lines.join("\n")
}

/// UTF-16 code units of a string (the external offset unit, D18).
pub fn to_utf16(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

/// Derive ascending, non-overlapping splices that turn `from` into `to`, in
/// `from`'s UTF-16 coordinates. Used to re-clamp marks living on the `from` side.
pub fn text_splices(from: &str, to: &str) -> Vec<Splice> {
    let fu = to_utf16(from);
    let tu = to_utf16(to);
    let pairs = lcs_pairs(&fu, &tu);

    let mut splices = Vec::new();
    let (mut fi, mut ti) = (0usize, 0usize);
    for (mf, mt) in pairs {
        let old_len = (mf - fi) as u32;
        let new_len = (mt - ti) as u32;
        if old_len != 0 || new_len != 0 {
            splices.push(Splice {
                at: fi as u32,
                old_len,
                new_len,
            });
        }
        fi = mf + 1;
        ti = mt + 1;
    }
    let old_len = (fu.len() - fi) as u32;
    let new_len = (tu.len() - ti) as u32;
    if old_len != 0 || new_len != 0 {
        splices.push(Splice {
            at: fi as u32,
            old_len,
            new_len,
        });
    }
    splices
}
