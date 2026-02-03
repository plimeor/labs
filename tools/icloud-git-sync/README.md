# iCloud Git Sync

A robust synchronization tool designed to bridge Obsidian vaults between mobile (iCloud Drive) and desktop (Git) while preserving version control integrity and mental flow.

## The Core Problem

Standard cloud sync solutions often struggle when combined with Git. If you sync a live Git repository directly:

- **Index Locks**: Background sync tasks can lock the `.git/index`, interrupting your manual edits.
- **Merge Conflicts**: Direct folder mirroring often leads to messy conflicts or accidental file restoration after a deletion.

## The Evolution

This tool wasn't built overnight. We moved through distinct phases:

1. **Force Mirroring**: Initially, we tried direct folder synchronization. It was fragile and frequently disrupted the local Git workflow.
2. **FSWatch Limitations**: We attempted to use `fswatch` to catch iCloud changes in real-time. However, iCloud's background download behavior is opaque to standard file system events, leading to missed updates.
3. **The Final Solution**: We landed on a **Three-way Merge** strategy using **Git Worktree isolation** and a robust **Polling** mechanism for reliable state detection.

## How It Works

This tool (managed by PM2) monitors your iCloud directory and handles the heavy lifting in the background using a state-aware logic.

### 1. Isolation

All sync operations occur in a temporary Git worktree (`~/.cache/icloud-git-sync`). Your main working directory remains completely untouched and unlocked.

### 2. State-Aware Synchronization

The tool tracks a `.last_sync_commit` hidden file within your iCloud folder and acts based on three primary scenarios:

- **Scenario A: No iCloud Changes**: If the physical iCloud content matches the last sync base, the tool simply ensures the latest Git `main` branch (which might contain new desktop edits) is mirrored back to iCloud. This ensures deletions made on desktop are propagated to mobile.
- **Scenario B: Simple iCloud Push**: If only iCloud has changed (Git repo is at the same base), it commits the iCloud changes and pushes directly to `main`.
- **Scenario C: Diverged Changes (Merge)**: If both iCloud and the Git repo have changed, the tool creates a "Delta Commit" for the iCloud updates and performs a `git merge -X ours`. This prioritizes the desktop Git branch content if conflicts occur, while still incorporating new mobile updates.

### 3. Resilience

It uses `chokidar` with polling enabled. While slightly slower than native events, it is the only reliable way to catch iCloud Drive's silent background updates on macOS.

## Configuration & Filters

The tool shares a unified ignore list between the file watcher and the sync engine:

- `.git`
- `.DS_Store`
- `Thumbs.db`
- `.obsidian/workspace.json` & `.obsidian/workspace-mobile.json`
- `.last_sync_commit` (Internal state file)

## Management

Monitor the sync process via PM2:

```bash
pm2 start ecosystem.config.cjs  # Start the sync daemon
pm2 status                       # Check health
pm2 logs atlas-icloud-sync       # View real-time logs
```

---

Part of the labs monorepo.
