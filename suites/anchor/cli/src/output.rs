//! The CLI output contract: every command yields a table of rows; the global
//! I/O flags (`--format tsv|json`, `--fields`, `--limit`, `--count`) shape it.
//!
//! `tsv` (the default) is grep-friendly: one row per line, tab-separated, no
//! header, tabs/newlines escaped inside values. `json` wraps the rows in the
//! stable `apiVersion` envelope: `{"apiVersion":1,"command":…,"data":[…]}` —
//! emitted through the core's canonical serializer (sorted keys, no floats).

use anchor_core::canonical::{canonical_string, CanonicalValue};
use std::collections::BTreeMap;

/// The CLI schema version carried by every JSON envelope.
pub const API_VERSION: u64 = 1;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Tsv,
    Json,
}

pub struct OutputOpts {
    pub format: Format,
    pub fields: Option<Vec<String>>,
    pub limit: Option<usize>,
    pub count: bool,
}

/// One command result: ordered field names plus rows of (field → value).
pub struct Table {
    pub command: &'static str,
    pub fields: Vec<&'static str>,
    pub rows: Vec<Vec<(&'static str, String)>>,
}

impl Table {
    pub fn new(command: &'static str, fields: Vec<&'static str>) -> Table {
        Table {
            command,
            fields,
            rows: Vec::new(),
        }
    }

    pub fn push(&mut self, row: Vec<(&'static str, String)>) {
        self.rows.push(row);
    }
}

fn escape_tsv(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\t', "\\t")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

/// Render the table. `Err` is a usage error (an unknown `--fields` name).
pub fn render(table: &Table, opts: &OutputOpts) -> Result<String, String> {
    let selected: Vec<&'static str> = match &opts.fields {
        Some(requested) => {
            let mut picked = Vec::with_capacity(requested.len());
            for name in requested {
                match table.fields.iter().find(|f| *f == name) {
                    Some(field) => picked.push(*field),
                    None => {
                        return Err(format!(
                            "unknown field `{name}` (available: {})",
                            table.fields.join(", ")
                        ))
                    }
                }
            }
            picked
        }
        None => table.fields.clone(),
    };
    let rows: Vec<&Vec<(&'static str, String)>> = table
        .rows
        .iter()
        .take(opts.limit.unwrap_or(usize::MAX))
        .collect();

    if opts.count {
        return Ok(match opts.format {
            Format::Tsv => format!("{}\n", rows.len()),
            Format::Json => {
                let envelope = CanonicalValue::object([
                    ("apiVersion", CanonicalValue::UInt(API_VERSION)),
                    ("command", CanonicalValue::str(table.command)),
                    ("count", CanonicalValue::UInt(rows.len() as u64)),
                ]);
                format!("{}\n", canonical_string(&envelope))
            }
        });
    }

    match opts.format {
        Format::Tsv => {
            let mut out = String::new();
            for row in rows {
                let lookup: BTreeMap<&str, &String> =
                    row.iter().map(|(k, v)| (*k, v)).collect();
                let line: Vec<String> = selected
                    .iter()
                    .map(|field| {
                        lookup
                            .get(field)
                            .map(|v| escape_tsv(v))
                            .unwrap_or_default()
                    })
                    .collect();
                out.push_str(&line.join("\t"));
                out.push('\n');
            }
            Ok(out)
        }
        Format::Json => {
            let data: Vec<CanonicalValue> = rows
                .iter()
                .map(|row| {
                    let mut object = BTreeMap::new();
                    for (field, value) in row.iter() {
                        if selected.contains(field) {
                            object.insert(field.to_string(), CanonicalValue::str(value.clone()));
                        }
                    }
                    CanonicalValue::Object(object)
                })
                .collect();
            let envelope = CanonicalValue::object([
                ("apiVersion", CanonicalValue::UInt(API_VERSION)),
                ("command", CanonicalValue::str(table.command)),
                ("data", CanonicalValue::Array(data)),
            ]);
            Ok(format!("{}\n", canonical_string(&envelope)))
        }
    }
}
