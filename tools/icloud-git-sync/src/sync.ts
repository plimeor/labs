/**
 * Core sync logic (Three-way Merge strategy)
 */
import { $ } from "bun";
import { join } from "path";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";

export interface SyncConfig {
  icloudPath: string;
  repoPath: string;
}

const WORKTREE_BASE = join(process.env.HOME!, ".cache/icloud-git-sync");
const STATE_FILE_NAME = ".last_sync_commit";

/**
 * Unified ignore list (for rsync and Chokidar)
 */
export const IGNORED_FILES = [
  '.git',
  '.DS_Store',
  'Thumbs.db',
  '.obsidian/workspace.json',
  '.obsidian/workspace-mobile.json',
  STATE_FILE_NAME,
];

export function log(name: string, message: string) {
  console.log(`[${new Date().toISOString()}] [${name}] ${message}`);
}

/**
 * Get or initialize sync base (Commit ID)
 */
async function getLastSyncCommit(config: SyncConfig): Promise<string> {
  const statePath = join(config.icloudPath, STATE_FILE_NAME);

  if (existsSync(statePath)) {
    const commit = readFileSync(statePath, "utf-8").trim();
    if (commit) return commit;
  }

  // If no state file exists, use current origin/main as base
  log("sync", "No last_sync_commit found, initializing with origin/main");
  const currentMain = await $`git rev-parse origin/main`.cwd(config.repoPath).quiet().text();
  const commit = currentMain.trim();
  writeFileSync(statePath, commit);
  return commit;
}

/**
 * Update sync base
 */
function updateLastSyncCommit(config: SyncConfig, commit: string) {
  const statePath = join(config.icloudPath, STATE_FILE_NAME);
  writeFileSync(statePath, commit);
}

/**
 * Create temporary worktree based on a specific commit
 */
export async function createWorktree(config: SyncConfig, baseCommit: string): Promise<string> {
  const worktreeId = `sync-${randomUUID().slice(0, 8)}`;
  const worktreePath = join(WORKTREE_BASE, worktreeId);

  await $`mkdir -p ${WORKTREE_BASE}`.quiet();

  // Create worktree based on baseCommit in detached HEAD state
  await $`git worktree add --detach ${worktreePath} ${baseCommit}`
    .cwd(config.repoPath)
    .quiet();

  return worktreePath;
}

/**
 * Clean up worktree
 */
export async function cleanupWorktree(repoPath: string, worktreePath: string | null) {
  if (!worktreePath) return;
  if (!worktreePath.startsWith(WORKTREE_BASE)) return;

  try {
    await $`git worktree remove ${worktreePath} --force`.cwd(repoPath).quiet();
  } catch {
    await $`git worktree prune`.cwd(repoPath).nothrow().quiet();
  }
}

/**
 * Execute a full sync
 */
export async function runSync(name: string, config: SyncConfig): Promise<boolean> {
  let worktreePath: string | null = null;

  try {
    // 1. Get latest remote state and base
    await $`git fetch origin main`.cwd(config.repoPath).quiet();
    const latestMain = (await $`git rev-parse origin/main`.cwd(config.repoPath).quiet().text()).trim();
    const baseCommit = await getLastSyncCommit(config);

    log(name, `Current Main: ${latestMain.slice(0, 7)}, Base: ${baseCommit.slice(0, 7)}`);

    // 2. Create worktree based on baseCommit to compare iCloud changes
    worktreePath = await createWorktree(config, baseCommit);

    // 3. Copy iCloud content to worktree (with --delete)
    const excludes = IGNORED_FILES.flatMap(item => ['--exclude', item]);

    await $`rsync -a --delete ${excludes} ${config.icloudPath}/ ${worktreePath}/`.quiet();

    // 4. Check Git status after copying
    const status = await $`git status --porcelain`.cwd(worktreePath).quiet().text();

    if (!status.trim()) {
      // (a) No changes: iCloud matches Git base.
      // Sync latest main branch content to physical iCloud (in case main is ahead)
      log(name, "iCloud matches base. Syncing latest main -> iCloud if needed.");

      // Create a temporary worktree for latest main to sync back to iCloud
      const mainPath = join(WORKTREE_BASE, `main-${randomUUID().slice(0, 8)}`);
      await $`git worktree add --detach ${mainPath} ${latestMain}`.cwd(config.repoPath).quiet();

      try {
        await $`rsync -a --delete ${excludes} ${mainPath}/ ${config.icloudPath}/`.quiet();
        updateLastSyncCommit(config, latestMain);
        log(name, `Successfully synced latest main to iCloud. Base updated to ${latestMain.slice(0, 7)}`);
      } finally {
        await cleanupWorktree(config.repoPath, mainPath);
      }
      return true;
    }

    // (b) Changes detected
    log(name, "Changes detected in iCloud folder.");

    if (baseCommit === latestMain) {
      // Scenario 1: Only iCloud changed, Git repo unchanged
      log(name, "Scenario: iCloud changes only. Pushing to main.");
      await $`git add -A`.cwd(worktreePath).quiet();
      await $`git commit -m "Auto-sync from iCloud (Direct)"`.cwd(worktreePath).quiet();
      await $`git push origin HEAD:main`.cwd(worktreePath).quiet();

      const newCommit = (await $`git rev-parse HEAD`.cwd(worktreePath).quiet().text()).trim();
      updateLastSyncCommit(config, newCommit);
      log(name, `Push success. Base updated to ${newCommit.slice(0, 7)}`);
    } else {
      // Scenario 2: Both iCloud and Git have changes (or Git deleted files, causing rsync to bring them back as Added/Modified)
      // Use merge in this case, favoring main branch content (-X ours)
      log(name, "Scenario: Diverged changes. Merging iCloud changes into main (favoring main)...");

      // Commit iCloud changes as a delta
      await $`git add -A`.cwd(worktreePath).quiet();
      await $`git commit -m "iCloud Delta"` .cwd(worktreePath).quiet();
      const deltaCommit = (await $`git rev-parse HEAD`.cwd(worktreePath).quiet().text()).trim();

      // Switch to latest main for merge
      await $`git reset --hard ${latestMain}`.cwd(worktreePath).quiet();

      // Merge: bring in iCloud delta, favoring main content on conflicts
      // If main deleted a file and iCloud didn't modify it, Git merge correctly identifies it as deleted.
      await $`git merge ${deltaCommit} -m "Merge iCloud updates (prefer main)" -X ours`.cwd(worktreePath).quiet();

      const finalCommit = (await $`git rev-parse HEAD`.cwd(worktreePath).quiet().text()).trim();

      // Push result
      await $`git push origin HEAD:main`.cwd(worktreePath).quiet();

      // Sync back to iCloud to ensure bidirectional consistency
      await $`rsync -a --delete ${excludes} ${worktreePath}/ ${config.icloudPath}/`.quiet();
      updateLastSyncCommit(config, finalCommit);
      log(name, `Merge success. Base updated to ${finalCommit.slice(0, 7)}`);
    }

    return true;
  } catch (error: any) {
    log(name, `Sync failed: ${error.message || error}`);
    return false;
  } finally {
    await cleanupWorktree(config.repoPath, worktreePath);
  }
}
