/**
 * start command - starts sync monitoring
 */
import { $ } from "bun";
import { resolve } from "path";
import { existsSync } from "fs";
import { watch } from "chokidar";
import { runSync, log, type SyncConfig, IGNORED_FILES } from "./sync";

export interface StartOptions {
  icloudPath: string;
  repoPath: string;
}

function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return resolve(process.env.HOME!, p.slice(1));
  }
  return resolve(p);
}

export async function start(options: StartOptions) {
  const icloudPath = expandPath(options.icloudPath);
  const repoPath = expandPath(options.repoPath);
  const name = process.env.PM2_APP_NAME || 'icloud-git-sync';

  // Validate paths
  if (!existsSync(icloudPath)) throw new Error(`iCloud path not found: ${icloudPath}`);
  if (!existsSync(`${repoPath}/.git`)) throw new Error(`Not a git repository: ${repoPath}`);

  // Validate remote
  const remotes = await $`git remote`.cwd(repoPath).quiet().text();
  if (!remotes.includes('origin')) {
    throw new Error(`Remote 'origin' not configured. Run: cd ${repoPath} && git remote add origin <url>`);
  }

  const config: SyncConfig = { icloudPath, repoPath };

  console.log(`\n✅ Starting iCloud Git Sync`);
  console.log(`   iCloud:  ${icloudPath}`);
  console.log(`   Repo:    ${repoPath}`);
  console.log(`   Remote:  origin/main\n`);

  // Initial sync
  await runSync(name, config);

  // Debounce: only execute once within 15 seconds for multiple triggers
  let syncTimeout: NodeJS.Timeout | null = null;
  const DEBOUNCE_MS = 15000;

  const scheduleSync = (source: string) => {
    if (syncTimeout) {
      log(name, `Sync already scheduled, skipping (source: ${source})`);
      return;
    }
    log(name, `Scheduling sync in 15s (source: ${source})...`);
    syncTimeout = setTimeout(async () => {
      syncTimeout = null;
      await runSync(name, config);
    }, DEBOUNCE_MS);
  };

  // Periodic polling as fallback (check every 2 minutes)
  const POLL_INTERVAL_MS = 2 * 60 * 1000;
  const pollInterval = setInterval(() => {
    scheduleSync('poll');
  }, POLL_INTERVAL_MS);

  // Graceful shutdown
  const cleanup = () => {
    if (syncTimeout) clearTimeout(syncTimeout);
    clearInterval(pollInterval);
    watcher.close();
    process.exit(0);
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  // Use Chokidar to watch iCloud directory
  log(name, "Starting Chokidar watcher with polling mode...");
  log(name, `Watching: ${icloudPath}`);
  log(name, `Polling interval: 2 minutes (backup)`);

  const watcher = watch(icloudPath, {
    // Use polling mode, more reliable for iCloud Drive
    usePolling: true,
    // Polling interval: 60 seconds
    interval: 60000,
    // Polling interval for binary files
    binaryInterval: 60000,
    // Ignore initial add events
    ignoreInitial: true,
    // Files to ignore (using function form, shared with rsync config)
    ignored: (path: string) => {
      return IGNORED_FILES.some(pattern => path.includes(pattern));
    },
    // Persistent watching
    persistent: true,
    // Recursively watch all subdirectories
    depth: 99,
    // Wait for file to stabilize before triggering events (milliseconds)
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 1000,
    },
  });

  watcher
    .on('add', (path) => {
      log(name, `File added: ${path}`);
      scheduleSync('chokidar:add');
    })
    .on('change', (path) => {
      log(name, `File changed: ${path}`);
      scheduleSync('chokidar:change');
    })
    .on('unlink', (path) => {
      log(name, `File removed: ${path}`);
      scheduleSync('chokidar:unlink');
    })
    .on('error', (error) => {
      log(name, `Watcher error: ${error.message}`);
    })
    .on('ready', () => {
      log(name, "Watcher ready, monitoring for changes...");
    });

  // Keep process running
  await new Promise(() => {});
}
