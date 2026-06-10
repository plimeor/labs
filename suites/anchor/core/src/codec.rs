//! Round-trippable op-segment codec — the op-log file format (D24).
//!
//! `encode_segment` writes an op slice as one canonical JSON array of full op
//! envelopes (`op::op_envelope_canonical`); `decode_segment` parses those bytes
//! back into `Vec<Op>`. Decoding is **strict**: segments are immutable and
//! content-addressed (`SegmentId::of_bytes`), so the only admissible byte form
//! is the canonical one. After decoding, the segment is re-encoded and compared
//! byte-for-byte; any deviation (whitespace, key order, duplicate or unknown
//! fields, non-shortest numbers) is rejected as [`CodecError::NonCanonical`].
//! The parser is `no_std` + `alloc` with zero dependencies and admits integers
//! only (no float syntax), matching `CanonicalValue` exactly.

use crate::canonical::{canonical_bytes, CanonicalValue};
use crate::hlc::Hlc;
use crate::marks::Mark;
use crate::model::{Life, Location, TargetKind};
use crate::op::{Op, OpKind, OpPayload, Register, SubFieldKey};
use alloc::collections::{BTreeMap, BTreeSet};
use alloc::string::String;
use alloc::vec::Vec;

/// Typed decode failures. `Syntax.offset` is a byte offset into the input.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CodecError {
    /// Input was not valid UTF-8.
    Utf8,
    /// Malformed or unsupported JSON (floats, lone surrogates, over-deep
    /// nesting, trailing bytes) at `offset`.
    Syntax { offset: usize },
    /// The segment root was not an array of envelope objects.
    Shape,
    /// Envelope `index` declares an `op_envelope_version` this build does not
    /// understand; decoding it would misread the frozen shape.
    UnsupportedVersion { index: usize, version: u64 },
    /// Envelope `index` is missing `field`, or carries a wrong type/value for it.
    Envelope { index: usize, field: &'static str },
    /// Parsed, but not in canonical form: re-encoding produced different bytes,
    /// so the input cannot be the content-addressed segment it claims to be.
    NonCanonical,
}

/// Canonical bytes of an op segment: the full D24 op envelope per op. This is
/// the byte surface `SegmentId::of_bytes` addresses and `decode_segment` inverts.
pub fn encode_segment(ops: &[Op]) -> Vec<u8> {
    let items = ops
        .iter()
        .map(crate::op::op_envelope_canonical)
        .collect::<Vec<_>>();
    canonical_bytes(&CanonicalValue::array(items))
}

/// Decode canonical segment bytes back into ops (strict; see module docs).
pub fn decode_segment(bytes: &[u8]) -> Result<Vec<Op>, CodecError> {
    let value = parse_canonical(bytes)?;
    let CanonicalValue::Array(items) = value else {
        return Err(CodecError::Shape);
    };
    let mut ops = Vec::with_capacity(items.len());
    for (index, item) in items.iter().enumerate() {
        ops.push(decode_op(item, index)?);
    }
    if encode_segment(&ops) != bytes {
        return Err(CodecError::NonCanonical);
    }
    Ok(ops)
}

/// Parse canonical JSON bytes into a [`CanonicalValue`]. Strict by construction:
/// no whitespace, integers only, bounded nesting. (Canonical-*form* enforcement —
/// key order, shortest numbers — is the re-encode check in [`decode_segment`];
/// this parser alone accepts any structurally valid canonical-subset document.)
pub fn parse_canonical(bytes: &[u8]) -> Result<CanonicalValue, CodecError> {
    if core::str::from_utf8(bytes).is_err() {
        return Err(CodecError::Utf8);
    }
    let mut parser = Parser { bytes, pos: 0 };
    let value = parser.value(0)?;
    if parser.pos != bytes.len() {
        return Err(CodecError::Syntax { offset: parser.pos });
    }
    Ok(value)
}

/// Nesting bound: a malformed segment must not be able to overflow the stack.
/// Real envelopes nest 4 levels deep.
const MAX_DEPTH: u32 = 64;

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Parser<'a> {
    fn fail<T>(&self) -> Result<T, CodecError> {
        Err(CodecError::Syntax { offset: self.pos })
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn next(&mut self) -> Result<u8, CodecError> {
        match self.peek() {
            Some(b) => {
                self.pos += 1;
                Ok(b)
            }
            None => self.fail(),
        }
    }

    fn expect(&mut self, b: u8) -> Result<(), CodecError> {
        if self.peek() == Some(b) {
            self.pos += 1;
            Ok(())
        } else {
            self.fail()
        }
    }

    fn expect_literal(&mut self, lit: &[u8]) -> Result<(), CodecError> {
        if self.bytes[self.pos..].starts_with(lit) {
            self.pos += lit.len();
            Ok(())
        } else {
            self.fail()
        }
    }

    fn value(&mut self, depth: u32) -> Result<CanonicalValue, CodecError> {
        if depth > MAX_DEPTH {
            return self.fail();
        }
        match self.peek() {
            Some(b'n') => {
                self.expect_literal(b"null")?;
                Ok(CanonicalValue::Null)
            }
            Some(b't') => {
                self.expect_literal(b"true")?;
                Ok(CanonicalValue::Bool(true))
            }
            Some(b'f') => {
                self.expect_literal(b"false")?;
                Ok(CanonicalValue::Bool(false))
            }
            Some(b'"') => Ok(CanonicalValue::Str(self.string()?)),
            Some(b'[') => self.array(depth),
            Some(b'{') => self.object(depth),
            Some(b'-') | Some(b'0'..=b'9') => self.number(),
            _ => self.fail(),
        }
    }

    fn array(&mut self, depth: u32) -> Result<CanonicalValue, CodecError> {
        self.expect(b'[')?;
        let mut items = Vec::new();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(CanonicalValue::Array(items));
        }
        loop {
            items.push(self.value(depth + 1)?);
            match self.next()? {
                b',' => continue,
                b']' => return Ok(CanonicalValue::Array(items)),
                _ => {
                    self.pos -= 1;
                    return self.fail();
                }
            }
        }
    }

    fn object(&mut self, depth: u32) -> Result<CanonicalValue, CodecError> {
        self.expect(b'{')?;
        let mut map = BTreeMap::new();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(CanonicalValue::Object(map));
        }
        loop {
            let key = self.string()?;
            self.expect(b':')?;
            let value = self.value(depth + 1)?;
            // A duplicate key overwrites here; the re-encode check then fails,
            // so duplicates are rejected without parser-level bookkeeping.
            map.insert(key, value);
            match self.next()? {
                b',' => continue,
                b'}' => return Ok(CanonicalValue::Object(map)),
                _ => {
                    self.pos -= 1;
                    return self.fail();
                }
            }
        }
    }

    fn string(&mut self) -> Result<String, CodecError> {
        self.expect(b'"')?;
        let mut out: Vec<u8> = Vec::new();
        loop {
            let b = self.next()?;
            match b {
                b'"' => {
                    return String::from_utf8(out).map_err(|_| CodecError::Syntax {
                        offset: self.pos,
                    })
                }
                b'\\' => self.escape(&mut out)?,
                0x00..=0x1f => {
                    self.pos -= 1;
                    return self.fail();
                }
                _ => out.push(b),
            }
        }
    }

    fn escape(&mut self, out: &mut Vec<u8>) -> Result<(), CodecError> {
        match self.next()? {
            b'"' => out.push(b'"'),
            b'\\' => out.push(b'\\'),
            b'/' => out.push(b'/'),
            b'n' => out.push(b'\n'),
            b'r' => out.push(b'\r'),
            b't' => out.push(b'\t'),
            b'b' => out.push(0x08),
            b'f' => out.push(0x0c),
            b'u' => {
                let hi = self.hex4()?;
                let code = match hi {
                    0xD800..=0xDBFF => {
                        // High surrogate: a low surrogate escape must follow.
                        self.expect(b'\\')?;
                        self.expect(b'u')?;
                        let lo = self.hex4()?;
                        if !(0xDC00..=0xDFFF).contains(&lo) {
                            return self.fail();
                        }
                        0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00)
                    }
                    0xDC00..=0xDFFF => return self.fail(), // lone low surrogate
                    c => c,
                };
                let ch = char::from_u32(code).ok_or(CodecError::Syntax { offset: self.pos })?;
                let mut buf = [0u8; 4];
                out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
            }
            _ => {
                self.pos -= 1;
                return self.fail();
            }
        }
        Ok(())
    }

    fn hex4(&mut self) -> Result<u32, CodecError> {
        let mut code: u32 = 0;
        for _ in 0..4 {
            let d = match self.next()? {
                c @ b'0'..=b'9' => (c - b'0') as u32,
                c @ b'a'..=b'f' => (c - b'a' + 10) as u32,
                c @ b'A'..=b'F' => (c - b'A' + 10) as u32,
                _ => {
                    self.pos -= 1;
                    return self.fail();
                }
            };
            code = (code << 4) | d;
        }
        Ok(code)
    }

    fn number(&mut self) -> Result<CanonicalValue, CodecError> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        let digits_start = self.pos;
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.pos += 1;
        }
        if self.pos == digits_start {
            return self.fail();
        }
        // Floats are unrepresentable in CanonicalValue — reject the syntax.
        if matches!(self.peek(), Some(b'.') | Some(b'e') | Some(b'E')) {
            return self.fail();
        }
        let text = core::str::from_utf8(&self.bytes[start..self.pos])
            .expect("digits and '-' are ASCII");
        if text.starts_with('-') {
            match text.parse::<i64>() {
                Ok(v) => Ok(CanonicalValue::Int(v)),
                Err(_) => Err(CodecError::Syntax { offset: start }),
            }
        } else {
            match text.parse::<u64>() {
                Ok(v) => Ok(CanonicalValue::UInt(v)),
                Err(_) => Err(CodecError::Syntax { offset: start }),
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Envelope decoding
// ---------------------------------------------------------------------------

/// One envelope's field accessors, carrying the op index for typed errors.
struct Env<'a> {
    index: usize,
    map: &'a BTreeMap<String, CanonicalValue>,
}

impl<'a> Env<'a> {
    fn err<T>(&self, field: &'static str) -> Result<T, CodecError> {
        Err(CodecError::Envelope {
            index: self.index,
            field,
        })
    }

    fn get(&self, field: &'static str) -> Result<&'a CanonicalValue, CodecError> {
        match self.map.get(field) {
            Some(v) => Ok(v),
            None => self.err(field),
        }
    }

    fn str_field(&self, field: &'static str) -> Result<String, CodecError> {
        match self.get(field)? {
            CanonicalValue::Str(s) => Ok(s.clone()),
            _ => self.err(field),
        }
    }

    fn opt_str_field(&self, field: &'static str) -> Result<Option<String>, CodecError> {
        match self.get(field)? {
            CanonicalValue::Null => Ok(None),
            CanonicalValue::Str(s) => Ok(Some(s.clone())),
            _ => self.err(field),
        }
    }

    fn uint_field(&self, field: &'static str) -> Result<u64, CodecError> {
        match self.get(field)? {
            CanonicalValue::UInt(v) => Ok(*v),
            _ => self.err(field),
        }
    }

    fn uint32_field(&self, field: &'static str) -> Result<u32, CodecError> {
        match u32::try_from(self.uint_field(field)?) {
            Ok(v) => Ok(v),
            Err(_) => self.err(field),
        }
    }

    fn opt_uint32_field(&self, field: &'static str) -> Result<Option<u32>, CodecError> {
        match self.get(field)? {
            CanonicalValue::Null => Ok(None),
            CanonicalValue::UInt(v) => match u32::try_from(*v) {
                Ok(v) => Ok(Some(v)),
                Err(_) => self.err(field),
            },
            _ => self.err(field),
        }
    }

    fn bool_field(&self, field: &'static str) -> Result<bool, CodecError> {
        match self.get(field)? {
            CanonicalValue::Bool(b) => Ok(*b),
            _ => self.err(field),
        }
    }

    fn object_field(&self, field: &'static str) -> Result<Env<'a>, CodecError> {
        match self.get(field)? {
            CanonicalValue::Object(map) => Ok(Env {
                index: self.index,
                map,
            }),
            _ => self.err(field),
        }
    }
}

fn decode_op(value: &CanonicalValue, index: usize) -> Result<Op, CodecError> {
    let CanonicalValue::Object(map) = value else {
        return Err(CodecError::Envelope {
            index,
            field: "envelope",
        });
    };
    let env = Env { index, map };

    let version = env.uint_field("op_envelope_version")?;
    if version != crate::OP_ENVELOPE_VERSION as u64 {
        return Err(CodecError::UnsupportedVersion { index, version });
    }

    Ok(Op {
        op_id: env.str_field("op_id")?,
        op_envelope_version: crate::OP_ENVELOPE_VERSION,
        hlc: decode_hlc(&env.object_field("hlc")?)?,
        actor: env.str_field("actor")?,
        seq: env.uint_field("seq")?,
        target_id: env.str_field("target_id")?,
        target_kind: decode_target_kind(&env, env.str_field("target_kind")?.as_str(), "target_kind")?,
        register: match env.str_field("register")?.as_str() {
            "location" => Register::Location,
            "content" => Register::Content,
            "life" => Register::Life,
            _ => return env.err("register"),
        },
        sub_field_key: match env.opt_str_field("sub_field_key")? {
            None => None,
            Some(s) => Some(decode_sub_field_key(&env, &s)?),
        },
        op_kind: decode_op_kind(&env, env.str_field("op_kind")?.as_str())?,
        base_register_rev: env.opt_str_field("base_register_rev")?,
        new_register_rev: env.opt_str_field("new_register_rev")?,
        base_sub_rev: env.opt_str_field("base_sub_rev")?,
        new_sub_rev: env.opt_str_field("new_sub_rev")?,
        supersedes_rev: env.opt_str_field("supersedes_rev")?,
        dominates_frontier: decode_frontier(&env)?,
        observed_adds: decode_observed_adds(&env)?,
        macro_op_id: env.opt_str_field("macro_op_id")?,
        macro_size: env.opt_uint32_field("macro_size")?,
        diff_algo_version: env.opt_uint32_field("diff_algo_version")?,
        provenance: env.opt_str_field("provenance")?,
        approval_state: env.opt_str_field("approval_state")?,
        payload: decode_payload(&env.object_field("payload")?)?,
    })
}

fn decode_hlc(env: &Env) -> Result<Hlc, CodecError> {
    Ok(Hlc {
        wall: env.uint_field("wall")?,
        logical: env.uint32_field("logical")?,
        device: env.str_field("device")?,
    })
}

fn decode_target_kind(env: &Env, s: &str, field: &'static str) -> Result<TargetKind, CodecError> {
    match s {
        "note" => Ok(TargetKind::Note),
        "block" => Ok(TargetKind::Block),
        _ => env.err(field),
    }
}

fn decode_sub_field_key(env: &Env, s: &str) -> Result<SubFieldKey, CodecError> {
    if s == "body" {
        return Ok(SubFieldKey::Body);
    }
    if s == "type_id" {
        return Ok(SubFieldKey::TypeId);
    }
    if let Some(key) = s.strip_prefix("props:") {
        return Ok(SubFieldKey::Prop(String::from(key)));
    }
    if let Some(tag) = s.strip_prefix("tags:") {
        return Ok(SubFieldKey::Tag(String::from(tag)));
    }
    env.err("sub_field_key")
}

fn decode_op_kind(env: &Env, s: &str) -> Result<OpKind, CodecError> {
    match s {
        "set" => Ok(OpKind::Set),
        "move" => Ok(OpKind::Move),
        "tag_add" => Ok(OpKind::TagAdd),
        "tag_remove" => Ok(OpKind::TagRemove),
        "life_set" => Ok(OpKind::LifeSet),
        "restore" => Ok(OpKind::Restore),
        "create" => Ok(OpKind::Create),
        "split" => Ok(OpKind::Split),
        "merge" => Ok(OpKind::Merge),
        "renormalize" => Ok(OpKind::Renormalize),
        _ => env.err("op_kind"),
    }
}

fn decode_life(env: &Env, s: &str) -> Result<Life, CodecError> {
    match s {
        "active" => Ok(Life::Active),
        "archived" => Ok(Life::Archived),
        "trashed" => Ok(Life::Trashed),
        "deleted" => Ok(Life::Deleted),
        _ => env.err("payload.life"),
    }
}

fn decode_frontier(env: &Env) -> Result<Option<BTreeMap<String, Hlc>>, CodecError> {
    match env.get("dominates_frontier")? {
        CanonicalValue::Null => Ok(None),
        CanonicalValue::Object(map) => {
            let mut out = BTreeMap::new();
            for (device, value) in map {
                let CanonicalValue::Object(hlc_map) = value else {
                    return env.err("dominates_frontier");
                };
                let hlc_env = Env {
                    index: env.index,
                    map: hlc_map,
                };
                out.insert(device.clone(), decode_hlc(&hlc_env)?);
            }
            Ok(Some(out))
        }
        _ => env.err("dominates_frontier"),
    }
}

fn decode_observed_adds(env: &Env) -> Result<Option<BTreeSet<String>>, CodecError> {
    match env.get("observed_adds")? {
        CanonicalValue::Null => Ok(None),
        CanonicalValue::Array(items) => {
            let mut out = BTreeSet::new();
            for item in items {
                let CanonicalValue::Str(id) = item else {
                    return env.err("observed_adds");
                };
                out.insert(id.clone());
            }
            Ok(Some(out))
        }
        _ => env.err("observed_adds"),
    }
}

fn decode_location(env: &Env) -> Result<Location, CodecError> {
    Ok(Location {
        parent: env.opt_str_field("parent")?,
        order: env.str_field("order")?,
    })
}

fn decode_marks(env: &Env) -> Result<Vec<Mark>, CodecError> {
    let CanonicalValue::Array(items) = env.get("marks")? else {
        return env.err("payload.marks");
    };
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        let CanonicalValue::Object(map) = item else {
            return env.err("payload.marks");
        };
        let mark_env = Env {
            index: env.index,
            map,
        };
        out.push(Mark {
            kind: mark_env.str_field("kind")?,
            start: mark_env.uint32_field("start")?,
            end: mark_env.uint32_field("end")?,
            expand: mark_env.bool_field("expand")?,
        });
    }
    Ok(out)
}

fn decode_payload(env: &Env) -> Result<OpPayload, CodecError> {
    match env.str_field("kind")?.as_str() {
        "create" => Ok(OpPayload::Create {
            kind: decode_target_kind(env, env.str_field("target_kind")?.as_str(), "payload.target_kind")?,
            location: decode_location(&env.object_field("location")?)?,
        }),
        "set_location" => Ok(OpPayload::SetLocation {
            parent: env.opt_str_field("parent")?,
            order: env.str_field("order")?,
        }),
        "renormalize" => Ok(OpPayload::Renormalize {
            order: env.str_field("order")?,
            base_snapshot_revision: env.opt_str_field("base_snapshot_revision")?,
        }),
        "set_body" => Ok(OpPayload::SetBody {
            text: env.str_field("text")?,
            marks: decode_marks(env)?,
        }),
        "set_type_id" => Ok(OpPayload::SetTypeId {
            value: env.opt_str_field("value")?,
        }),
        "set_prop" => Ok(OpPayload::SetProp {
            key: env.str_field("key")?,
            value: env.opt_str_field("value")?,
        }),
        "tag_add" => Ok(OpPayload::TagAdd {
            tag: env.str_field("tag")?,
        }),
        "tag_remove" => Ok(OpPayload::TagRemove {
            tag: env.str_field("tag")?,
        }),
        "life_set" => Ok(OpPayload::LifeSet {
            life: decode_life(env, env.str_field("life")?.as_str())?,
        }),
        _ => env.err("payload.kind"),
    }
}
