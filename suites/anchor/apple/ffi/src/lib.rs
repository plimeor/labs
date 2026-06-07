use anchor_core::dto::{blob_id, fixture_blob, open_fixture_vault, EditorIntent, OpStamp, Session};
use anchor_core::hlc::Hlc;
use anchor_core::model::Life;
use std::collections::BTreeMap;
use std::ffi::c_void;
use std::ptr;
use std::slice;
use std::str;
use std::sync::atomic::{AtomicU64, Ordering};

#[repr(C)]
pub struct AnchorByteBuffer {
    pub ptr: *mut u8,
    pub len: usize,
    pub cap: usize,
}

#[repr(C)]
pub struct AnchorSession {
    inner: Session,
    seq: u64,
}

static OP_COUNTER: AtomicU64 = AtomicU64::new(10_000);

fn empty_buffer() -> AnchorByteBuffer {
    AnchorByteBuffer {
        ptr: ptr::null_mut(),
        len: 0,
        cap: 0,
    }
}

fn into_buffer(mut bytes: Vec<u8>) -> AnchorByteBuffer {
    if bytes.is_empty() {
        return empty_buffer();
    }
    let buffer = AnchorByteBuffer {
        ptr: bytes.as_mut_ptr(),
        len: bytes.len(),
        cap: bytes.capacity(),
    };
    std::mem::forget(bytes);
    buffer
}

fn string_buffer(value: String) -> AnchorByteBuffer {
    into_buffer(value.into_bytes())
}

fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c.is_control() => {
                use std::fmt::Write;
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn json_string_list(values: &[String]) -> String {
    let mut out = String::from("[");
    for (index, value) in values.iter().enumerate() {
        if index != 0 {
            out.push(',');
        }
        out.push_str(&json_string(value));
    }
    out.push(']');
    out
}

fn json_string_map(values: &BTreeMap<String, String>) -> String {
    let mut out = String::from("{");
    for (index, (key, value)) in values.iter().enumerate() {
        if index != 0 {
            out.push(',');
        }
        out.push_str(&json_string(key));
        out.push(':');
        out.push_str(&json_string(value));
    }
    out.push('}');
    out
}

fn fixture_summary_json(summary: anchor_core::dto::FixtureSummary) -> String {
    format!(
        "{{\"vault_id\":{},\"note_count\":{},\"snapshot_revision\":{},\"note_ids\":{}}}",
        json_string(&summary.vault_id),
        summary.note_count,
        json_string(&summary.snapshot_revision),
        json_string_list(&summary.note_ids)
    )
}

fn selection_json(selection: Option<anchor_core::dto::Selection>) -> String {
    match selection {
        Some(anchor_core::dto::Selection::Text {
            block_id,
            start,
            end,
        }) => format!(
            "{{\"kind\":\"text\",\"block_id\":{},\"start\":{},\"end\":{}}}",
            json_string(&block_id),
            start,
            end
        ),
        Some(anchor_core::dto::Selection::Block { block_id }) => {
            format!(
                "{{\"kind\":\"block\",\"block_id\":{}}}",
                json_string(&block_id)
            )
        }
        Some(anchor_core::dto::Selection::Embedded {
            block_id,
            start,
            end,
        }) => format!(
            "{{\"kind\":\"embedded\",\"block_id\":{},\"start\":{},\"end\":{}}}",
            json_string(&block_id),
            start,
            end
        ),
        None => "null".to_string(),
    }
}

fn conflicts_json(conflicts: &[anchor_core::model::ConflictRecord]) -> String {
    let mut out = String::from("[");
    for (index, conflict) in conflicts.iter().enumerate() {
        if index != 0 {
            out.push(',');
        }
        let sub_field_key = conflict
            .sub_field_key
            .as_deref()
            .map(json_string)
            .unwrap_or_else(|| "null".to_string());
        let live_op_id = conflict
            .live_op_id
            .as_deref()
            .map(json_string)
            .unwrap_or_else(|| "null".to_string());
        out.push_str(&format!(
            "{{\"target_id\":{},\"kind\":{},\"sub_field_key\":{},\"live_op_id\":{},\"losing_op_ids\":{},\"pinned_op_ids\":{}}}",
            json_string(&conflict.target_id),
            json_string(conflict.kind.as_str()),
            sub_field_key,
            live_op_id,
            json_string_list(&conflict.losing_op_ids),
            json_string_list(&conflict.pinned_op_ids)
        ));
    }
    out.push(']');
    out
}

fn transaction_result_json(result: anchor_core::dto::TransactionResult) -> String {
    let validation_error = result
        .validation_error
        .as_deref()
        .map(json_string)
        .unwrap_or_else(|| "null".to_string());
    format!(
        "{{\"changed_ids\":{},\"validation_error\":{},\"new_revisions\":{},\"selection_hint\":{},\"conflicts\":{},\"projection_fresh\":{},\"mirror_fresh\":{}}}",
        json_string_list(&result.changed_ids),
        validation_error,
        json_string_map(&result.new_revisions),
        selection_json(result.selection_hint),
        conflicts_json(&result.conflicts),
        result.projection_fresh,
        result.mirror_fresh
    )
}

unsafe fn read_utf8(ptr: *const u8, len: usize) -> Result<String, String> {
    if len == 0 {
        return Ok(String::new());
    }
    if ptr.is_null() {
        return Err("null pointer".to_string());
    }
    let bytes = slice::from_raw_parts(ptr, len);
    str::from_utf8(bytes)
        .map(|s| s.to_string())
        .map_err(|_| "invalid utf8".to_string())
}

fn next_stamp(session: &mut AnchorSession, op_name: &str) -> OpStamp {
    session.seq += 1;
    let n = OP_COUNTER.fetch_add(1, Ordering::Relaxed);
    OpStamp {
        op_id: format!("op_{}_{}", op_name, n),
        hlc: Hlc::new(n, 0, "device_apple_spike"),
        actor: "apple_spike".to_string(),
        seq: session.seq,
    }
}

#[no_mangle]
pub extern "C" fn anchor_buffer_free(buffer: AnchorByteBuffer) {
    if buffer.ptr.is_null() || buffer.cap == 0 {
        return;
    }
    unsafe {
        drop(Vec::from_raw_parts(buffer.ptr, buffer.len, buffer.cap));
    }
}

#[no_mangle]
pub extern "C" fn anchor_core_fixture_summary_json() -> AnchorByteBuffer {
    string_buffer(fixture_summary_json(open_fixture_vault()))
}

#[no_mangle]
pub extern "C" fn anchor_session_open_fixture() -> *mut AnchorSession {
    Box::into_raw(Box::new(AnchorSession {
        inner: Session::open_fixture(),
        seq: 0,
    }))
}

#[no_mangle]
pub extern "C" fn anchor_session_free(session: *mut AnchorSession) {
    if session.is_null() {
        return;
    }
    unsafe {
        drop(Box::from_raw(session));
    }
}

#[no_mangle]
pub extern "C" fn anchor_session_summary_json(session: *const AnchorSession) -> AnchorByteBuffer {
    if session.is_null() {
        return string_buffer("{\"error\":\"null_session\"}".to_string());
    }
    let summary = unsafe { &*session }.inner.summary();
    string_buffer(fixture_summary_json(summary))
}

#[no_mangle]
pub extern "C" fn anchor_session_dispatch_insert_text_json(
    session: *mut AnchorSession,
    target_ptr: *const u8,
    target_len: usize,
    at: u32,
    text_ptr: *const u8,
    text_len: usize,
) -> AnchorByteBuffer {
    if session.is_null() {
        return string_buffer("{\"validation_error\":\"null_session\"}".to_string());
    }
    let target_id = match unsafe { read_utf8(target_ptr, target_len) } {
        Ok(value) => value,
        Err(error) => {
            return string_buffer(format!("{{\"validation_error\":{}}}", json_string(&error)))
        }
    };
    let text = match unsafe { read_utf8(text_ptr, text_len) } {
        Ok(value) => value,
        Err(error) => {
            return string_buffer(format!("{{\"validation_error\":{}}}", json_string(&error)))
        }
    };
    let session = unsafe { &mut *session };
    let stamp = next_stamp(session, "insert_text");
    let result = session.inner.dispatch(
        EditorIntent::InsertText {
            target_id,
            at,
            text,
        },
        stamp,
    );
    string_buffer(transaction_result_json(result))
}

#[no_mangle]
pub extern "C" fn anchor_session_dispatch_direct_delete_json(
    session: *mut AnchorSession,
    target_ptr: *const u8,
    target_len: usize,
) -> AnchorByteBuffer {
    if session.is_null() {
        return string_buffer("{\"validation_error\":\"null_session\"}".to_string());
    }
    let target_id = match unsafe { read_utf8(target_ptr, target_len) } {
        Ok(value) => value,
        Err(error) => {
            return string_buffer(format!("{{\"validation_error\":{}}}", json_string(&error)))
        }
    };
    let session = unsafe { &mut *session };
    let stamp = next_stamp(session, "direct_delete");
    let result = session.inner.dispatch(
        EditorIntent::SetLife {
            target_id,
            life: Life::Deleted,
        },
        stamp,
    );
    string_buffer(transaction_result_json(result))
}

#[no_mangle]
pub extern "C" fn anchor_session_read_segment(session: *mut AnchorSession) -> AnchorByteBuffer {
    if session.is_null() {
        return empty_buffer();
    }
    into_buffer(unsafe { &mut *session }.inner.read_segment())
}

#[no_mangle]
pub extern "C" fn anchor_fixture_blob(size: usize) -> AnchorByteBuffer {
    into_buffer(fixture_blob(size))
}

#[no_mangle]
pub extern "C" fn anchor_blob_id_json(bytes_ptr: *const u8, bytes_len: usize) -> AnchorByteBuffer {
    if bytes_ptr.is_null() && bytes_len != 0 {
        return string_buffer("{\"error\":\"null_bytes\"}".to_string());
    }
    let bytes = unsafe { slice::from_raw_parts(bytes_ptr.cast::<u8>(), bytes_len) };
    string_buffer(format!("{{\"blob_id\":{}}}", json_string(&blob_id(bytes))))
}

#[no_mangle]
pub extern "C" fn anchor_core_ffi_version() -> *const c_void {
    ptr::null()
}
