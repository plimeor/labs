#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anchor_core::{core, AnchorState};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

// ---------------------------------------------------------------------------
// Thin #[tauri::command] wrappers
//
// Each wrapper:
//   1. Locks the AnchorState mutex
//   2. Calls the corresponding pure function from `core::`
//   3. Maps CoreError → String (the TS frontend tests for specific string codes)
//
// Command names and payload shapes are intentionally identical to the old
// implementation so the TypeScript frontend (src/backend/index.ts) continues
// to work without any changes.
// ---------------------------------------------------------------------------

#[tauri::command]
fn diagnostics(state: State<'_, AnchorState>) -> Result<Value, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::diagnostics(&model).map_err(Into::into)
}

#[tauri::command]
fn open_demo_vault(state: State<'_, AnchorState>) -> Result<Value, String> {
    let mut model = state.model.lock().map_err(|e| e.to_string())?;
    core::open_demo_vault(&mut model).map_err(Into::into)
}

#[tauri::command]
fn open_vault(path: String, state: State<'_, AnchorState>) -> Result<Value, String> {
    let mut model = state.model.lock().map_err(|e| e.to_string())?;
    core::open_vault(path, &mut model).map_err(Into::into)
}

#[tauri::command]
fn list_notes(state: State<'_, AnchorState>) -> Result<Vec<Value>, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::list_notes(&model).map_err(Into::into)
}

#[tauri::command]
fn read_note(note_id: String, state: State<'_, AnchorState>) -> Result<Value, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::read_note(note_id, &model).map_err(Into::into)
}

#[tauri::command]
fn open_today_journal(state: State<'_, AnchorState>) -> Result<Value, String> {
    let mut model = state.model.lock().map_err(|e| e.to_string())?;
    let vault = anchor_core::vault::require_vault(&model).map_err(|e| e)?;
    core::open_today_journal(&mut model, &vault).map_err(Into::into)
}

#[tauri::command]
fn create_note(input: Value, state: State<'_, AnchorState>) -> Result<Value, String> {
    let mut model = state.model.lock().map_err(|e| e.to_string())?;
    let vault = anchor_core::vault::require_vault(&model).map_err(|e| e)?;
    core::create_note(input, &mut model, &vault).map_err(Into::into)
}

#[tauri::command]
fn update_note(input: Value, state: State<'_, AnchorState>) -> Result<Value, String> {
    let mut model = state.model.lock().map_err(|e| e.to_string())?;
    let vault = anchor_core::vault::require_vault(&model).map_err(|e| e)?;
    core::update_note(input, &mut model, &vault).map_err(Into::into)
}

#[tauri::command]
fn search_notes(request: Value, state: State<'_, AnchorState>) -> Result<Vec<Value>, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::search_notes(request, &model).map_err(Into::into)
}

#[tauri::command]
fn get_backlinks(note_id: String, state: State<'_, AnchorState>) -> Result<Vec<Value>, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::get_backlinks(note_id, &model).map_err(Into::into)
}

#[tauri::command]
fn get_links(note_id: String, state: State<'_, AnchorState>) -> Result<Vec<Value>, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::get_links(note_id, &model).map_err(Into::into)
}

#[tauri::command]
fn get_graph_neighborhood(
    target_note_id: String,
    depth: u8,
    state: State<'_, AnchorState>,
) -> Result<Value, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::get_graph_neighborhood(target_note_id, depth, &model).map_err(Into::into)
}

#[tauri::command]
fn get_object_types(state: State<'_, AnchorState>) -> Result<Vec<Value>, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::get_object_types(&model).map_err(Into::into)
}

#[tauri::command]
fn get_unlinked_mentions(
    note_id: String,
    state: State<'_, AnchorState>,
) -> Result<Vec<Value>, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::get_unlinked_mentions(note_id, &model).map_err(Into::into)
}

#[tauri::command]
fn list_operation_records(state: State<'_, AnchorState>) -> Result<Vec<Value>, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::list_operation_records(&model).map_err(Into::into)
}

#[tauri::command]
fn get_proposed_changes(state: State<'_, AnchorState>) -> Result<Vec<Value>, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::get_proposed_changes(&model).map_err(Into::into)
}

#[tauri::command]
fn create_proposed_change(input: Value, state: State<'_, AnchorState>) -> Result<Value, String> {
    let mut model = state.model.lock().map_err(|e| e.to_string())?;
    core::create_proposed_change(input, &mut model).map_err(Into::into)
}

#[tauri::command]
fn apply_proposed_change(id: String, state: State<'_, AnchorState>) -> Result<Value, String> {
    let mut model = state.model.lock().map_err(|e| e.to_string())?;
    let vault = anchor_core::vault::require_vault(&model).map_err(|e| e)?;
    core::apply_proposed_change(id, &mut model, &vault).map_err(Into::into)
}

#[tauri::command]
fn reject_proposed_change(id: String, state: State<'_, AnchorState>) -> Result<Value, String> {
    let mut model = state.model.lock().map_err(|e| e.to_string())?;
    let vault = anchor_core::vault::require_vault(&model).map_err(|e| e)?;
    core::reject_proposed_change(id, &mut model, &vault).map_err(Into::into)
}

// ---------------------------------------------------------------------------
// Agent fixture command wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_agent_connections(state: State<'_, AnchorState>) -> Result<Vec<Value>, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::list_agent_connections(&model).map_err(Into::into)
}

#[tauri::command]
fn list_agent_tasks(state: State<'_, AnchorState>) -> Result<Vec<Value>, String> {
    let model = state.model.lock().map_err(|e| e.to_string())?;
    core::list_agent_tasks(&model).map_err(Into::into)
}

#[tauri::command]
fn create_agent_task(input: Value, state: State<'_, AnchorState>) -> Result<Value, String> {
    let mut model = state.model.lock().map_err(|e| e.to_string())?;
    let vault = anchor_core::vault::require_vault(&model).map_err(|e| e)?;
    core::create_agent_task(input, &mut model, &vault).map_err(Into::into)
}

#[tauri::command]
fn set_task_permission_mode(
    task_id: String,
    mode: String,
    state: State<'_, AnchorState>,
) -> Result<Value, String> {
    let mut model = state.model.lock().map_err(|e| e.to_string())?;
    core::set_task_permission_mode(task_id, mode, &mut model).map_err(Into::into)
}

#[tauri::command]
fn install_cli(app: AppHandle) -> Result<Value, String> {
    let source = resolve_cli_source(&app)?;
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "cli_install_error: HOME is not set".to_string())?;
    let local_bin = home.join(".local/bin");
    let destination = local_bin.join("anchor");

    fs::create_dir_all(&local_bin).map_err(|error| {
        format!(
            "cli_install_error: failed to create {}: {error}",
            local_bin.display()
        )
    })?;

    if let Ok(metadata) = fs::symlink_metadata(&destination) {
        if metadata.file_type().is_symlink() {
            let target = fs::read_link(&destination).map_err(|error| {
                format!(
                    "cli_install_error: failed to inspect {}: {error}",
                    destination.display()
                )
            })?;
            if !is_anchor_managed_link_target(&target) {
                return Err(format!(
                    "cli_path_conflict: {} already points to {}",
                    destination.display(),
                    target.display()
                ));
            }
            fs::remove_file(&destination).map_err(|error| {
                format!(
                    "cli_install_error: failed to replace {}: {error}",
                    destination.display()
                )
            })?;
        } else if is_anchor_managed_shim(&destination) {
            fs::remove_file(&destination).map_err(|error| {
                format!(
                    "cli_install_error: failed to replace {}: {error}",
                    destination.display()
                )
            })?;
        } else {
            return Err(format!(
                "cli_path_conflict: {} already exists and is not managed by Anchor",
                destination.display()
            ));
        }
    }

    create_cli_link(&source, &destination)?;
    let path_contains_local_bin = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).any(|entry| entry == local_bin))
        .unwrap_or(false);

    Ok(json!({
        "installedPath": destination,
        "pathHint": if path_contains_local_bin { Value::Null } else { json!("fish_add_path ~/.local/bin") },
        "targetPath": source
    }))
}

fn resolve_cli_source(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = bundled_cli_path(app) {
        return Ok(path);
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.join("../..");
    for candidate in [
        repo_root.join("target/release/anchor-cli"),
        repo_root.join("target/debug/anchor-cli"),
    ] {
        if candidate.is_file() {
            return candidate.canonicalize().map_err(|error| {
                format!("cli_install_error: failed to resolve CLI path: {error}")
            });
        }
    }

    Err("cli_install_error: Anchor CLI binary is not available in this build".to_string())
}

fn bundled_cli_path(app: &AppHandle) -> Option<PathBuf> {
    let mut dirs = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        dirs.push(resource_dir);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.push(dir.to_path_buf());
        }
    }

    for dir in dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = path.file_name()?.to_string_lossy();
                if path.is_file() && file_name.starts_with("anchor-cli") {
                    return Some(path);
                }
            }
        }
    }
    None
}

fn is_anchor_managed_link_target(target: &Path) -> bool {
    let value = target.to_string_lossy();
    value.contains("anchor-cli") || value.contains("/Anchor.app/")
}

fn is_anchor_managed_shim(path: &Path) -> bool {
    let Ok(contents) = fs::read_to_string(path) else {
        return false;
    };
    contents.contains("Anchor managed CLI shim")
}

#[cfg(unix)]
fn create_cli_link(source: &Path, destination: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(source, destination).map_err(|error| {
        format!(
            "cli_install_error: failed to link {} to {}: {error}",
            destination.display(),
            source.display()
        )
    })
}

#[cfg(not(unix))]
fn create_cli_link(source: &Path, destination: &Path) -> Result<(), String> {
    fs::copy(source, destination).map(|_| ()).map_err(|error| {
        format!(
            "cli_install_error: failed to copy {} to {}: {error}",
            source.display(),
            destination.display()
        )
    })
}

// ---------------------------------------------------------------------------
// Tauri application entry-point
// ---------------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AnchorState::default())
        .invoke_handler(tauri::generate_handler![
            // Agent fixtures
            create_agent_task,
            list_agent_connections,
            list_agent_tasks,
            set_task_permission_mode,
            // Operations
            apply_proposed_change,
            create_note,
            create_proposed_change,
            diagnostics,
            get_backlinks,
            get_graph_neighborhood,
            get_links,
            get_object_types,
            get_proposed_changes,
            get_unlinked_mentions,
            install_cli,
            list_notes,
            list_operation_records,
            open_demo_vault,
            open_today_journal,
            open_vault,
            read_note,
            reject_proposed_change,
            search_notes,
            update_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Anchor")
}
