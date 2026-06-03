/// Demo-scaffolding: pure core logic for agent connections, tasks, and references.
/// These fixtures simulate agent behavior for the Anchor golden demo vault.
/// They are NOT production agent integrations — they exist solely to populate
/// realistic-looking agent UI state without requiring an external agent process.
///
/// All functions are Tauri-free: they operate on `&mut Model` + `&Path` and return
/// `Result<Value, CoreError>`. The thin `#[tauri::command]` wrappers live in main.rs.
use crate::domain::{
    agent_message, canonical_mode, create_snippet, next_id, note_id, now_iso, operation_value,
    permission_mode_state, proposed_change_from_append, push_array, revision, revision_object,
    string_at, timeline_event, title,
};
use crate::vault::{
    append_operation, find_note, rebuild_sqlite_projection, require_open_model, unique_file_path,
    write_note_file,
};
use crate::{CoreError, Model};
use serde_json::{json, Value};
use std::path::Path;

// ---------------------------------------------------------------------------
// Demo-scaffolding: agent connections (fixture data only)
// ---------------------------------------------------------------------------

pub fn core_list_agent_connections(model: &Model) -> Result<Vec<Value>, CoreError> {
    Ok(vec![
        json!({
            "authState": "not_required",
            "capabilities": ["read_note", "search_notes", "create_reference", "create_proposed_change"],
            "defaultMode": "ask",
            "displayName": "Internal development connection",
            "healthState": if model.vault_path.is_some() { "available" } else { "unavailable" },
            "id": "internal-dev",
            "type": "internal_dev"
        }),
        json!({
            "authState": "unavailable",
            "capabilities": [],
            "defaultMode": "ask",
            "displayName": "ACP adapter checkpoint",
            "healthState": "unavailable",
            "id": "acp-checkpoint",
            "type": "acp_checkpoint"
        }),
        json!({
            "authState": "unavailable",
            "capabilities": [],
            "defaultMode": "ask",
            "displayName": "Built-in provider checkpoint",
            "healthState": "unavailable",
            "id": "provider-checkpoint",
            "type": "built_in_provider_checkpoint"
        }),
    ])
}

// ---------------------------------------------------------------------------
// Demo-scaffolding: agent tasks
// ---------------------------------------------------------------------------

pub fn core_list_agent_tasks(model: &Model) -> Result<Vec<Value>, CoreError> {
    require_open_model(model).map_err(|_| CoreError::VaultNotOpen)?;
    Ok(model.agent_tasks.clone())
}

pub fn core_create_agent_task(
    input: Value,
    model: &mut Model,
    vault: &Path,
) -> Result<Value, CoreError> {
    let permission_mode = string_at(&input, "permissionMode")
        .unwrap_or("ask")
        .to_string();
    let title_value = string_at(&input, "title")
        .unwrap_or("Untitled agent task")
        .to_string();
    let target_note_id = string_at(&input, "targetNoteId").map(str::to_string);
    let task_id = next_id("task");
    let turn_id = next_id("turn");
    let mut explicit_sources = Vec::new();
    if let Some(target) = &target_note_id {
        explicit_sources.push(
            json!({ "id": next_id("src"), "label": "Target note snapshot", "noteId": target }),
        );
    }

    let mut task = json!({
        "connectionId": "internal-dev",
        "context": {
            "attachments": [],
            "explicitSources": explicit_sources,
            "scope": target_note_id.as_ref().map(|id| json!({ "kind": "current_note_neighborhood", "value": id })).unwrap_or_else(|| json!({ "kind": "none" })),
            "targetNoteId": target_note_id
        },
        "id": task_id,
        "messages": [
            agent_message("user", &title_value, json!({})),
            agent_message("assistant", "I will use scoped Operation Core capabilities and request approval before mutating Markdown.", json!({ "isIntermediate": true, "turnId": turn_id }))
        ],
        "mode": canonical_mode(&permission_mode),
        "outputs": [],
        "permissionModeState": permission_mode_state(&permission_mode, None, 0, "user"),
        "timeline": [
            timeline_event("user_message", &title_value),
            timeline_event("plan", "Use Operation Core read tools, generate a proposed Markdown change, wait for approval.")
        ],
        "title": title_value
    });

    if let Some(target) = task["context"]["targetNoteId"].as_str().map(str::to_string) {
        let note = find_note(model, &target)
            .cloned()
            .map_err(|e| CoreError::NotFound(e))?;
        let reference = create_agent_reference(
            vault,
            model,
            &note,
            task["context"]["explicitSources"].clone(),
        )?;
        let proposed = proposed_change_from_append(
            &note,
            &canonical_mode(&permission_mode),
            "\n\n## Agent-maintained follow-up\n\n- [ ] Review the new source-supported reference before promoting it into permanent knowledge.\n",
            "internal development connection",
        );
        model.proposed_changes.insert(0, proposed.clone());

        push_array(
            &mut task["outputs"],
            json!({
                "id": next_id("out"),
                "kind": "reference",
                "noteId": note_id(&reference),
                "sourceRefs": reference["metadata"].get("sourceRefs").cloned().unwrap_or_else(|| json!([])),
                "title": title(&reference)
            }),
        );
        push_array(
            &mut task["outputs"],
            json!({
                "id": next_id("out"),
                "kind": "proposed_change",
                "proposedChangeId": proposed["id"],
                "title": format!("Proposed update to {}", title(&note))
            }),
        );
        push_array(
            &mut task["messages"],
            agent_message(
                "tool",
                "",
                json!({
                    "toolDisplayName": "Read note",
                    "toolInput": { "fields": ["id", "title", "metadata", "snippet"], "noteId": note_id(&note) },
                    "toolIntent": "Read scoped note metadata and snippet",
                    "toolName": "read_note",
                    "toolResult": json!({ "id": note_id(&note), "snippet": create_snippet(note["body"].as_str().unwrap_or(""), ""), "title": title(&note) }).to_string(),
                    "toolStatus": "completed",
                    "toolUseId": next_id("tool"),
                    "turnId": turn_id
                }),
            ),
        );
        let explicit_sources = task["context"]["explicitSources"].clone();
        push_array(
            &mut task["messages"],
            agent_message(
                "tool",
                "",
                json!({
                    "toolDisplayName": "Create Reference",
                    "toolInput": { "sourceRefs": explicit_sources, "title": title(&reference) },
                    "toolIntent": "Persist source-supported Reference through Operation Core",
                    "toolName": "create_reference",
                    "toolResult": format!("Reference saved as {}", reference["filePath"].as_str().unwrap_or("")),
                    "toolStatus": "completed",
                    "toolUseId": next_id("tool"),
                    "turnId": turn_id
                }),
            ),
        );
        push_array(
            &mut task["messages"],
            agent_message(
                "permission-request",
                "Markdown mutation requires approval before apply_proposed_change.",
                json!({
                    "permissionRequest": {
                        "description": format!("Apply Proposed Change to {}", title(&note)),
                        "id": next_id("perm"),
                        "status": "pending",
                        "toolName": "apply_proposed_change",
                        "type": "notes_operation"
                    },
                    "turnId": turn_id
                }),
            ),
        );
        push_array(&mut task["messages"], agent_message("assistant", "Reference is saved from explicit sources. Proposed Change is pending; accepting it will route through Operation Core and append an operation record.", json!({
            "turnId": turn_id
        })));
        push_array(
            &mut task["timeline"],
            timeline_event(
                "tool_call",
                &format!(
                    "read_note fields=id,title,metadata,snippet scope={}",
                    note_id(&note)
                ),
            ),
        );
        push_array(
            &mut task["timeline"],
            timeline_event("tool_call", "create_reference sourceRefs=1"),
        );
        push_array(
            &mut task["timeline"],
            timeline_event(
                "permission_request",
                "Markdown write requires approval in ask mode.",
            ),
        );
        push_array(
            &mut task["timeline"],
            timeline_event(
                "result",
                "Reference saved; Proposed Change is pending approval.",
            ),
        );
    } else {
        push_array(
            &mut task["outputs"],
            json!({
                "id": next_id("out"),
                "kind": "draft",
                "markdown": "Select a scope to let the internal development connection read notes safely.",
                "title": "Scope required"
            }),
        );
        push_array(&mut task["messages"], agent_message("assistant", "This task has no scope. I can draft guidance, but Reference and Proposed Change outputs are disabled until a scope is selected.", json!({
            "turnId": turn_id
        })));
    }

    model.agent_tasks.insert(0, task.clone());
    rebuild_sqlite_projection(vault, &model.notes).map_err(|e| CoreError::Io(e))?;
    Ok(task)
}

pub fn core_set_task_permission_mode(
    task_id: String,
    mode: String,
    model: &mut Model,
) -> Result<Value, CoreError> {
    require_open_model(model).map_err(|_| CoreError::VaultNotOpen)?;
    let index = model
        .agent_tasks
        .iter()
        .position(|task| task["id"] == task_id)
        .ok_or_else(|| CoreError::NotFound(format!("task_not_found:{task_id}")))?;
    let previous = string_at(
        &model.agent_tasks[index]["permissionModeState"],
        "permissionMode",
    )
    .map(str::to_string);
    let version = model.agent_tasks[index]["permissionModeState"]["modeVersion"]
        .as_i64()
        .unwrap_or(0)
        + 1;
    model.agent_tasks[index]["permissionModeState"] =
        permission_mode_state(&mode, previous.as_deref(), version, "user");
    model.agent_tasks[index]["mode"] = json!(canonical_mode(&mode));
    push_array(
        &mut model.agent_tasks[index]["messages"],
        agent_message(
            "info",
            &format!("Permission mode changed to {}.", mode),
            json!({}),
        ),
    );
    Ok(model.agent_tasks[index].clone())
}

// ---------------------------------------------------------------------------
// Demo-scaffolding: agent reference creation (internal helper)
// ---------------------------------------------------------------------------

fn create_agent_reference(
    vault: &Path,
    model: &mut Model,
    source: &Value,
    source_refs: Value,
) -> Result<Value, CoreError> {
    let now = now_iso();
    let title_value = format!("Reference: {}", title(source));
    let metadata = json!({
        "aliases": [],
        "created": now,
        "id": next_id("ref"),
        "kind": "reference",
        "properties": { "source": format!("[[{}]]", title(source)) },
        "sourceRefs": source_refs,
        "tags": ["reference"],
        "title": title_value,
        "updated": now
    });
    let body = format!(
        "# Reference: {}\n\nThis reference is generated from explicit sources only.\n\n## Source summary\n\n{}\n",
        title(source),
        create_snippet(source["body"].as_str().unwrap_or(""), "")
    );
    let file_path = unique_file_path(
        vault,
        &format!(
            "references/reference-{}.md",
            crate::domain::slugify(title(source))
        ),
    );
    let note = write_note_file(vault, &file_path, metadata, &body).map_err(|e| CoreError::Io(e))?;
    model.notes.insert(0, note.clone());
    let operation = operation_value(json!({
        "actorId": "internal-dev-agent",
        "actorType": "agent",
        "approvalState": "accepted",
        "baseRevisions": {},
        "graphImpactSummary": "Reference edge is source-supported and can enter Core Graph.",
        "mode": "ask",
        "operationType": "create_reference",
        "provenance": "explicit task source",
        "resultingRevisions": revision_object(note_id(&note), revision(&note)),
        "targetNoteIds": [note_id(&note)]
    }));
    append_operation(vault, model, operation).map_err(|e| CoreError::Io(e))?;
    Ok(note)
}
