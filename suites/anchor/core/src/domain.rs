/// Pure, Tauri-free domain logic: parsing, serialization, hashing, text analysis,
/// link extraction, and query helpers. No filesystem I/O, no Tauri types.
use chrono::{Local, Utc};
use regex::Regex;
use serde_json::{json, Map, Value};
use std::collections::{BTreeSet, HashSet};
use std::path::Path;

// ---------------------------------------------------------------------------
// Known frontmatter keys
// ---------------------------------------------------------------------------

/// Anchor-owned frontmatter keys — anything else is captured as an "extra"
/// and round-tripped verbatim so user-defined fields are never dropped on save.
pub const KNOWN_KEYS: &[&str] = &[
    "id",
    "kind",
    "title",
    "created",
    "updated",
    "type",
    "journalDate",
    "status",
    "aliases",
    "tags",
    "properties",
    "sourceRefs",
];

// ---------------------------------------------------------------------------
// Frontmatter splitting + parsing
// ---------------------------------------------------------------------------

pub fn split_frontmatter(raw: &str) -> (Option<&str>, String) {
    // Support both LF and CRLF line endings for the opening fence.
    let after_fence = if raw.starts_with("---\r\n") {
        &raw[5..]
    } else if raw.starts_with("---\n") {
        &raw[4..]
    } else {
        return (None, raw.to_string());
    };
    let fence_offset = if raw.starts_with("---\r\n") { 5 } else { 4 };

    // Find closing "\n---" (or "\r\n---") boundary.
    if let Some(index) = after_fence.find("\n---") {
        let end = fence_offset + index;
        let body_start = end + "\n---".len();
        // Skip an optional \r\n or \n after the closing fence.
        let body_start = if raw[body_start..].starts_with("\r\n") {
            body_start + 2
        } else if raw[body_start..].starts_with('\n') {
            body_start + 1
        } else {
            body_start
        };
        // Skip exactly one blank-line separator between the fence and the body —
        // the single newline serialize_markdown emits. Any further leading
        // newlines belong to the body and are preserved verbatim (the inverse
        // of write: we must not trim the user's spaces or blank lines on save).
        let body_start = if raw[body_start..].starts_with("\r\n") {
            body_start + 2
        } else if raw[body_start..].starts_with('\n') {
            body_start + 1
        } else {
            body_start
        };
        // Strip exactly one trailing line ending — the single newline
        // serialize_markdown appends. Trailing spaces and blank lines the user
        // typed survive, keeping the serialize/parse round-trip lossless so the
        // revision checksum stays stable across write → read.
        let mut body = &raw[body_start..];
        if let Some(stripped) = body.strip_suffix("\r\n") {
            body = stripped;
        } else if let Some(stripped) = body.strip_suffix('\n') {
            body = stripped;
        }
        return (Some(&raw[fence_offset..end]), body.to_string());
    }
    (None, raw.to_string())
}

pub fn parse_frontmatter(frontmatter: &str) -> Map<String, Value> {
    let mut metadata = Map::new();
    let mut section = String::new();
    let mut source_refs: Vec<Value> = Vec::new();
    let mut current_source_ref: Option<Map<String, Value>> = None;
    // Ordered list of unknown (extra) key-value pairs preserved for round-trip.
    // Each entry is a JSON object: {"key": "...", "kind": "scalar"|"list", "value": ...}
    let mut extras: Vec<Value> = Vec::new();

    for line in frontmatter.lines() {
        // Strip a trailing \r so CRLF files parse correctly.
        let trimmed = line.trim_end_matches('\r').trim_end();
        if trimmed.is_empty() {
            continue;
        }

        if !trimmed.starts_with(' ') {
            if let Some(source_ref) = current_source_ref.take() {
                source_refs.push(Value::Object(source_ref));
            }
            if trimmed.ends_with(':') {
                section = trimmed.trim_end_matches(':').to_string();
                match section.as_str() {
                    "aliases" | "tags" => {
                        metadata.insert(section.clone(), json!([]));
                    }
                    "properties" => {
                        metadata.insert(section.clone(), json!({}));
                    }
                    "sourceRefs" => {}
                    _ => {
                        // Unknown block-list section: start capturing as extra list.
                        extras.push(json!({ "key": section.clone(), "kind": "list", "value": [] }));
                    }
                }
                continue;
            }

            if let Some((key, value)) = trimmed.split_once(':') {
                let key = key.trim().to_string();
                let parsed = parse_scalar(value.trim());
                if KNOWN_KEYS.contains(&key.as_str()) {
                    metadata.insert(key, parsed);
                } else {
                    extras.push(json!({ "key": key, "kind": "scalar", "value": parsed }));
                }
            }
            section.clear();
            continue;
        }

        match section.as_str() {
            "aliases" | "tags" => {
                if let Some(value) = trimmed.trim().strip_prefix("- ") {
                    push_array_value(
                        metadata.entry(section.clone()).or_insert_with(|| json!([])),
                        parse_scalar(value),
                    );
                }
            }
            "properties" => {
                if let Some((key, value)) = trimmed.trim().split_once(':') {
                    metadata
                        .entry("properties".to_string())
                        .or_insert_with(|| json!({}))[key.trim()] = parse_scalar(value.trim());
                }
            }
            "sourceRefs" => {
                let line = trimmed.trim();
                if let Some(value) = line.strip_prefix("- id:") {
                    if let Some(source_ref) = current_source_ref.take() {
                        source_refs.push(Value::Object(source_ref));
                    }
                    let mut source_ref = Map::new();
                    source_ref.insert("id".to_string(), parse_scalar(value.trim()));
                    current_source_ref = Some(source_ref);
                } else if let Some((key, value)) = line.split_once(':') {
                    if let Some(source_ref) = current_source_ref.as_mut() {
                        source_ref.insert(key.trim().to_string(), parse_scalar(value.trim()));
                    }
                }
            }
            _ => {
                // Append items to the last known extra list section.
                let trimmed_item = trimmed.trim();
                if let Some(last) = extras.last_mut() {
                    if last["kind"] == "list" && last["key"] == section {
                        if let Some(value_str) = trimmed_item.strip_prefix("- ") {
                            if let Some(arr) = last["value"].as_array_mut() {
                                // Use parse_scalar so that quoted values like "[[Note]]"
                                // are stored as the unquoted string [[Note]] internally.
                                arr.push(parse_scalar(value_str));
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(source_ref) = current_source_ref.take() {
        source_refs.push(Value::Object(source_ref));
    }
    if !source_refs.is_empty() {
        metadata.insert("sourceRefs".to_string(), Value::Array(source_refs));
    }
    if !extras.is_empty() {
        metadata.insert("__anchor_extras__".to_string(), Value::Array(extras));
    }

    metadata
}

pub fn parse_scalar(raw: &str) -> Value {
    if raw == "[]" {
        return json!([]);
    }
    if raw == "{}" {
        return json!({});
    }
    if raw.starts_with('"') {
        return serde_json::from_str(raw).unwrap_or_else(|_| json!(raw.trim_matches('"')));
    }
    json!(raw)
}

pub fn inferred_metadata(rel: &str, body: &str) -> Map<String, Value> {
    let mut metadata = Map::new();
    let now = now_iso();
    metadata.insert("aliases".to_string(), json!([]));
    metadata.insert("created".to_string(), json!(now));
    metadata.insert(
        "id".to_string(),
        json!(format!("transient_{}", stable_hash(rel))),
    );
    metadata.insert("kind".to_string(), json!(kind_from_path(rel)));
    metadata.insert("properties".to_string(), json!({}));
    metadata.insert("tags".to_string(), json!([]));
    metadata.insert(
        "title".to_string(),
        json!(title_from_body_or_path(body, rel)),
    );
    metadata.insert("updated".to_string(), json!(now_iso()));
    metadata
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

pub fn serialize_markdown(metadata: &Value, body: &str) -> String {
    let mut lines = vec![
        "---".to_string(),
        format!("id: {}", string_at(metadata, "id").unwrap_or("")),
        format!("kind: {}", string_at(metadata, "kind").unwrap_or("note")),
        format!(
            "title: {}",
            serde_json::to_string(string_at(metadata, "title").unwrap_or("Untitled")).unwrap()
        ),
        format!("created: {}", string_at(metadata, "created").unwrap_or("")),
        format!("updated: {}", string_at(metadata, "updated").unwrap_or("")),
    ];

    if let Some(note_type) = string_at(metadata, "type") {
        lines.push(format!("type: {note_type}"));
    }
    if let Some(journal_date) = string_at(metadata, "journalDate") {
        lines.push(format!("journalDate: {journal_date}"));
    }
    // Emit status only when explicitly set (absent = active, the default).
    if let Some(status) = string_at(metadata, "status") {
        lines.push(format!("status: {status}"));
    }

    lines.push("aliases:".to_string());
    for alias in metadata["aliases"].as_array().cloned().unwrap_or_default() {
        lines.push(format!(
            "  - {}",
            serde_json::to_string(alias.as_str().unwrap_or("")).unwrap()
        ));
    }

    lines.push("tags:".to_string());
    for tag in metadata["tags"].as_array().cloned().unwrap_or_default() {
        lines.push(format!("  - {}", tag.as_str().unwrap_or("")));
    }

    lines.push("properties:".to_string());
    if let Some(properties) = metadata["properties"].as_object() {
        for (key, value) in properties {
            lines.push(format!(
                "  {key}: {}",
                serde_json::to_string(value.as_str().unwrap_or("")).unwrap()
            ));
        }
    }

    if let Some(source_refs) = metadata["sourceRefs"].as_array() {
        if !source_refs.is_empty() {
            lines.push("sourceRefs:".to_string());
            for source in source_refs {
                lines.push(format!("  - id: {}", string_at(source, "id").unwrap_or("")));
                lines.push(format!(
                    "    label: {}",
                    serde_json::to_string(string_at(source, "label").unwrap_or("")).unwrap()
                ));
                if let Some(note_id) = string_at(source, "noteId") {
                    lines.push(format!("    noteId: {note_id}"));
                }
            }
        }
    }

    // Append any extra (unknown) frontmatter fields in their original insertion order
    // so that user-defined keys like `related:`, `publish:`, `audience:` are never dropped.
    if let Some(extras) = metadata["__anchor_extras__"].as_array() {
        for entry in extras {
            let key = entry["key"].as_str().unwrap_or("");
            if key.is_empty() {
                continue;
            }
            match entry["kind"].as_str() {
                Some("scalar") => {
                    let raw = &entry["value"];
                    if let Some(inner) = raw.as_str() {
                        // Emit unquoted (bare) for: YAML reserved words, numbers, and
                        // plain words.  Only add JSON/YAML quoting when the value contains
                        // characters that require it (brackets, hashes, colons, quotes).
                        let needs_quotes = inner.contains('"')
                            || inner.contains('\'')
                            || inner.contains('[')
                            || inner.contains('{')
                            || inner.contains('#')
                            || inner.contains(':');
                        if needs_quotes {
                            let serialized =
                                serde_json::to_string(inner).unwrap_or_else(|_| inner.to_string());
                            lines.push(format!("{key}: {serialized}"));
                        } else {
                            // Emit bare — covers `true`, `false`, `null`, plain words,
                            // and numeric strings, all of which are valid bare YAML scalars.
                            lines.push(format!("{key}: {inner}"));
                        }
                    } else {
                        // Non-string JSON values (shouldn't happen in practice since
                        // parse_scalar stores everything as strings, but handle gracefully).
                        lines.push(format!("{key}: {raw}"));
                    }
                }
                Some("list") => {
                    lines.push(format!("{key}:"));
                    if let Some(items) = entry["value"].as_array() {
                        for item in items {
                            let item_str = item.as_str().unwrap_or("");
                            // Quote items that need it (wikilinks, URLs with colons, etc.)
                            let needs_quotes = item_str.contains('"')
                                || item_str.contains('[')
                                || item_str.contains('{')
                                || item_str.contains('#')
                                || item_str.contains(':');
                            if needs_quotes {
                                lines.push(format!(
                                    "  - {}",
                                    serde_json::to_string(item_str)
                                        .unwrap_or_else(|_| item_str.to_string())
                                ));
                            } else {
                                lines.push(format!("  - {item_str}"));
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    // Body is written verbatim (no trim) so the user's trailing spaces and
    // blank lines survive a save. split_frontmatter strips exactly the single
    // separator and trailing newline emitted here, so the round-trip is lossless.
    format!("{}\n---\n\n{}\n", lines.join("\n"), body)
}

// ---------------------------------------------------------------------------
// Note value construction
// ---------------------------------------------------------------------------

pub fn make_note_value(file_path: &str, metadata: Value, body: &str) -> Value {
    let mut metadata = metadata;
    merge_body_tags(&mut metadata, body);
    let serialized = serialize_markdown(&metadata, body);
    let checksum = stable_hash(&serialized);
    json!({
        "body": body,
        "checksum": checksum,
        "filePath": file_path,
        "metadata": metadata,
        "revision": checksum
    })
}

// ---------------------------------------------------------------------------
// Link and tag extraction
// ---------------------------------------------------------------------------

pub fn extract_links(notes: &[Value]) -> Vec<Value> {
    let mut title_index = std::collections::HashMap::new();
    let mut alias_index = std::collections::HashMap::new();
    for note in notes {
        title_index.insert(title(note).to_lowercase(), note_id(note).to_string());
        for alias in note["metadata"]["aliases"]
            .as_array()
            .cloned()
            .unwrap_or_default()
        {
            if let Some(alias) = alias.as_str() {
                alias_index.insert(alias.to_lowercase(), note_id(note).to_string());
            }
        }
    }

    let wikilink = Regex::new(r"\[\[([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?\]\]").unwrap();
    let property_link = Regex::new(r"^\[\[([^\]]+)\]\]$").unwrap();
    let mut links = Vec::new();

    for note in notes {
        let body = note["body"].as_str().unwrap_or("");
        let ignored = ignored_ranges(body);
        for capture in wikilink.captures_iter(body) {
            let whole = capture.get(0).unwrap();
            if is_ignored(whole.start(), whole.end(), &ignored) {
                continue;
            }
            let raw_target = capture
                .get(1)
                .map(|item| item.as_str().trim())
                .unwrap_or("");
            let normalized = raw_target.to_lowercase();
            let resolved = title_index
                .get(&normalized)
                .or_else(|| alias_index.get(&normalized));
            links.push(json!({
                "alias": capture.get(3).map(|item| item.as_str()),
                "fromNoteId": note_id(note),
                "rawTarget": raw_target,
                "resolvedNoteId": resolved,
                "source": "manual_link",
                "span": { "context": "body", "end": whole.end(), "start": whole.start() },
                "status": if resolved.is_some() { "resolved" } else { "unresolved" }
            }));
        }

        if let Some(properties) = note["metadata"]["properties"].as_object() {
            for (key, value) in properties {
                let value = value.as_str().unwrap_or("").trim();
                if let Some(capture) = property_link.captures(value) {
                    let raw_target = capture.get(1).map(|item| item.as_str()).unwrap_or("");
                    let normalized = raw_target.to_lowercase();
                    let resolved = title_index
                        .get(&normalized)
                        .or_else(|| alias_index.get(&normalized));
                    links.push(json!({
                        "fromNoteId": note_id(note),
                        "rawTarget": raw_target,
                        "resolvedNoteId": resolved,
                        "source": "property_link",
                        "span": { "context": "frontmatter", "end": key.len() + value.len(), "start": 0 },
                        "status": if resolved.is_some() { "resolved" } else { "unresolved" }
                    }));
                }
            }
        }
    }

    links
}

pub fn extract_unlinked_mentions(notes: &[Value], source_note_id: &str) -> Vec<Value> {
    let Some(source) = notes.iter().find(|note| note_id(note) == source_note_id) else {
        return Vec::new();
    };
    let body = source["body"].as_str().unwrap_or("");
    let ignored = ignored_ranges(body);
    let linked_targets: HashSet<String> = extract_links(&[source.clone()])
        .into_iter()
        .filter_map(|link| string_at(&link, "rawTarget").map(|value| value.to_lowercase()))
        .collect();
    let mut mentions = Vec::new();

    for candidate in notes {
        if note_id(candidate) == note_id(source)
            || linked_targets.contains(&title(candidate).to_lowercase())
        {
            continue;
        }
        let pattern = format!(r"(?i)\b{}\b", regex::escape(title(candidate)));
        let Ok(regex) = Regex::new(&pattern) else {
            continue;
        };
        if let Some(found) = regex.find(body) {
            if !is_ignored(found.start(), found.end(), &ignored) {
                mentions.push(json!({
                    "candidateNoteId": note_id(candidate),
                    "candidateTitle": title(candidate),
                    "sourceNoteId": note_id(source),
                    "span": { "context": "body", "end": found.end(), "start": found.start() }
                }));
            }
        }
    }

    mentions
}

pub fn merge_body_tags(metadata: &mut Value, body: &str) {
    let mut tags: BTreeSet<String> = metadata["tags"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| value.as_str().map(str::to_string))
        .collect();
    let tag_pattern =
        Regex::new(r"(^|[\s\(\{\[])#([A-Za-z][A-Za-z0-9_/-]*)").expect("tag regex must compile");
    let ignored = ignored_ranges(body);

    for capture in tag_pattern.captures_iter(body) {
        if let Some(match_value) = capture.get(0) {
            if !is_ignored(match_value.start(), match_value.end(), &ignored) {
                if let Some(tag) = capture.get(2) {
                    tags.insert(tag.as_str().to_string());
                }
            }
        }
    }
    metadata["tags"] = Value::Array(tags.into_iter().map(Value::String).collect());
}

pub fn ignored_ranges(body: &str) -> Vec<(usize, usize)> {
    // COMRAK DECISION (2026-05): We evaluated replacing these regexes with the
    // comrak CommonMark parser for robust code-fence/inline-code region detection.
    // Decision: RETAIN the current regex approach.
    //
    // Rationale: Anchor's wikilink [[…]] and #tag extraction are custom logic
    // regardless of parser choice; comrak would only improve ignored-range
    // detection. Anchor notes are personal-notes-grade — users do not write tilde
    // fences, 4-space-indented code blocks, or multi-backtick inline code in
    // practice. Adding comrak (~1 MB compiled + transitive deps) for a single
    // helper that passes all existing tests is not a clear robustness win.
    //
    // Known gap: inline code using multi-backtick delimiters (``foo``) is not
    // detected as an ignored range. Acceptable for current usage; revisit if
    // users report false link/tag extractions from such content.
    let mut ranges = Vec::new();
    for pattern in [r"(?ms)^```.*?^```", r"`[^`\n]+`"] {
        let Ok(regex) = Regex::new(&pattern) else {
            continue;
        };
        for found in regex.find_iter(body) {
            ranges.push((found.start(), found.end()));
        }
    }
    ranges
}

pub fn is_ignored(start: usize, end: usize, ranges: &[(usize, usize)]) -> bool {
    ranges
        .iter()
        .any(|(range_start, range_end)| start >= *range_start && end <= *range_end)
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

pub fn create_snippet(body: &str, query: &str) -> String {
    if query.trim().is_empty() {
        return body
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("")
            .chars()
            .take(180)
            .collect();
    }

    let lower_body = body.to_lowercase();
    if let Some(index) = lower_body.find(&query.to_lowercase()) {
        let start = index.saturating_sub(50);
        let end = (index + query.len() + 90).min(body.len());
        body[start..end]
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        body.lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("")
            .chars()
            .take(180)
            .collect()
    }
}

pub fn searchable_text(note: &Value) -> String {
    let properties = note["metadata"]["properties"]
        .as_object()
        .map(|properties| {
            properties
                .iter()
                .map(|(key, value)| format!("{} {}", key, value.as_str().unwrap_or("")))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    format!(
        "{}\n{}\n{}\n{}\n{}",
        title(note),
        note["body"].as_str().unwrap_or(""),
        string_at(&note["metadata"], "type").unwrap_or(""),
        metadata_tags(note).join(" "),
        properties
    )
}

pub fn graph_impact_summary(before: &Value, after: &Value) -> String {
    let before_links = extract_links(&[before.clone()]).len();
    let after_links = extract_links(&[after.clone()]).len();
    if before_links == after_links {
        "No link count change; projection refreshed from Markdown.".to_string()
    } else {
        format!(
            "Link count changed from {before_links} to {after_links}; projection refreshed from Markdown."
        )
    }
}

pub fn note_to_summary(note: &Value) -> Value {
    json!({
        "checksum": note["checksum"],
        "filePath": note["filePath"],
        "id": note_id(note),
        "kind": kind(note),
        "status": note["metadata"].get("status").cloned().unwrap_or(Value::Null),
        "tags": note["metadata"]["tags"],
        "title": title(note),
        "type": note["metadata"].get("type").cloned().unwrap_or(Value::Null),
        "updated": note["metadata"]["updated"]
    })
}

pub fn note_matches_filters(note: &Value, request: &Value) -> bool {
    // By default exclude archived and trashed notes.
    // Pass include: ["archived"] / ["trashed"] / ["archived","trashed"] to opt in.
    let note_status = string_at(&note["metadata"], "status").unwrap_or("active");
    if note_status == "archived" || note_status == "trashed" {
        let include = request.get("include").and_then(|v| v.as_array());
        let included = include
            .map(|arr| arr.iter().any(|v| v.as_str() == Some(note_status)))
            .unwrap_or(false);
        if !included {
            return false;
        }
    }

    if let Some(tag) = string_at(request, "tag") {
        if !metadata_tags(note).iter().any(|item| item == tag) {
            return false;
        }
    }
    if let Some(note_type) = string_at(request, "type") {
        if string_at(&note["metadata"], "type") != Some(note_type) {
            return false;
        }
    }
    if let Some(property_key) = string_at(request, "propertyKey") {
        if !note["metadata"]["properties"]
            .as_object()
            .map(|properties| properties.contains_key(property_key))
            .unwrap_or(false)
        {
            return false;
        }
    }
    if let Some(property_value) = string_at(request, "propertyValue") {
        if !note["metadata"]["properties"]
            .as_object()
            .map(|properties| {
                properties
                    .values()
                    .any(|value| value.as_str().unwrap_or("").contains(property_value))
            })
            .unwrap_or(false)
        {
            return false;
        }
    }

    match string_at(&request["scope"], "kind") {
        Some("tag") => metadata_tags(note)
            .iter()
            .any(|item| Some(item.as_str()) == string_at(&request["scope"], "value")),
        Some("object_type") => {
            string_at(&note["metadata"], "type") == string_at(&request["scope"], "value")
        }
        _ => true,
    }
}

// ---------------------------------------------------------------------------
// Metadata helpers
// ---------------------------------------------------------------------------

pub fn metadata_tags(note: &Value) -> Vec<String> {
    note["metadata"]["tags"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|tag| tag.as_str().map(str::to_string))
        .collect()
}

pub fn kind(note: &Value) -> &str {
    string_at(&note["metadata"], "kind").unwrap_or("note")
}

pub fn note_id(note: &Value) -> &str {
    string_at(&note["metadata"], "id").unwrap_or("")
}

pub fn revision(note: &Value) -> &str {
    string_at(note, "revision").unwrap_or("")
}

pub fn title(note: &Value) -> &str {
    string_at(&note["metadata"], "title").unwrap_or("Untitled")
}

pub fn string_at<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

pub fn apply_metadata_patch(metadata: &mut Map<String, Value>, patch: &Map<String, Value>) {
    for key in ["aliases", "properties", "tags", "title", "type"] {
        if let Some(value) = patch.get(key) {
            metadata.insert(key.to_string(), value.clone());
        }
    }
}

// ---------------------------------------------------------------------------
// Value-building helpers
// ---------------------------------------------------------------------------

pub fn operation_value(mut input: Value) -> Value {
    input["id"] = json!(next_id("op"));
    input["timestamp"] = json!(now_iso());
    input
}

pub fn revision_object(note_id: &str, revision: &str) -> Value {
    let mut object = Map::new();
    object.insert(note_id.to_string(), json!(revision));
    Value::Object(object)
}

pub fn proposed_change_from_append(
    note: &Value,
    mode: &str,
    append: &str,
    provenance: &str,
) -> Value {
    let after = format!(
        "{}\n{}\n",
        note["body"].as_str().unwrap_or("").trim_end(),
        append.trim_end()
    );
    json!({
        "approvalState": "pending",
        "baseRevisions": revision_object(note_id(note), revision(note)),
        "createdAt": now_iso(),
        "diff": [{ "after": after, "before": note["body"], "noteId": note_id(note), "title": title(note) }],
        "graphImpact": "No agent-inferred edge enters Core Graph before approval.",
        "id": next_id("pc"),
        "metadataImpact": "No metadata patch.",
        "mode": mode,
        "provenance": provenance,
        "targetNoteIds": [note_id(note)]
    })
}

pub fn agent_message(role: &str, content: &str, extra: Value) -> Value {
    let mut message = json!({
        "content": content,
        "id": next_id("msg"),
        "role": role,
        "timestamp": Local::now().timestamp_millis()
    });
    if let Some(extra) = extra.as_object() {
        for (key, value) in extra {
            message[key] = value.clone();
        }
    }
    message
}

pub fn timeline_event(event_type: &str, detail: &str) -> Value {
    json!({
        "detail": detail,
        "id": next_id("event"),
        "timestamp": now_iso(),
        "type": event_type
    })
}

pub fn canonical_mode(mode: &str) -> String {
    match mode {
        "safe" => "explore".to_string(),
        "allow-all" => "execute".to_string(),
        value => value.to_string(),
    }
}

pub fn permission_mode_state(
    mode: &str,
    previous: Option<&str>,
    version: i64,
    changed_by: &str,
) -> Value {
    json!({
        "changedAt": now_iso(),
        "changedBy": changed_by,
        "modeVersion": version,
        "permissionMode": mode,
        "previousPermissionMode": previous,
        "transitionDisplay": previous.map(|item| format!("{} -> {}", item, mode))
    })
}

// ---------------------------------------------------------------------------
// ID / time utilities
// ---------------------------------------------------------------------------

pub fn slugify(input: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for ch in input.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            output.push(ch);
            last_dash = false;
        } else if !last_dash {
            output.push('-');
            last_dash = true;
        }
    }
    output.trim_matches('-').to_string()
}

pub fn stable_hash(input: &str) -> String {
    // FNV-1a 64-bit: offset basis and prime from the FNV spec.
    const OFFSET: u64 = 0xcbf29ce484222325;
    const PRIME: u64 = 0x00000100000001b3;
    let mut hash: u64 = OFFSET;
    for byte in input.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(PRIME);
    }
    format!("rev_{hash:016x}")
}

pub fn next_id(prefix: &str) -> String {
    format!(
        "{}_{}",
        prefix,
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    )
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

pub fn title_from_body_or_path(body: &str, rel: &str) -> String {
    for line in body.lines() {
        if let Some(title) = line.strip_prefix("# ") {
            return title.trim().to_string();
        }
    }
    Path::new(rel)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Untitled")
        .replace('-', " ")
}

pub fn kind_from_path(rel: &str) -> &'static str {
    if rel.starts_with("journals/") {
        "journal"
    } else if rel.starts_with("references/") {
        "reference"
    } else if rel.starts_with("proposals/") {
        "proposal"
    } else {
        "note"
    }
}

pub fn relative_path(vault: &std::path::Path, path: &std::path::Path) -> Result<String, String> {
    Ok(path
        .strip_prefix(vault)
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .replace('\\', "/"))
}

// ---------------------------------------------------------------------------
// Array helpers
// ---------------------------------------------------------------------------

pub fn push_array(target: &mut Value, value: Value) {
    if let Some(items) = target.as_array_mut() {
        items.push(value);
    }
}

pub fn push_array_value(target: &mut Value, value: Value) {
    if let Some(items) = target.as_array_mut() {
        items.push(value);
    }
}

// ---------------------------------------------------------------------------
// Tests (moved from main.rs)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Read as IoRead;

    // ---------------------------------------------------------------------------
    // (a) Lossless frontmatter round-trip
    // ---------------------------------------------------------------------------
    #[test]
    fn roundtrip_preserves_unknown_fields() {
        let frontmatter = r#"id: note_abc
kind: note
title: "Test Note"
created: 2026-01-01T00:00:00Z
updated: 2026-01-01T00:00:00Z
aliases:
  - "Alias One"
tags:
  - research
properties:
  status: active
publish: true
audience: engineers
related:
  - "[[Note Alpha]]"
  - "[[Note Beta]]"
sources:
  - https://example.com
  - some-book"#;

        let metadata_map = parse_frontmatter(frontmatter);
        let metadata = Value::Object(metadata_map);

        // All known fields must be present
        assert_eq!(metadata["id"], "note_abc");
        assert_eq!(metadata["kind"], "note");
        assert_eq!(metadata["title"], "Test Note");
        assert_eq!(metadata["aliases"][0], "Alias One");
        assert_eq!(metadata["tags"][0], "research");
        assert_eq!(metadata["properties"]["status"], "active");

        // Extras must be captured
        let extras = metadata["__anchor_extras__"]
            .as_array()
            .expect("extras must exist");
        assert!(!extras.is_empty(), "extras should not be empty");

        let find_extra = |key: &str| extras.iter().find(|e| e["key"] == key).cloned();

        let publish_extra = find_extra("publish").expect("publish must be in extras");
        assert_eq!(publish_extra["kind"], "scalar");
        assert_eq!(publish_extra["value"], "true");

        let audience_extra = find_extra("audience").expect("audience must be in extras");
        assert_eq!(audience_extra["kind"], "scalar");
        assert_eq!(audience_extra["value"], "engineers");

        let related_extra = find_extra("related").expect("related must be in extras");
        assert_eq!(related_extra["kind"], "list");
        assert_eq!(related_extra["value"][0], "[[Note Alpha]]");
        assert_eq!(related_extra["value"][1], "[[Note Beta]]");

        let sources_extra = find_extra("sources").expect("sources must be in extras");
        assert_eq!(sources_extra["kind"], "list");
        assert_eq!(sources_extra["value"][0], "https://example.com");
        assert_eq!(sources_extra["value"][1], "some-book");

        // Round-trip: serialize then re-parse and verify fields survive
        let body = "# Test Note\n\nBody text.";
        let serialized = serialize_markdown(&metadata, body);

        // The serialized output must contain the extra fields
        assert!(
            serialized.contains("publish: true"),
            "publish must be in serialized output, got: {serialized}"
        );
        assert!(
            serialized.contains("audience: engineers"),
            "audience must be in serialized output"
        );
        assert!(
            serialized.contains("related:"),
            "related section header must be present"
        );
        assert!(
            serialized.contains("[[Note Alpha]]"),
            "related item [[Note Alpha]] must survive"
        );
        assert!(
            serialized.contains("[[Note Beta]]"),
            "related item [[Note Beta]] must survive"
        );
        assert!(
            serialized.contains("sources:"),
            "sources section must be present"
        );
        assert!(
            serialized.contains("https://example.com"),
            "sources item must survive"
        );

        // Parse the serialized output again to verify idempotency
        let (fm2, _body2) = split_frontmatter(&serialized);
        let metadata2_map =
            parse_frontmatter(fm2.expect("should have frontmatter after re-serialize"));
        let metadata2 = Value::Object(metadata2_map);

        assert_eq!(metadata2["id"], "note_abc");
        assert_eq!(metadata2["title"], "Test Note");
        assert_eq!(metadata2["audience"], Value::Null); // extra, not in known keys

        let extras2 = metadata2["__anchor_extras__"]
            .as_array()
            .expect("extras2 must exist");
        let find_extra2 = |key: &str| extras2.iter().find(|e| e["key"] == key).cloned();

        let publish2 = find_extra2("publish").expect("publish must survive re-parse");
        assert_eq!(publish2["value"], "true");

        let audience2 = find_extra2("audience").expect("audience must survive re-parse");
        assert_eq!(audience2["value"], "engineers");

        let related2 = find_extra2("related").expect("related must survive re-parse");
        assert_eq!(related2["value"][0], "[[Note Alpha]]");
        assert_eq!(related2["value"][1], "[[Note Beta]]");
    }

    // ---------------------------------------------------------------------------
    // (b) stable_hash determinism + 16 hex char length
    // ---------------------------------------------------------------------------
    #[test]
    fn stable_hash_is_deterministic_and_64bit() {
        let h1 = stable_hash("hello world");
        let h2 = stable_hash("hello world");
        assert_eq!(h1, h2, "hash must be deterministic");

        // Format: "rev_" + 16 hex chars = 20 chars total
        assert!(h1.starts_with("rev_"), "must start with rev_ prefix");
        let hex_part = &h1["rev_".len()..];
        assert_eq!(
            hex_part.len(),
            16,
            "hex part must be exactly 16 chars, got: {}",
            hex_part.len()
        );
        assert!(
            hex_part.chars().all(|c| c.is_ascii_hexdigit()),
            "must be valid hex"
        );

        // Different inputs must (almost certainly) produce different hashes
        let h3 = stable_hash("different input");
        assert_ne!(h1, h3, "different inputs must hash differently");

        // Empty string must also produce a valid 16-hex hash
        let h_empty = stable_hash("");
        let hex_empty = &h_empty["rev_".len()..];
        assert_eq!(hex_empty.len(), 16);
    }

    // ---------------------------------------------------------------------------
    // (c) write_note_file atomic: writes then reads back identical, no .anchor-tmp
    // ---------------------------------------------------------------------------
    #[test]
    fn write_note_file_is_atomic_and_clean() {
        let dir = std::env::temp_dir().join(format!(
            "anchor_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("create temp dir");

        let metadata = json!({
            "id": "note_test_atomic",
            "kind": "note",
            "title": "Atomic Test",
            "created": "2026-01-01T00:00:00Z",
            "updated": "2026-01-01T00:00:00Z",
            "aliases": [],
            "tags": [],
            "properties": {}
        });
        let body = "# Atomic Test\n\nThis is a test.";
        let file_path = "notes/atomic-test.md";

        let note = crate::vault::write_note_file(&dir, file_path, metadata, body)
            .expect("write_note_file must succeed");

        let full_path = dir.join(file_path);
        assert!(full_path.exists(), "final file must exist");

        // No .anchor-tmp file must remain
        let tmp_path = full_path.with_extension("anchor-tmp");
        assert!(
            !tmp_path.exists(),
            ".anchor-tmp must be cleaned up after rename"
        );

        // Read back and verify content matches what was written
        let mut content = String::new();
        fs::File::open(&full_path)
            .expect("open written file")
            .read_to_string(&mut content)
            .expect("read written file");

        let expected = serialize_markdown(&note["metadata"], note["body"].as_str().unwrap_or(""));
        assert_eq!(
            content, expected,
            "written content must match serialized output"
        );

        // Clean up
        let _ = fs::remove_dir_all(&dir);
    }

    // ---------------------------------------------------------------------------
    // (d) CRLF frontmatter parse
    // ---------------------------------------------------------------------------
    #[test]
    fn crlf_frontmatter_parses_correctly() {
        // Build a frontmatter block using \r\n line endings
        let raw = "---\r\nid: note_crlf\r\nkind: note\r\ntitle: \"CRLF Note\"\r\ncreated: 2026-01-01T00:00:00Z\r\nupdated: 2026-01-01T00:00:00Z\r\naliases:\r\n  - \"My Alias\"\r\ntags:\r\n  - crlf\r\nproperties:\r\n---\r\n\r\n# CRLF Note\r\n\r\nBody text.\r\n";

        let (fm, body) = split_frontmatter(raw);
        assert!(fm.is_some(), "CRLF file must have frontmatter detected");

        let metadata_map = parse_frontmatter(fm.unwrap());
        let metadata = Value::Object(metadata_map);

        assert_eq!(metadata["id"], "note_crlf", "id must parse from CRLF file");
        assert_eq!(metadata["kind"], "note");
        assert_eq!(metadata["title"], "CRLF Note");
        assert_eq!(
            metadata["aliases"][0], "My Alias",
            "aliases must parse from CRLF file"
        );
        assert_eq!(
            metadata["tags"][0], "crlf",
            "tags must parse from CRLF file"
        );

        // Body must be the text after the closing fence
        assert!(
            body.contains("CRLF Note") || body.contains("Body text"),
            "body must be extracted: {:?}",
            body
        );
    }

    // ---------------------------------------------------------------------------
    // (e) Autosave must not trim trailing/leading spaces or blank lines.
    //     The serialize → split round-trip must be lossless for the body and
    //     keep the revision checksum stable, otherwise saves would silently
    //     erase the user's whitespace or spuriously report conflicts.
    // ---------------------------------------------------------------------------
    #[test]
    fn serialize_split_roundtrip_preserves_whitespace_verbatim() {
        let metadata = json!({
            "id": "note_ws",
            "kind": "note",
            "title": "Whitespace",
            "created": "2026-01-01T00:00:00Z",
            "updated": "2026-01-01T00:00:00Z",
            "aliases": [],
            "tags": [],
            "properties": {}
        });

        // Bodies that exercise trailing spaces, trailing blank lines, leading
        // blank lines, interior blanks, and the empty document.
        let bodies = [
            "Plain body, no trailing newline",
            "Line with trailing spaces   ",
            "Body then two blank lines\n\n",
            "First\n\n\nMiddleBlanks\n",
            "\n\nLeading blank lines kept",
            "   ",
            "",
        ];

        for body in bodies {
            let serialized = serialize_markdown(&metadata, body);
            let (_fm, parsed_body) = split_frontmatter(&serialized);
            assert_eq!(
                parsed_body, body,
                "body must round-trip verbatim (no trimming), got {parsed_body:?} for {body:?}"
            );

            // Checksum stability: re-serializing the parsed body must reproduce
            // the exact bytes that were hashed on write.
            let reserialized = serialize_markdown(&metadata, &parsed_body);
            assert_eq!(
                reserialized, serialized,
                "serialize → split → serialize must be idempotent for {body:?}"
            );
        }
    }
}
