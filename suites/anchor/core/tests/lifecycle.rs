/// Lifecycle tests: archive / trash / restore note operations.
///
/// Coverage:
///   (a) status round-trips through serialize/parse (absent, archived, trashed)
///   (b) archive excludes note from list_notes but note is still readable by id
///   (c) trash then restore returns note to list_notes
///   (d) archive appends an operation record with operationType "archive_note"
///   (e) trash then restore append operation records (trash_note, restore_note)
///   (f) list_notes_all opt-in includes archived and trashed
///   (g) search_notes excludes archived/trashed by default; include param opts in
///   (h) rpc archive_note / trash_note / restore_note via serve dispatch
use anchor_core::{
    core,
    domain::{parse_frontmatter, serialize_markdown, split_frontmatter, string_at},
    serve::{build_router, AppState},
    vault::{ensure_vault_structure, rebuild_vault},
    Model,
};
use axum::body::Body;
use bytes::Bytes;
use http::{Method, Request};
use http_body_util::BodyExt;
use serde_json::{json, Value};
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
    let pid = std::process::id();
    let dir = std::env::temp_dir().join(format!("anchor_lifecycle_test_{pid}_{nanos}_{seq}"));
    ensure_vault_structure(&dir).expect("ensure vault structure");
    dir
}

fn open_model(vault: &PathBuf) -> Model {
    let mut model = Model::default();
    rebuild_vault(vault, &mut model).expect("rebuild vault");
    model
}

fn create_note(vault: &PathBuf, model: &mut Model, title: &str) -> Value {
    core::create_note(
        json!({ "title": title, "body": format!("# {title}\n\nBody.") }),
        model,
        vault,
    )
    .expect("create note")
}

fn note_id_str(note: &Value) -> String {
    note["metadata"]["id"].as_str().unwrap_or("").to_string()
}

// ---------------------------------------------------------------------------
// (a) status round-trips through serialize/parse
// ---------------------------------------------------------------------------

#[test]
fn status_round_trips_serialize_parse_absent() {
    // Absent status → note_to_summary "status" is null, no "status:" line in file.
    let frontmatter = "id: note_x\nkind: note\ntitle: \"X\"\ncreated: 2026-01-01T00:00:00Z\nupdated: 2026-01-01T00:00:00Z\naliases:\ntags:\nproperties:";
    let meta_map = parse_frontmatter(frontmatter);
    let meta = Value::Object(meta_map);
    assert_eq!(
        meta.get("status"),
        None,
        "absent status must not be in parsed map"
    );
    let serialized = serialize_markdown(&meta, "body");
    assert!(
        !serialized.contains("status:"),
        "absent status must not emit status: line"
    );
}

#[test]
fn status_round_trips_serialize_parse_archived() {
    let frontmatter = "id: note_y\nkind: note\ntitle: \"Y\"\ncreated: 2026-01-01T00:00:00Z\nupdated: 2026-01-01T00:00:00Z\nstatus: archived\naliases:\ntags:\nproperties:";
    let meta_map = parse_frontmatter(frontmatter);
    let meta = Value::Object(meta_map.clone());
    assert_eq!(
        string_at(&meta, "status"),
        Some("archived"),
        "archived status must parse correctly"
    );
    let serialized = serialize_markdown(&meta, "body");
    assert!(
        serialized.contains("status: archived"),
        "archived status must appear in serialized output: {serialized}"
    );
    // Re-parse the serialized form
    let (fm2, _) = split_frontmatter(&serialized);
    let meta2_map = parse_frontmatter(fm2.expect("frontmatter must be present"));
    let meta2 = Value::Object(meta2_map);
    assert_eq!(
        string_at(&meta2, "status"),
        Some("archived"),
        "status must survive second parse"
    );
}

#[test]
fn status_round_trips_serialize_parse_trashed() {
    let frontmatter = "id: note_z\nkind: note\ntitle: \"Z\"\ncreated: 2026-01-01T00:00:00Z\nupdated: 2026-01-01T00:00:00Z\nstatus: trashed\naliases:\ntags:\nproperties:";
    let meta_map = parse_frontmatter(frontmatter);
    let meta = Value::Object(meta_map);
    assert_eq!(string_at(&meta, "status"), Some("trashed"));
    let serialized = serialize_markdown(&meta, "body");
    assert!(serialized.contains("status: trashed"));
    let (fm2, _) = split_frontmatter(&serialized);
    let meta2_map = parse_frontmatter(fm2.unwrap());
    assert_eq!(
        Value::Object(meta2_map)
            .get("status")
            .and_then(|v| v.as_str()),
        Some("trashed")
    );
}

// ---------------------------------------------------------------------------
// (b) archive excludes from list_notes but is readable by id
// ---------------------------------------------------------------------------

#[test]
fn archive_excludes_from_list_but_readable_by_id() {
    let vault = temp_vault();
    let mut model = open_model(&vault);

    let note = create_note(&vault, &mut model, "Archive Me");
    let id = note_id_str(&note);

    // Reload model (simulate fresh CLI invocation)
    let mut model2 = open_model(&vault);

    // Verify note is in list before archive
    let before_list = core::list_notes(&model2).expect("list_notes before archive");
    assert!(
        before_list.iter().any(|n| n["id"].as_str() == Some(&id)),
        "note must appear in list before archive"
    );

    // Archive it
    let result = core::archive_note(id.clone(), &mut model2, &vault).expect("archive_note");
    assert_eq!(
        result["id"].as_str(),
        Some(id.as_str()),
        "archive returns correct id"
    );
    assert!(
        result["revision"]
            .as_str()
            .unwrap_or("")
            .starts_with("rev_"),
        "archive returns a revision"
    );

    // Reload and check list excludes it
    let model3 = open_model(&vault);
    let after_list = core::list_notes(&model3).expect("list_notes after archive");
    assert!(
        !after_list.iter().any(|n| n["id"].as_str() == Some(&id)),
        "archived note must NOT appear in default list_notes"
    );

    // But read_note by id still works
    let read_back = core::read_note(id.clone(), &model3).expect("read_note archived note");
    assert_eq!(
        read_back["metadata"]["id"].as_str(),
        Some(id.as_str()),
        "archived note must be readable by id"
    );
    assert_eq!(
        string_at(&read_back["metadata"], "status"),
        Some("archived"),
        "note status must be 'archived'"
    );
}

// ---------------------------------------------------------------------------
// (c) trash then restore returns to list
// ---------------------------------------------------------------------------

#[test]
fn trash_then_restore_returns_to_list() {
    let vault = temp_vault();
    let mut model = open_model(&vault);

    let note = create_note(&vault, &mut model, "Trash Me");
    let id = note_id_str(&note);

    // Trash it
    let mut model2 = open_model(&vault);
    core::trash_note(id.clone(), &mut model2, &vault).expect("trash_note");

    // Verify excluded from list
    let model3 = open_model(&vault);
    let trashed_list = core::list_notes(&model3).expect("list after trash");
    assert!(
        !trashed_list.iter().any(|n| n["id"].as_str() == Some(&id)),
        "trashed note must not appear in default list"
    );

    // Restore
    let mut model4 = open_model(&vault);
    let restored = core::restore_note(id.clone(), &mut model4, &vault).expect("restore_note");
    assert_eq!(restored["id"].as_str(), Some(id.as_str()));

    // Verify back in list after restore
    let model5 = open_model(&vault);
    let restored_list = core::list_notes(&model5).expect("list after restore");
    assert!(
        restored_list.iter().any(|n| n["id"].as_str() == Some(&id)),
        "restored note must appear in default list again"
    );

    // Status key should be absent after restore (removed entirely)
    let read_back = core::read_note(id.clone(), &model5).expect("read restored note");
    assert_eq!(
        string_at(&read_back["metadata"], "status"),
        None,
        "status must be absent (key removed) after restore"
    );
}

// ---------------------------------------------------------------------------
// (d) archive appends operation record with correct operationType
// ---------------------------------------------------------------------------

#[test]
fn archive_appends_operation_record() {
    let vault = temp_vault();
    let mut model = open_model(&vault);

    let note = create_note(&vault, &mut model, "Op Record Note");
    let id = note_id_str(&note);

    let mut model2 = open_model(&vault);
    core::archive_note(id.clone(), &mut model2, &vault).expect("archive_note");

    let model3 = open_model(&vault);
    let ops = core::list_operation_records(&model3).expect("list ops");
    let found = ops.iter().any(|op| {
        op["operationType"].as_str() == Some("archive_note")
            && op["targetNoteIds"][0].as_str() == Some(&id)
    });
    assert!(
        found,
        "archive_note operation record must be present in ops log"
    );
}

// ---------------------------------------------------------------------------
// (e) trash then restore append operation records
// ---------------------------------------------------------------------------

#[test]
fn trash_restore_append_operation_records() {
    let vault = temp_vault();
    let mut model = open_model(&vault);

    let note = create_note(&vault, &mut model, "Trash Restore Ops");
    let id = note_id_str(&note);

    let mut model2 = open_model(&vault);
    core::trash_note(id.clone(), &mut model2, &vault).expect("trash_note");
    core::restore_note(id.clone(), &mut model2, &vault).expect("restore_note");

    let model3 = open_model(&vault);
    let ops = core::list_operation_records(&model3).expect("list ops");

    let has_trash = ops.iter().any(|op| {
        op["operationType"].as_str() == Some("trash_note")
            && op["targetNoteIds"][0].as_str() == Some(&id)
    });
    let has_restore = ops.iter().any(|op| {
        op["operationType"].as_str() == Some("restore_note")
            && op["targetNoteIds"][0].as_str() == Some(&id)
    });

    assert!(
        has_trash,
        "trash_note operation record must appear in ops log"
    );
    assert!(
        has_restore,
        "restore_note operation record must appear in ops log"
    );
}

// ---------------------------------------------------------------------------
// (f) list_notes_all opt-in includes archived and trashed
// ---------------------------------------------------------------------------

#[test]
fn list_notes_all_includes_archived_and_trashed() {
    let vault = temp_vault();
    let mut model = open_model(&vault);

    let n1 = create_note(&vault, &mut model, "Active Note");
    let id_active = note_id_str(&n1);
    let n2 = create_note(&vault, &mut model, "Archived Note");
    let id_archived = note_id_str(&n2);
    let n3 = create_note(&vault, &mut model, "Trashed Note");
    let id_trashed = note_id_str(&n3);

    let mut model2 = open_model(&vault);
    core::archive_note(id_archived.clone(), &mut model2, &vault).expect("archive");
    core::trash_note(id_trashed.clone(), &mut model2, &vault).expect("trash");

    let model3 = open_model(&vault);

    // list_notes: only active
    let default_list = core::list_notes(&model3).expect("list_notes");
    assert!(default_list
        .iter()
        .any(|n| n["id"].as_str() == Some(&id_active)));
    assert!(!default_list
        .iter()
        .any(|n| n["id"].as_str() == Some(&id_archived)));
    assert!(!default_list
        .iter()
        .any(|n| n["id"].as_str() == Some(&id_trashed)));

    // list_notes_all: all three
    let all_list = core::list_notes_all(&model3).expect("list_notes_all");
    assert!(all_list
        .iter()
        .any(|n| n["id"].as_str() == Some(&id_active)));
    assert!(all_list
        .iter()
        .any(|n| n["id"].as_str() == Some(&id_archived)));
    assert!(all_list
        .iter()
        .any(|n| n["id"].as_str() == Some(&id_trashed)));
}

// ---------------------------------------------------------------------------
// (g) search_notes excludes archived/trashed by default; include opts in
// ---------------------------------------------------------------------------

#[test]
fn search_notes_excludes_archived_trashed_by_default() {
    let vault = temp_vault();
    let mut model = open_model(&vault);

    let n1 = create_note(&vault, &mut model, "Searchable Active");
    let id_active = note_id_str(&n1);
    let n2 = create_note(&vault, &mut model, "Searchable Archived");
    let id_archived = note_id_str(&n2);

    let mut model2 = open_model(&vault);
    core::archive_note(id_archived.clone(), &mut model2, &vault).expect("archive");

    let model3 = open_model(&vault);

    // Default search: excludes archived
    let results = core::search_notes(json!({"query": "Searchable", "limit": 30}), &model3)
        .expect("search_notes default");
    assert!(results.iter().any(|r| r["id"].as_str() == Some(&id_active)));
    assert!(!results
        .iter()
        .any(|r| r["id"].as_str() == Some(&id_archived)));

    // With include: ["archived"]: shows both
    let results_with_archived = core::search_notes(
        json!({"query": "Searchable", "limit": 30, "include": ["archived"]}),
        &model3,
    )
    .expect("search_notes with archived");
    assert!(results_with_archived
        .iter()
        .any(|r| r["id"].as_str() == Some(&id_active)));
    assert!(results_with_archived
        .iter()
        .any(|r| r["id"].as_str() == Some(&id_archived)));
}

// ---------------------------------------------------------------------------
// (h) /rpc archive_note / trash_note / restore_note
// ---------------------------------------------------------------------------

fn make_state(vault: PathBuf) -> AppState {
    let mut model = Model::default();
    rebuild_vault(&vault, &mut model).expect("rebuild_vault");
    AppState {
        model: Arc::new(TokioMutex::new(model)),
        vault: Arc::new(vault),
    }
}

async fn rpc_call(state: AppState, op: &str, args: Value) -> (u16, Value) {
    let app = build_router(state);
    let body = json!({"op": op, "args": args});
    let req = Request::builder()
        .method(Method::POST)
        .uri("/rpc")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    let status = resp.status().as_u16();
    let bytes: Bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let value: Value = serde_json::from_slice(&bytes).unwrap();
    (status, value)
}

#[tokio::test]
async fn rpc_archive_trash_restore_lifecycle() {
    let vault = temp_vault();

    // Create a note via rpc create_note
    let state1 = make_state(vault.clone());
    let (status, created) = rpc_call(
        state1,
        "create_note",
        json!({"title": "RPC Lifecycle Note", "body": "# RPC Lifecycle\n\nBody."}),
    )
    .await;
    assert_eq!(status, 200, "create_note: {created}");
    let note_id = created["metadata"]["id"].as_str().expect("id").to_string();

    // archive_note
    let state2 = make_state(vault.clone());
    let (status2, archived) = rpc_call(state2, "archive_note", json!({"noteId": note_id})).await;
    assert_eq!(status2, 200, "archive_note failed: {archived}");
    assert_eq!(archived["id"].as_str(), Some(note_id.as_str()));

    // list_notes via rpc — archived note must be absent
    let state3 = make_state(vault.clone());
    let (status3, notes) = rpc_call(state3, "list_notes", json!({})).await;
    assert_eq!(status3, 200, "list_notes after archive: {notes}");
    assert!(notes.is_array());
    assert!(
        !notes
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["id"].as_str() == Some(&note_id)),
        "archived note must not appear in rpc list_notes"
    );

    // trash_note
    let state4 = make_state(vault.clone());
    let (status4, trashed) = rpc_call(state4, "trash_note", json!({"noteId": note_id})).await;
    assert_eq!(status4, 200, "trash_note failed: {trashed}");

    // restore_note
    let state5 = make_state(vault.clone());
    let (status5, restored) = rpc_call(state5, "restore_note", json!({"noteId": note_id})).await;
    assert_eq!(status5, 200, "restore_note failed: {restored}");

    // list_notes via rpc — restored note must be present
    let state6 = make_state(vault.clone());
    let (status6, notes2) = rpc_call(state6, "list_notes", json!({})).await;
    assert_eq!(status6, 200, "list_notes after restore: {notes2}");
    assert!(
        notes2
            .as_array()
            .unwrap()
            .iter()
            .any(|n| n["id"].as_str() == Some(&note_id)),
        "restored note must appear in rpc list_notes"
    );
}
