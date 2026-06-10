//! Vault discovery and on-disk I/O for the CLI.
//!
//! Layout (plan §8.4): the op-log truth lives in immutable, per-device op
//! segments at `.anchor/operations/<device_id>/<seq>.seg` (canonical codec
//! bytes — write once, never modify); `.anchor/config/vault.toml` declares the
//! vault; `.anchor/cache/` is device-local derived state and is never synced.
//! The CLI owns clock/entropy (D36): it stamps ops, the core never does.

use anchor_core::codec;
use anchor_core::dto::{OpStamp, Session};
use anchor_core::hash;
use anchor_core::hlc::Hlc;
use anchor_core::op::Op;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const ANCHOR_DIR: &str = ".anchor";

pub enum VaultError {
    /// No vault at/above the requested path (exit 5).
    NotOpen(String),
    /// Filesystem or codec failure (exit 6).
    Io(String),
}

impl VaultError {
    pub fn message(&self) -> &str {
        match self {
            VaultError::NotOpen(m) | VaultError::Io(m) => m,
        }
    }
}

fn io_err(context: &str, err: impl std::fmt::Display) -> VaultError {
    VaultError::Io(format!("{context}: {err}"))
}

pub struct Vault {
    /// The directory that contains `.anchor/`.
    pub root: PathBuf,
    pub vault_id: String,
    pub device_id: String,
}

impl Vault {
    fn anchor_dir(&self) -> PathBuf {
        self.root.join(ANCHOR_DIR)
    }

    fn operations_dir(&self) -> PathBuf {
        self.anchor_dir().join("operations")
    }
}

/// Resolve the vault root: explicit `--vault`, then `$ANCHOR_VAULT`, then
/// upward discovery of a `.anchor/` directory from the working directory.
pub fn resolve(explicit: Option<&str>) -> Result<Vault, VaultError> {
    let start: PathBuf = match explicit.map(String::from).or_else(|| std::env::var("ANCHOR_VAULT").ok()) {
        Some(path) => {
            let path = PathBuf::from(path);
            if !path.join(ANCHOR_DIR).is_dir() {
                return Err(VaultError::NotOpen(format!(
                    "no vault at {} (missing {ANCHOR_DIR}/); run `anchor init`",
                    path.display()
                )));
            }
            return open(path);
        }
        None => std::env::current_dir().map_err(|e| io_err("cwd", e))?,
    };
    let mut cursor: Option<&Path> = Some(start.as_path());
    while let Some(dir) = cursor {
        if dir.join(ANCHOR_DIR).is_dir() {
            return open(dir.to_path_buf());
        }
        cursor = dir.parent();
    }
    Err(VaultError::NotOpen(
        "no vault found here or above (missing .anchor/); run `anchor init` or pass --vault".to_string(),
    ))
}

fn open(root: PathBuf) -> Result<Vault, VaultError> {
    let config = root.join(ANCHOR_DIR).join("config").join("vault.toml");
    let text = fs::read_to_string(&config)
        .map_err(|e| io_err(&format!("read {}", config.display()), e))?;
    let vault_id = toml_str_value(&text, "vault_id").ok_or_else(|| {
        VaultError::Io(format!("{}: missing vault_id", config.display()))
    })?;
    let device_id = ensure_device_id(&root)?;
    Ok(Vault {
        root,
        vault_id,
        device_id,
    })
}

/// Minimal `key = "value"` lookup — the config is written by `init` and keeps
/// to that shape; this is not a general TOML parser.
fn toml_str_value(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        let line = line.trim();
        let Some(rest) = line.strip_prefix(key) else {
            continue;
        };
        let rest = rest.trim_start();
        let Some(rest) = rest.strip_prefix('=') else {
            continue;
        };
        let rest = rest.trim();
        if let Some(value) = rest.strip_prefix('"').and_then(|r| r.strip_suffix('"')) {
            return Some(value.to_string());
        }
    }
    None
}

/// Device identity is local cache (never synced): a cloned vault directory
/// gets a fresh device id, so per-device segment namespaces never collide.
fn ensure_device_id(root: &Path) -> Result<String, VaultError> {
    let cache = root.join(ANCHOR_DIR).join("cache");
    let file = cache.join("device_id");
    if let Ok(existing) = fs::read_to_string(&file) {
        let existing = existing.trim().to_string();
        if !existing.is_empty() {
            return Ok(existing);
        }
    }
    fs::create_dir_all(&cache).map_err(|e| io_err(&format!("mkdir {}", cache.display()), e))?;
    let id = format!("dev_{}", &entropy_hex()[..12]);
    fs::write(&file, &id).map_err(|e| io_err(&format!("write {}", file.display()), e))?;
    Ok(id)
}

fn entropy_hex() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seed = format!("{nanos}:{}", std::process::id());
    hash::hash_hex(seed.as_bytes())
}

/// Create a vault at `path` (default: the working directory). Idempotent: an
/// existing vault is opened, never overwritten.
pub fn init(path: Option<&str>) -> Result<Vault, VaultError> {
    let root = match path {
        Some(p) => PathBuf::from(p),
        None => std::env::current_dir().map_err(|e| io_err("cwd", e))?,
    };
    if root.join(ANCHOR_DIR).is_dir() {
        return open(root);
    }
    let config_dir = root.join(ANCHOR_DIR).join("config");
    fs::create_dir_all(&config_dir)
        .map_err(|e| io_err(&format!("mkdir {}", config_dir.display()), e))?;
    fs::create_dir_all(root.join(ANCHOR_DIR).join("operations"))
        .map_err(|e| io_err("mkdir operations", e))?;
    let vault_id = format!("vault_{}", &entropy_hex()[..12]);
    let config = format!(
        "# Anchor vault. The append-only op-log under operations/ is the only truth;\n\
         # everything else is derived. cache/ is device-local and never synced.\n\
         source_of_truth = \"op-log\"\n\
         sync = \"none\"\n\
         vault_id = \"{vault_id}\"\n"
    );
    fs::write(config_dir.join("vault.toml"), config)
        .map_err(|e| io_err("write vault.toml", e))?;
    open(root)
}

/// Load every op segment (all devices, filename order per device) through the
/// strict codec and materialize a session. Returns the session plus the op
/// count, which `persist_new_ops` uses to slice off what a command appended.
pub fn load(vault: &Vault) -> Result<(Session, usize), VaultError> {
    let mut ops: Vec<Op> = Vec::new();
    let operations = vault.operations_dir();
    let mut device_dirs: Vec<PathBuf> = match fs::read_dir(&operations) {
        Ok(entries) => entries
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.is_dir())
            .collect(),
        Err(_) => Vec::new(),
    };
    device_dirs.sort();
    for device_dir in device_dirs {
        let mut segments: Vec<PathBuf> = fs::read_dir(&device_dir)
            .map_err(|e| io_err(&format!("read {}", device_dir.display()), e))?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().is_some_and(|ext| ext == "seg"))
            .collect();
        segments.sort();
        for segment in segments {
            let bytes = fs::read(&segment)
                .map_err(|e| io_err(&format!("read {}", segment.display()), e))?;
            let decoded = codec::decode_segment(&bytes).map_err(|e| {
                VaultError::Io(format!(
                    "{}: corrupt or non-canonical segment ({e:?})",
                    segment.display()
                ))
            })?;
            ops.extend(decoded);
        }
    }
    let len = ops.len();
    Ok((Session::open_from_ops(vault.vault_id.clone(), ops), len))
}

/// Next segment sequence number for this device.
fn next_segment_seq(device_dir: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(device_dir) else {
        return 1;
    };
    entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            let stem = path.file_stem()?.to_str()?.to_string();
            stem.parse::<u64>().ok()
        })
        .max()
        .map(|max| max + 1)
        .unwrap_or(1)
}

/// Stamp for the next write command. `op_id` embeds the device and its next
/// segment seq (one write command = one segment), so ids are unique without
/// shared state; the HLC follows the loaded log's frontier.
pub fn next_stamp(vault: &Vault, session: &Session) -> OpStamp {
    let device_dir = vault.operations_dir().join(&vault.device_id);
    let seq = next_segment_seq(&device_dir);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let frontier = session
        .log()
        .iter()
        .map(|op| (op.hlc.wall, op.hlc.logical))
        .max()
        .unwrap_or((0, 0));
    let (wall, logical) = if now > frontier.0 {
        (now, 0)
    } else {
        (frontier.0, frontier.1 + 1)
    };
    let actor = std::env::var("ANCHOR_ACTOR")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "anchor-user".to_string());
    let actor_seq = session.log().iter().filter(|op| op.actor == actor).count() as u64 + 1;
    OpStamp {
        op_id: format!("op_{}_{seq:08}", vault.device_id),
        hlc: Hlc::new(wall, logical, vault.device_id.clone()),
        actor,
        seq: actor_seq,
    }
}

/// Persist everything a command appended beyond `base_len` as one immutable
/// segment. Returns the segment path, or `None` for a no-op command.
pub fn persist_new_ops(
    vault: &Vault,
    session: &Session,
    base_len: usize,
) -> Result<Option<PathBuf>, VaultError> {
    let new_ops = &session.log()[base_len..];
    if new_ops.is_empty() {
        return Ok(None);
    }
    let bytes = codec::encode_segment(new_ops);
    let device_dir = vault.operations_dir().join(&vault.device_id);
    fs::create_dir_all(&device_dir)
        .map_err(|e| io_err(&format!("mkdir {}", device_dir.display()), e))?;
    let seq = next_segment_seq(&device_dir);
    let path = device_dir.join(format!("{seq:08}.seg"));
    fs::write(&path, &bytes).map_err(|e| io_err(&format!("write {}", path.display()), e))?;
    Ok(Some(path))
}

/// Count the on-disk segments (for diagnostics).
pub fn segment_count(vault: &Vault) -> usize {
    let Ok(devices) = fs::read_dir(vault.operations_dir()) else {
        return 0;
    };
    devices
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .map(|device| {
            fs::read_dir(device.path())
                .map(|entries| {
                    entries
                        .filter_map(|e| e.ok())
                        .filter(|e| e.path().extension().is_some_and(|ext| ext == "seg"))
                        .count()
                })
                .unwrap_or(0)
        })
        .sum()
}
