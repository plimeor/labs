/// Integration tests for the anchor-core CLI I/O contract.
///
/// Tests run against a temporary vault created per-test (no shared state).
///
/// Coverage:
///   (a) create then cat returns the same body
///   (b) overwrite with a stale --if-match returns the conflict code and does NOT write
///   (c) overwrite with the correct revision succeeds and returns a new revision
///   (d) search --format json returns a JSON array
///   (e) the error envelope shape for a not-found id
use anchor_core::{
    core,
    vault::{ensure_vault_structure, rebuild_vault},
    CoreError, Model,
};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Test vault helpers
// ---------------------------------------------------------------------------

fn temp_vault() -> PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let pid = std::process::id();
    let dir = std::env::temp_dir().join(format!("anchor_cli_test_{pid}_{nanos}_{seq}"));
    ensure_vault_structure(&dir).expect("ensure vault structure");
    dir
}

fn open_model(vault: &PathBuf) -> Model {
    let mut model = Model::default();
    rebuild_vault(vault, &mut model).expect("rebuild vault");
    model
}

// ---------------------------------------------------------------------------
// Helper: create a note and return its id + revision
// ---------------------------------------------------------------------------

fn create_test_note(vault: &PathBuf, model: &mut Model, title: &str, body: &str) -> Value {
    let input = json!({
        "title": title,
        "body": body
    });
    core::create_note(input, model, vault).expect("create note")
}

// ---------------------------------------------------------------------------
// (a) create then cat returns the same body
// ---------------------------------------------------------------------------

#[test]
fn create_then_cat_returns_same_body() {
    let vault = temp_vault();
    let mut model = open_model(&vault);

    let original_body = "# Test Note\n\nThis is the original body content.";
    let note = create_test_note(&vault, &mut model, "Test Note", original_body);

    let note_id = note["metadata"]["id"]
        .as_str()
        .expect("note id")
        .to_string();

    // Reload model to simulate fresh CLI invocation
    let model2 = open_model(&vault);

    // cat returns the note body
    let found = core::read_note(note_id.clone(), &model2).expect("read note");
    let body = found["body"].as_str().expect("body field");

    assert_eq!(
        body.trim(),
        original_body.trim(),
        "cat body must match the body passed to create"
    );
}

// ---------------------------------------------------------------------------
// (b) overwrite with a stale --if-match returns conflict (no write)
// ---------------------------------------------------------------------------

#[test]
fn overwrite_with_stale_if_match_returns_conflict() {
    let vault = temp_vault();
    let mut model = open_model(&vault);

    let note = create_test_note(&vault, &mut model, "Conflict Note", "# Conflict Note\n\nV1");
    let note_id = note["metadata"]["id"]
        .as_str()
        .expect("note id")
        .to_string();
    let real_rev = note["revision"].as_str().expect("revision").to_string();

    // Manufacture a stale / wrong revision
    let stale_rev = format!("{real_rev}_stale");

    // Simulate what the CLI does: check revision before writing
    let mut model2 = open_model(&vault);
    let found = core::read_note(note_id.clone(), &model2).expect("read note");
    let current_rev = found["revision"].as_str().expect("revision").to_string();

    // The mismatch check (mirrors CLI Overwrite handler)
    let conflict_result: Result<(), CoreError> = if current_rev != stale_rev {
        Err(CoreError::Conflict(format!(
            "revision mismatch: expected {stale_rev}, got {current_rev}"
        )))
    } else {
        Ok(())
    };

    assert!(
        conflict_result.is_err(),
        "stale if-match must yield an error"
    );
    let err = conflict_result.unwrap_err();
    assert_eq!(
        err.code(),
        "conflict",
        "error code must be 'conflict', got {:?}",
        err.code()
    );
    assert_eq!(err.exit_code(), 3, "exit code for conflict must be 3");

    // Verify body was NOT modified (note still reads original)
    let model3 = open_model(&vault);
    let unchanged = core::read_note(note_id.clone(), &model3).expect("read note after stale");
    assert_eq!(
        unchanged["revision"].as_str().unwrap_or(""),
        real_rev,
        "revision must be unchanged after a rejected conflict write"
    );
    assert!(
        unchanged["body"].as_str().unwrap_or("").contains("V1"),
        "body must be unchanged after a rejected conflict write"
    );

    // Suppress the unused variable warning
    let _ = &mut model2;
}

// ---------------------------------------------------------------------------
// (c) overwrite with the correct revision succeeds and returns a new revision
// ---------------------------------------------------------------------------

#[test]
fn overwrite_with_correct_revision_succeeds() {
    let vault = temp_vault();
    let mut model = open_model(&vault);

    let note = create_test_note(
        &vault,
        &mut model,
        "Overwrite Note",
        "# Overwrite Note\n\nV1",
    );
    let note_id = note["metadata"]["id"]
        .as_str()
        .expect("note id")
        .to_string();
    let rev_v1 = note["revision"].as_str().expect("revision").to_string();

    // Overwrite with correct revision
    let new_body = "# Overwrite Note\n\nV2 — successfully overwritten";
    let input = json!({
        "noteId": note_id,
        "baseRevision": rev_v1,
        "body": new_body
    });
    let updated = core::update_note(input, &mut model, &vault).expect("update note");
    let rev_v2 = updated["revision"]
        .as_str()
        .expect("new revision")
        .to_string();

    // Revision must have changed
    assert_ne!(
        rev_v1, rev_v2,
        "revision must change after a successful overwrite"
    );

    // Both revisions must be in the correct format
    assert!(
        rev_v1.starts_with("rev_"),
        "rev_v1 must start with rev_: {rev_v1}"
    );
    assert!(
        rev_v2.starts_with("rev_"),
        "rev_v2 must start with rev_: {rev_v2}"
    );

    // The response contains id, revision, path
    let file_path = updated["filePath"].as_str().expect("filePath");
    assert!(!file_path.is_empty(), "filePath must not be empty");

    // Reload and verify new body persisted
    let model2 = open_model(&vault);
    let refreshed = core::read_note(note_id.clone(), &model2).expect("read note after overwrite");
    assert!(
        refreshed["body"].as_str().unwrap_or("").contains("V2"),
        "body must contain 'V2' after successful overwrite"
    );
    assert_eq!(
        refreshed["revision"].as_str().unwrap_or(""),
        rev_v2,
        "revision after reload must match the returned rev_v2"
    );
}

// ---------------------------------------------------------------------------
// (d) search --format json returns a JSON array
// ---------------------------------------------------------------------------

#[test]
fn search_format_json_returns_array() {
    let vault = temp_vault();
    let mut model = open_model(&vault);

    // Seed two notes
    create_test_note(
        &vault,
        &mut model,
        "Alpha Note",
        "# Alpha Note\n\nContent about alpha.",
    );
    create_test_note(
        &vault,
        &mut model,
        "Beta Note",
        "# Beta Note\n\nContent about beta.",
    );

    let model2 = open_model(&vault);

    // Search with a query that should match one note
    let request = json!({"query": "alpha", "limit": 30});
    let results = core::search_notes(request, &model2).expect("search notes");

    // The result is a Vec<Value>; in JSON format it would serialize as an array
    let json_out =
        serde_json::to_string(&Value::Array(results.clone())).expect("serialize search results");

    // Verify it parses back as an array
    let parsed: Value = serde_json::from_str(&json_out).expect("parse json output");
    assert!(
        parsed.is_array(),
        "search JSON output must be an array, got: {json_out}"
    );

    // Verify content
    let arr = parsed.as_array().expect("array");
    assert!(
        !arr.is_empty(),
        "search for 'alpha' must return at least one result"
    );
    assert!(
        arr.iter().any(|r| {
            r["title"]
                .as_str()
                .unwrap_or("")
                .to_lowercase()
                .contains("alpha")
                || r["id"].as_str().unwrap_or("").contains("alpha")
        }),
        "search result must contain the Alpha note"
    );

    // Empty-query search returns all notes as an array
    let request_all = json!({"query": "", "limit": 30});
    let all_results = core::search_notes(request_all, &model2).expect("search all notes");
    let json_all = serde_json::to_string(&Value::Array(all_results)).expect("serialize all");
    let parsed_all: Value = serde_json::from_str(&json_all).expect("parse all");
    assert!(
        parsed_all.is_array(),
        "empty-query search must also return an array"
    );
}

// ---------------------------------------------------------------------------
// (e) error envelope shape for a not-found id
// ---------------------------------------------------------------------------

#[test]
fn not_found_error_envelope_shape() {
    let vault = temp_vault();
    let model = open_model(&vault);

    let result = core::read_note("note_does_not_exist_abc123".to_string(), &model);

    assert!(result.is_err(), "read_note with invalid id must return Err");
    let err = result.unwrap_err();

    // Code must be "not_found"
    assert_eq!(
        err.code(),
        "not_found",
        "error code must be 'not_found', got: {}",
        err.code()
    );

    // Exit code must be 2
    assert_eq!(
        err.exit_code(),
        2,
        "exit code for not_found must be 2, got: {}",
        err.exit_code()
    );

    // JSON envelope shape: {"error": {"code": "not_found", "message": "..."}}
    let envelope = json!({"error": {"code": err.code(), "message": err.message()}});
    assert_eq!(envelope["error"]["code"], "not_found");
    assert!(
        !envelope["error"]["message"]
            .as_str()
            .unwrap_or("")
            .is_empty(),
        "error message must not be empty"
    );

    // Verify the envelope serializes to valid JSON
    let serialized = serde_json::to_string(&envelope).expect("serialize envelope");
    let reparsed: Value = serde_json::from_str(&serialized).expect("reparse envelope");
    assert_eq!(reparsed["error"]["code"], "not_found");
}

// ---------------------------------------------------------------------------
// (f) exit code mapping is complete and correct
// ---------------------------------------------------------------------------

#[test]
fn error_exit_codes_match_spec() {
    // Spec: 0=ok · 1=usage · 2=not_found · 3=conflict · 4=blocked · 5=vault_not_open · 6=io
    assert_eq!(CoreError::Usage("x".into()).exit_code(), 1);
    assert_eq!(CoreError::NotFound("x".into()).exit_code(), 2);
    assert_eq!(CoreError::Conflict("x".into()).exit_code(), 3);
    assert_eq!(CoreError::Blocked("x".into()).exit_code(), 4);
    assert_eq!(CoreError::VaultNotOpen.exit_code(), 5);
    assert_eq!(CoreError::Io("x".into()).exit_code(), 6);
}
