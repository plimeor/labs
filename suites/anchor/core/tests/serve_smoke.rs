/// Smoke tests for the `anchor-core serve` HTTP bridge.
///
/// Strategy: use `tower::ServiceExt::oneshot` to call the Axum router directly
/// without binding a real TCP port. This avoids port allocation / teardown
/// races while still exercising the full request→core dispatch path.
///
/// Limitation: the router is called synchronously without HTTP keep-alive or
/// concurrent requests; those code paths are covered by the server integration
/// (the listener + `axum::serve` call in `anchor_core::serve::serve_http`) which is
/// not exercised here. If a real port test is ever needed, replace `oneshot`
/// with a short-lived `tokio::spawn(serve_http(...))` bound to "127.0.0.1:0"
/// and query `listener.local_addr()` for the ephemeral port.
use anchor_core::{
    serve::{build_router, AppState},
    vault::{ensure_vault_structure, rebuild_vault},
    Model,
};
use axum::body::Body;
use bytes::Bytes;
use http::{Method, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex as TokioMutex;
use tower::ServiceExt;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn temp_vault() -> PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    // Combine nanos + seq + process ID to guarantee uniqueness across parallel tests.
    let pid = std::process::id();
    let dir = std::env::temp_dir().join(format!("anchor_serve_test_{pid}_{nanos}_{seq}"));
    ensure_vault_structure(&dir).expect("ensure_vault_structure");
    dir
}

fn make_state(vault: PathBuf) -> (AppState, PathBuf) {
    let mut model = Model::default();
    rebuild_vault(&vault, &mut model).expect("rebuild_vault");
    let state = AppState {
        model: Arc::new(TokioMutex::new(model)),
        vault: Arc::new(vault.clone()),
    };
    (state, vault)
}

/// Collect the full body of an axum response into `Bytes`.
async fn collect_body(body: axum::body::Body) -> Bytes {
    body.collect().await.expect("collect body").to_bytes()
}

/// Parse a response body as JSON.
async fn json_body(body: axum::body::Body) -> Value {
    let bytes = collect_body(body).await;
    serde_json::from_slice(&bytes).expect("parse JSON body")
}

// ---------------------------------------------------------------------------
// Test: GET /notes returns a JSON array (read route smoke test)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn get_notes_returns_json_array() {
    let vault = temp_vault();
    let (state, _vault_path) = make_state(vault);
    let app = build_router(state);

    let req = Request::builder()
        .method(Method::GET)
        .uri("/notes")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.expect("oneshot GET /notes");
    assert_eq!(resp.status(), StatusCode::OK, "GET /notes must return 200");

    let body: Value = json_body(resp.into_body()).await;
    assert!(
        body.is_array(),
        "GET /notes must return a JSON array, got: {body}"
    );
}

// ---------------------------------------------------------------------------
// Test: POST /notes creates a note; GET /notes/:id/raw returns the body;
//       PUT /notes/:id with correct if_match overwrites the body.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_read_overwrite_with_if_match() {
    let vault = temp_vault();
    let (state, _) = make_state(vault);
    let app = build_router(state);

    // -----------------------------------------------------------------
    // 1. POST /notes — create a note
    // -----------------------------------------------------------------
    let create_body = serde_json::json!({
        "title": "Smoke Test Note",
        "content": "# Smoke Test Note\n\nOriginal body."
    });
    let req = Request::builder()
        .method(Method::POST)
        .uri("/notes")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&create_body).unwrap()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.expect("POST /notes");
    assert_eq!(
        resp.status(),
        StatusCode::CREATED,
        "POST /notes must return 201"
    );

    let created: Value = json_body(resp.into_body()).await;
    let note_id = created["id"].as_str().expect("id field").to_string();
    let revision_v1 = created["revision"]
        .as_str()
        .expect("revision field")
        .to_string();
    assert!(
        note_id.starts_with("note_"),
        "id must start with note_: {note_id}"
    );
    assert!(
        revision_v1.starts_with("rev_"),
        "revision must start with rev_: {revision_v1}"
    );

    // -----------------------------------------------------------------
    // 2. GET /notes/:id/raw — cat returns the original body
    // -----------------------------------------------------------------
    let req = Request::builder()
        .method(Method::GET)
        .uri(format!("/notes/{note_id}/raw"))
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.expect("GET /notes/:id/raw");
    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "GET /notes/:id/raw must return 200"
    );

    let raw: Value = json_body(resp.into_body()).await;
    let content = raw["content"].as_str().expect("content field");
    assert!(
        content.contains("Original body"),
        "cat content must contain 'Original body', got: {content}"
    );

    // -----------------------------------------------------------------
    // 3. PUT /notes/:id with correct if_match — overwrite succeeds
    // -----------------------------------------------------------------
    let overwrite_body = serde_json::json!({
        "content": "# Smoke Test Note\n\nOverwritten body.",
        "if_match": revision_v1
    });
    let req = Request::builder()
        .method(Method::PUT)
        .uri(format!("/notes/{note_id}"))
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&overwrite_body).unwrap()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.expect("PUT /notes/:id");
    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "PUT /notes/:id must return 200"
    );

    let updated: Value = json_body(resp.into_body()).await;
    let revision_v2 = updated["revision"]
        .as_str()
        .expect("revision field")
        .to_string();
    assert_ne!(
        revision_v1, revision_v2,
        "revision must change after successful overwrite"
    );
    assert!(
        revision_v2.starts_with("rev_"),
        "new revision must start with rev_: {revision_v2}"
    );

    // -----------------------------------------------------------------
    // 4. PUT /notes/:id with stale if_match — returns 409 Conflict
    // -----------------------------------------------------------------
    let stale_body = serde_json::json!({
        "content": "# Stale write — should be rejected",
        "if_match": revision_v1  // now stale
    });
    let req = Request::builder()
        .method(Method::PUT)
        .uri(format!("/notes/{note_id}"))
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&stale_body).unwrap()))
        .unwrap();

    let resp = app
        .clone()
        .oneshot(req)
        .await
        .expect("PUT /notes/:id stale");
    assert_eq!(
        resp.status(),
        StatusCode::CONFLICT,
        "stale if_match must return 409 Conflict"
    );

    let err: Value = json_body(resp.into_body()).await;
    assert_eq!(
        err["error"]["code"].as_str().unwrap_or(""),
        "conflict",
        "error code must be 'conflict'"
    );

    // -----------------------------------------------------------------
    // 5. GET /notes/:id (show) — full note object
    // -----------------------------------------------------------------
    let req = Request::builder()
        .method(Method::GET)
        .uri(format!("/notes/{note_id}"))
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.expect("GET /notes/:id");
    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "GET /notes/:id must return 200"
    );
    let note: Value = json_body(resp.into_body()).await;
    assert_eq!(
        note["metadata"]["id"].as_str().unwrap_or(""),
        note_id,
        "note id must match"
    );
}

// ---------------------------------------------------------------------------
// Test: autosave (update_note via /rpc) preserves trailing spaces and blank
// lines verbatim — on disk, in the response, and on read-back with a stable
// revision. This is the editor's real save path; trimming here would silently
// erase the user's whitespace.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn update_note_preserves_trailing_whitespace_verbatim() {
    let vault = temp_vault();
    let (state, vault_path) = make_state(vault);
    let app = build_router(state);

    // POST /rpc helper — the universal envelope the editor uses.
    async fn rpc(app: &axum::Router, op: &str, args: Value) -> Value {
        let envelope = serde_json::json!({ "op": op, "args": args });
        let req = Request::builder()
            .method(Method::POST)
            .uri("/rpc")
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(&envelope).unwrap()))
            .unwrap();
        let resp = app.clone().oneshot(req).await.expect("POST /rpc");
        assert_eq!(resp.status(), StatusCode::OK, "/rpc {op} must return 200");
        json_body(resp.into_body()).await
    }

    // 1. Create a seed note.
    let created = rpc(
        &app,
        "create_note",
        serde_json::json!({ "input": { "title": "Whitespace", "body": "seed" } }),
    )
    .await;
    let note_id = created["metadata"]["id"]
        .as_str()
        .or_else(|| created["id"].as_str())
        .expect("created note id")
        .to_string();
    let revision_v1 = created["revision"].as_str().expect("revision").to_string();

    // 2. Autosave a body with trailing spaces AND trailing blank lines.
    let body = "Line with trailing spaces   \nMiddle\n\n\n";
    let updated = rpc(
        &app,
        "update_note",
        serde_json::json!({
            "input": { "noteId": note_id, "baseRevision": revision_v1, "body": body }
        }),
    )
    .await;

    // The response body must equal what was sent — verbatim. (When this holds,
    // the editor's autosave controller skips onDocReplace and the user's
    // trailing whitespace is never yanked out from under the cursor.)
    assert_eq!(
        updated["body"].as_str().unwrap_or(""),
        body,
        "autosave response body must be verbatim"
    );
    let revision_v2 = updated["revision"].as_str().expect("revision").to_string();
    let file_path = updated["filePath"].as_str().expect("filePath").to_string();

    // 3. The file on disk must end with the verbatim body plus the single
    //    structural newline serialize_markdown appends — trailing whitespace
    //    and blank lines intact.
    let disk = std::fs::read_to_string(vault_path.join(&file_path)).expect("read note file");
    assert!(
        disk.ends_with(&format!("{body}\n")),
        "on-disk body must preserve trailing whitespace, file tail was: {:?}",
        &disk[disk.len().saturating_sub(60)..]
    );

    // 4. Read back via /rpc: body verbatim and revision unchanged (the
    //    serialize/parse round-trip must be checksum-stable, else the editor's
    //    baseRevision would go stale and trigger a spurious conflict).
    let reread = rpc(&app, "read_note", serde_json::json!({ "noteId": note_id })).await;
    assert_eq!(
        reread["body"].as_str().unwrap_or(""),
        body,
        "read-back body must be verbatim"
    );
    assert_eq!(
        reread["revision"].as_str().unwrap_or(""),
        revision_v2,
        "revision must be stable across write → read (no checksum drift)"
    );
}

// ---------------------------------------------------------------------------
// Test: GET /notes/:id for unknown ID returns 404 with error envelope
// ---------------------------------------------------------------------------

#[tokio::test]
async fn not_found_returns_404_error_envelope() {
    let vault = temp_vault();
    let (state, _) = make_state(vault);
    let app = build_router(state);

    let req = Request::builder()
        .method(Method::GET)
        .uri("/notes/does_not_exist_abc123")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.expect("GET unknown note");
    assert_eq!(
        resp.status(),
        StatusCode::NOT_FOUND,
        "unknown id must return 404"
    );

    let body: Value = json_body(resp.into_body()).await;
    assert_eq!(
        body["error"]["code"].as_str().unwrap_or(""),
        "not_found",
        "error code must be 'not_found'"
    );
    assert!(
        !body["error"]["message"].as_str().unwrap_or("").is_empty(),
        "error message must not be empty"
    );
}
