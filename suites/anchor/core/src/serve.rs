/// HTTP bridge — `anchor serve`.
///
/// Exposes the op registry over a local Axum HTTP server (dev-only, localhost).
/// ONE Model is loaded at startup and held behind a tokio Mutex so that
/// writes are serialised.
///
/// # Route table
///
/// | Method | Path            | Op                       | Notes                         |
/// |--------|-----------------|--------------------------|-------------------------------|
/// | GET    | /notes          | list_notes               |                               |
/// | GET    | /notes/:id      | read_note (show)         |                               |
/// | GET    | /notes/:id/raw  | cat                      | returns {"content":"…"}       |
/// | POST   | /notes          | create_note              | body: {title?,type?,content?} |
/// | PUT    | /notes/:id      | overwrite                | body: {content, if_match?}    |
/// |        |                 |                          | or If-Match header            |
/// | GET    | /search         | search_notes             | ?q=&limit=&tag=&type=         |
/// | GET    | /graph/:id      | get_graph_neighborhood   | ?depth=1                      |
/// | GET    | /diagnostics    | diagnostics              |                               |
/// | GET    | /ops            | list_operation_records   |                               |
/// | GET    | /ops/list       | list_operation_records   | alias for /ops                |
/// | POST   | /rpc            | universal RPC envelope   | body: {op,args}               |
///
/// All errors return `{"error":{"code","message"}}` with HTTP status:
/// - not_found      → 404
/// - conflict       → 409
/// - blocked        → 422
/// - vault_not_open → 503
/// - io / usage     → 500
use crate::{core, domain, CoreError, Model};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post, put},
    Json, Router,
};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

/// Shared app state injected into every route handler via Axum `State`.
#[derive(Clone)]
pub struct AppState {
    pub model: Arc<TokioMutex<Model>>,
    pub vault: Arc<PathBuf>,
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/// Map a CoreError to the JSON error envelope + appropriate HTTP status code.
pub fn core_error_response(err: CoreError) -> (StatusCode, Json<Value>) {
    let status = match err {
        CoreError::NotFound(_) => StatusCode::NOT_FOUND,
        CoreError::Conflict(_) => StatusCode::CONFLICT,
        CoreError::Blocked(_) => StatusCode::UNPROCESSABLE_ENTITY,
        CoreError::VaultNotOpen => StatusCode::SERVICE_UNAVAILABLE,
        CoreError::Io(_) | CoreError::Usage(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    let body = json!({"error": {"code": err.code(), "message": err.message()}});
    (status, Json(body))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/// Build the Axum router. Separated from `serve_http` so tests can call it
/// directly without binding a real port (using `axum::Router::into_make_service`
/// + `axum_test` or `tower::Service`).
pub fn build_router(state: AppState) -> Router {
    Router::new()
        // reads
        .route("/notes", get(handle_list_notes))
        .route("/notes/{id}", get(handle_show_note))
        .route("/notes/{id}/raw", get(handle_cat_note))
        // writes
        .route("/notes", post(handle_create_note))
        .route("/notes/{id}", put(handle_overwrite_note))
        // search & graph
        .route("/search", get(handle_search))
        .route("/graph/{id}", get(handle_graph))
        // maintenance
        .route("/diagnostics", get(handle_diagnostics))
        .route("/ops", get(handle_ops))
        .route("/ops/list", get(handle_ops))
        // universal RPC envelope — POST /rpc {op, args}
        .route("/rpc", post(handle_rpc))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Universal RPC dispatcher
// ---------------------------------------------------------------------------

/// `dispatch` — pure function, no HTTP types. Maps (op, args) → Result<Value>.
///
/// Called from both `handle_rpc` (HTTP transport) and potentially future
/// adapters. For ops that mutate the vault, the caller must hold the model
/// lock before calling.
///
/// Returns `Ok(Value)` on success or `Err(CoreError)` on failure.
pub fn dispatch(
    model: &mut tokio::sync::MutexGuard<'_, Model>,
    vault: &std::path::Path,
    op: &str,
    args: &serde_json::Value,
) -> Result<serde_json::Value, CoreError> {
    use serde_json::json;

    fn str_arg<'a>(args: &'a serde_json::Value, key: &str) -> Result<&'a str, CoreError> {
        args.get(key)
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| CoreError::Usage(format!("missing required arg: {key}")))
    }

    match op {
        // ------------------------------------------------------------------ reads
        "diagnostics" => core::diagnostics(model).map(|v| v),

        "list_notes" => core::list_notes(model).map(|v| json!(v)),

        "read_note" => {
            let note_id = str_arg(args, "noteId")?.to_string();
            core::read_note(note_id, model)
        }

        "search_notes" => {
            let request = args.get("request").cloned().unwrap_or(args.clone());
            core::search_notes(request, model).map(|v| json!(v))
        }

        "get_backlinks" => {
            let note_id = str_arg(args, "noteId")?.to_string();
            core::get_backlinks(note_id, model).map(|v| json!(v))
        }

        "get_links" => {
            let note_id = str_arg(args, "noteId")?.to_string();
            core::get_links(note_id, model).map(|v| json!(v))
        }

        "get_graph_neighborhood" => {
            let note_id = str_arg(args, "noteId")?.to_string();
            let depth = args.get("depth").and_then(|v| v.as_u64()).unwrap_or(1) as u8;
            core::get_graph_neighborhood(note_id, depth.min(2), model)
        }

        "get_object_types" => core::get_object_types(model).map(|v| json!(v)),

        "get_unlinked_mentions" => {
            let note_id = str_arg(args, "noteId")?.to_string();
            core::get_unlinked_mentions(note_id, model).map(|v| json!(v))
        }

        "list_operation_records" => core::list_operation_records(model).map(|v| json!(v)),

        "get_proposed_changes" => core::get_proposed_changes(model).map(|v| json!(v)),

        "list_agent_connections" => core::list_agent_connections(model).map(|v| json!(v)),

        "list_agent_tasks" => core::list_agent_tasks(model).map(|v| json!(v)),

        // ------------------------------------------------------------------ writes
        "open_demo_vault" => core::open_demo_vault(model),

        "open_vault" => {
            let path = str_arg(args, "path")?.to_string();
            core::open_vault(path, model)
        }

        "open_today_journal" => core::open_today_journal(model, vault),

        "create_note" => {
            let input = args.get("input").cloned().unwrap_or(args.clone());
            core::create_note(input, model, vault)
        }

        "update_note" => {
            let input = args.get("input").cloned().unwrap_or(args.clone());
            core::update_note(input, model, vault)
        }

        "create_proposed_change" => {
            let input = args.get("input").cloned().unwrap_or(args.clone());
            core::create_proposed_change(input, model)
        }

        "apply_proposed_change" => {
            let id = str_arg(args, "id")?.to_string();
            core::apply_proposed_change(id, model, vault)
        }

        "reject_proposed_change" => {
            let id = str_arg(args, "id")?.to_string();
            core::reject_proposed_change(id, model, vault)
        }

        "create_agent_task" => {
            let input = args.get("input").cloned().unwrap_or(args.clone());
            core::create_agent_task(input, model, vault)
        }

        "set_task_permission_mode" => {
            let task_id = str_arg(args, "taskId")?.to_string();
            let mode = str_arg(args, "mode")?.to_string();
            core::set_task_permission_mode(task_id, mode, model)
        }

        "archive_note" => {
            let note_id = str_arg(args, "noteId")?.to_string();
            core::archive_note(note_id, model, vault)
        }

        "trash_note" => {
            let note_id = str_arg(args, "noteId")?.to_string();
            core::trash_note(note_id, model, vault)
        }

        "restore_note" => {
            let note_id = str_arg(args, "noteId")?.to_string();
            core::restore_note(note_id, model, vault)
        }

        unknown => Err(CoreError::Usage(format!("unknown op: {unknown}"))),
    }
}

/// POST /rpc — universal JSON-RPC envelope.
///
/// Request body: `{"op": "<snake_case_op_name>", "args": <object>}`
/// Response on success: the op's result value as JSON.
/// Response on error: `{"error":{"code","message"}}` with appropriate HTTP status.
pub async fn handle_rpc(
    State(s): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let op = match body.get("op").and_then(serde_json::Value::as_str) {
        Some(o) => o.to_string(),
        None => {
            return core_error_response(CoreError::Usage("missing required field: op".to_string()))
                .into_response();
        }
    };
    let args = body
        .get("args")
        .cloned()
        .unwrap_or(serde_json::Value::Object(Default::default()));

    let mut model = s.model.lock().await;
    match dispatch(&mut model, &s.vault, &op, &args) {
        Ok(value) => (StatusCode::OK, Json(value)).into_response(),
        Err(e) => core_error_response(e).into_response(),
    }
}

/// Bind to `addr` and run the server. Blocks until interrupted.
pub async fn serve_http(vault: PathBuf, addr: String) -> Result<(), CoreError> {
    eprintln!("anchor serve: loading vault at {}", vault.display());
    let model = crate::vault::rebuild_vault_into_model(&vault)?;
    let state = AppState {
        model: Arc::new(TokioMutex::new(model)),
        vault: Arc::new(vault),
    };
    let app = build_router(state);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| CoreError::Io(e.to_string()))?;
    eprintln!("anchor serve: listening on http://{addr}");
    axum::serve(listener, app)
        .await
        .map_err(|e| CoreError::Io(e.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/// GET /notes — list all notes (summary view).
pub async fn handle_list_notes(State(s): State<AppState>) -> impl IntoResponse {
    let model = s.model.lock().await;
    match core::list_notes(&model) {
        Ok(notes) => (StatusCode::OK, Json(json!(notes))).into_response(),
        Err(e) => core_error_response(e).into_response(),
    }
}

/// GET /notes/:id — full note object (show).
pub async fn handle_show_note(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let model = s.model.lock().await;
    match core::read_note(id, &model) {
        Ok(note) => (StatusCode::OK, Json(note)).into_response(),
        Err(e) => core_error_response(e).into_response(),
    }
}

/// GET /notes/:id/raw — exact source body as {"content":"…"} (cat).
pub async fn handle_cat_note(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let model = s.model.lock().await;
    match core::read_note(id, &model) {
        Ok(note) => {
            let body = note["body"].as_str().unwrap_or("").to_string();
            (StatusCode::OK, Json(json!({"content": body}))).into_response()
        }
        Err(e) => core_error_response(e).into_response(),
    }
}

/// POST /notes — create a new note.
/// Body: `{"title"?: str, "type"?: str, "kind"?: str, "content"?: str}`
/// The HTTP field `content` is mapped to the core field `body`.
pub async fn handle_create_note(
    State(s): State<AppState>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let mut model = s.model.lock().await;
    // Map "content" → "body" for the core API
    let mut input = body.clone();
    if let Some(content) = body.get("content").cloned() {
        input["body"] = content;
    }
    match core::create_note(input, &mut model, &s.vault) {
        Ok(note) => {
            let note_id = domain::note_id(&note).to_string();
            let revision = domain::revision(&note).to_string();
            let path = note["filePath"].as_str().unwrap_or("").to_string();
            (
                StatusCode::CREATED,
                Json(json!({"id": note_id, "revision": revision, "path": path})),
            )
                .into_response()
        }
        Err(e) => core_error_response(e).into_response(),
    }
}

/// PUT /notes/:id — overwrite note body.
/// Body: `{"content": str, "if_match"?: str}`
/// Also accepts the standard `If-Match` header for optimistic concurrency.
/// Mismatch → 409 Conflict with `{"error":{"code":"conflict","message":"…"}}`.
pub async fn handle_overwrite_note(
    State(s): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let mut model = s.model.lock().await;

    // Accept if_match from HTTP If-Match header or body field
    let if_match_header = headers
        .get("if-match")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let if_match_body = body
        .get("if_match")
        .and_then(Value::as_str)
        .map(str::to_string);
    let if_match = if_match_header.or(if_match_body);

    let note = match core::read_note(id.clone(), &model) {
        Ok(n) => n,
        Err(e) => return core_error_response(e).into_response(),
    };
    let current_rev = domain::revision(&note).to_string();

    if let Some(expected) = &if_match {
        if expected != &current_rev {
            return core_error_response(CoreError::Conflict(format!(
                "revision mismatch: expected {expected}, got {current_rev}"
            )))
            .into_response();
        }
    }

    let new_body = body
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let input = json!({
        "noteId": id,
        "baseRevision": current_rev,
        "body": new_body
    });
    match core::update_note(input, &mut model, &s.vault) {
        Ok(updated) => {
            let rev = domain::revision(&updated).to_string();
            let path = updated["filePath"].as_str().unwrap_or("").to_string();
            (
                StatusCode::OK,
                Json(json!({"id": id, "revision": rev, "path": path})),
            )
                .into_response()
        }
        Err(e) => core_error_response(e).into_response(),
    }
}

/// GET /search?q=&limit=&tag=&type= — full-text search.
pub async fn handle_search(
    State(s): State<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let model = s.model.lock().await;
    let query = params.get("q").cloned().unwrap_or_default();
    let limit: u64 = params
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);
    let mut request = json!({"query": query, "limit": limit});
    if let Some(tag) = params.get("tag") {
        request["tag"] = json!(tag);
    }
    if let Some(t) = params.get("type") {
        request["type"] = json!(t);
    }
    match core::search_notes(request, &model) {
        Ok(results) => (StatusCode::OK, Json(json!(results))).into_response(),
        Err(e) => core_error_response(e).into_response(),
    }
}

/// GET /graph/:id?depth=1 — graph neighborhood.
pub async fn handle_graph(
    State(s): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let model = s.model.lock().await;
    let depth: u8 = params
        .get("depth")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1)
        .min(2);
    match core::get_graph_neighborhood(id, depth, &model) {
        Ok(graph) => (StatusCode::OK, Json(graph)).into_response(),
        Err(e) => core_error_response(e).into_response(),
    }
}

/// GET /diagnostics — vault diagnostics.
pub async fn handle_diagnostics(State(s): State<AppState>) -> impl IntoResponse {
    let model = s.model.lock().await;
    match core::diagnostics(&model) {
        Ok(diag) => (StatusCode::OK, Json(diag)).into_response(),
        Err(e) => core_error_response(e).into_response(),
    }
}

/// GET /ops or GET /ops/list — operation audit log.
pub async fn handle_ops(State(s): State<AppState>) -> impl IntoResponse {
    let model = s.model.lock().await;
    match core::list_operation_records(&model) {
        Ok(ops) => (StatusCode::OK, Json(json!(ops))).into_response(),
        Err(e) => core_error_response(e).into_response(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use http::Request;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    /// Build a fresh AppState with an isolated temp vault seeded via open_demo_vault.
    ///
    /// Each test gets its own temp dir so tests can run in parallel without
    /// conflicting on shared vault files (sqlite, notes, operations.jsonl).
    fn test_state() -> (AppState, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("create temp dir");
        let vault_path = dir.path().to_path_buf();
        // Ensure vault structure exists before seeding
        crate::vault::ensure_vault_structure(&vault_path).expect("ensure vault structure");
        // Seed demo content into the fresh vault
        crate::vault::seed_demo_vault(&vault_path).expect("seed demo vault");
        let mut model = Model::default();
        crate::vault::rebuild_vault(&vault_path, &mut model).expect("rebuild vault");
        let state = AppState {
            model: Arc::new(TokioMutex::new(model)),
            vault: Arc::new(vault_path),
        };
        (state, dir) // caller holds `dir` to keep temp dir alive for the test
    }

    async fn rpc(state: AppState, op: &str, args: serde_json::Value) -> (u16, serde_json::Value) {
        let app = build_router(state);
        let body = json!({"op": op, "args": args});
        let req = Request::builder()
            .method("POST")
            .uri("/rpc")
            .header("content-type", "application/json")
            .body(axum::body::Body::from(serde_json::to_vec(&body).unwrap()))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        let status = resp.status().as_u16();
        let bytes: Bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        (status, value)
    }

    /// Convenience: build an AppState with an empty (vault-structure-only) vault,
    /// no seeded notes. Useful for write-path tests that don't need existing notes.
    fn empty_state() -> (AppState, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("create temp dir");
        let vault_path = dir.path().to_path_buf();
        crate::vault::ensure_vault_structure(&vault_path).expect("ensure vault structure");
        let mut model = Model::default();
        crate::vault::rebuild_vault(&vault_path, &mut model).expect("rebuild vault");
        let state = AppState {
            model: Arc::new(TokioMutex::new(model)),
            vault: Arc::new(vault_path),
        };
        (state, dir)
    }

    // -----------------------------------------------------------------------
    // Read op smoke tests
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn rpc_diagnostics_read_op() {
        let (state, _dir) = test_state();
        let (status, value) = rpc(state, "diagnostics", json!({})).await;
        assert_eq!(status, 200, "expected 200 from diagnostics: {value}");
        assert!(
            value.get("health").is_some(),
            "expected health field: {value}"
        );
    }

    #[tokio::test]
    async fn rpc_list_notes_read_op() {
        let (state, _dir) = test_state();
        let (status, value) = rpc(state, "list_notes", json!({})).await;
        assert_eq!(status, 200, "expected 200 from list_notes: {value}");
        assert!(value.is_array(), "expected array from list_notes: {value}");
        let notes = value.as_array().unwrap();
        assert!(!notes.is_empty(), "expected notes in seeded vault");
    }

    // -----------------------------------------------------------------------
    // Write op smoke test: create_note then read_note round-trip
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn rpc_create_note_then_read_note_write_op() {
        let (state, _dir) = empty_state();

        // Write op: create_note
        let (status, created) = rpc(
            state.clone(),
            "create_note",
            json!({"title": "RPC Test Note", "body": "# RPC\n\nTest body."}),
        )
        .await;
        assert_eq!(status, 200, "create_note failed: {created}");
        let note_id = created["metadata"]["id"]
            .as_str()
            .expect("id in created note");

        // Read op: read_note with the new id
        let (status2, read) = rpc(state, "read_note", json!({"noteId": note_id})).await;
        assert_eq!(status2, 200, "read_note failed: {read}");
        assert_eq!(
            read["metadata"]["title"].as_str().unwrap_or(""),
            "RPC Test Note"
        );
        assert_eq!(read["body"].as_str().unwrap_or(""), "# RPC\n\nTest body.");
    }

    // -----------------------------------------------------------------------
    // Write op smoke test: update_note conflict detection (if-match)
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn rpc_update_note_conflict_detection() {
        let (state, _dir) = empty_state();

        // Create a note
        let (_, created) = rpc(
            state.clone(),
            "create_note",
            json!({"title": "Conflict RPC Test"}),
        )
        .await;
        let note_id = created["metadata"]["id"].as_str().unwrap().to_string();
        let rev = created["revision"].as_str().unwrap().to_string();

        // First update succeeds
        let (status1, updated) = rpc(
            state.clone(),
            "update_note",
            json!({"noteId": note_id, "baseRevision": rev, "body": "# Updated once."}),
        )
        .await;
        assert_eq!(status1, 200, "first update failed: {updated}");

        // Second update with original (stale) revision should conflict → 409
        let (status2, err) = rpc(
            state,
            "update_note",
            json!({"noteId": note_id, "baseRevision": rev, "body": "# Stale update."}),
        )
        .await;
        assert_eq!(status2, 409, "expected conflict on stale revision: {err}");
        assert_eq!(
            err["error"]["code"].as_str().unwrap_or(""),
            "conflict",
            "expected conflict code: {err}"
        );
    }

    // -----------------------------------------------------------------------
    // Error path: unknown op → usage error (500)
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn rpc_unknown_op_returns_usage_error() {
        let (state, _dir) = empty_state();
        let (status, err) = rpc(state, "does_not_exist", json!({})).await;
        assert_eq!(status, 500, "expected 500 for unknown op: {err}");
        assert_eq!(err["error"]["code"].as_str().unwrap_or(""), "usage");
    }

    #[tokio::test]
    async fn rpc_missing_op_field_returns_usage_error() {
        let (state, _dir) = empty_state();
        let app = build_router(state);
        let body = json!({"args": {}});
        let req = Request::builder()
            .method("POST")
            .uri("/rpc")
            .header("content-type", "application/json")
            .body(axum::body::Body::from(serde_json::to_vec(&body).unwrap()))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status().as_u16(), 500);
    }
}
