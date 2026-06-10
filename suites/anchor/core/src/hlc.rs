//! Hybrid Logical Clock and the global total order `T`.
//!
//! `T = (hlc.wall, hlc.logical, hlc.device, actor, op_id)` (conflict §4). Every
//! component is machine-comparable and `op_id` is globally unique, so two
//! distinct ops can never tie — replay is a pure fold over `T`.
//!
//! The core never reads a clock: HLCs arrive stamped on ops from the platform.
//! This keeps the deterministic path free of OS time (D36).

use alloc::string::String;

/// A hybrid logical clock timestamp. `device` is the stamping device id.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Hlc {
    pub wall: u64,
    pub logical: u32,
    pub device: String,
}

impl Hlc {
    pub fn new(wall: u64, logical: u32, device: impl Into<String>) -> Self {
        Hlc {
            wall,
            logical,
            device: device.into(),
        }
    }
}

impl PartialOrd for Hlc {
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Hlc {
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        self.wall
            .cmp(&other.wall)
            .then(self.logical.cmp(&other.logical))
            .then(self.device.cmp(&other.device))
    }
}
