#!/usr/bin/env bun
/**
 * iCloud Git Sync unit tests
 *
 * Tests for worktree-based sync core logic
 */
import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { $ } from "bun";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";

// Test directories
let TEST_DIR: string;
let MOCK_ICLOUD: string;
let MOCK_REPO: string;
let MOCK_REMOTE: string;
let WORKTREE_CACHE: string;

beforeAll(async () => {
  // Create temporary test directory
  TEST_DIR = await mkdtemp(join(tmpdir(), "icloud-git-sync-test-"));
  MOCK_ICLOUD = join(TEST_DIR, "icloud");
  MOCK_REPO = join(TEST_DIR, "repo");
  MOCK_REMOTE = join(TEST_DIR, "remote.git");
  WORKTREE_CACHE = join(TEST_DIR, "worktree-cache");

  // Create directories
  await $`mkdir -p ${MOCK_ICLOUD} ${MOCK_REPO} ${WORKTREE_CACHE}`.quiet();

  // Initialize bare remote repository
  await $`git init --bare ${MOCK_REMOTE}`.quiet();

  // Initialize local repository
  await $`git init ${MOCK_REPO}`.quiet();
  await $`git config user.name "Test"`.cwd(MOCK_REPO).quiet();
  await $`git config user.email "test@test.com"`.cwd(MOCK_REPO).quiet();

  // Create initial commit
  await $`echo "# Test Repo" > README.md`.cwd(MOCK_REPO).quiet();
  await $`git add -A`.cwd(MOCK_REPO).quiet();
  await $`git commit -m "Initial commit"`.cwd(MOCK_REPO).quiet();

  // Add remote and push
  await $`git remote add origin ${MOCK_REMOTE}`.cwd(MOCK_REPO).quiet();
  await $`git push -u origin main`.cwd(MOCK_REPO).quiet();

  // Initialize iCloud directory (simulate existing content)
  await $`echo "# From iCloud" > note.md`.cwd(MOCK_ICLOUD).quiet();
});

afterAll(async () => {
  // Clean up test directory
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("Worktree operations", () => {
  test("Create and delete worktree", async () => {
    const worktreePath = join(WORKTREE_CACHE, "test-worktree");

    // Create worktree
    await $`git worktree add ${worktreePath} origin/main`.cwd(MOCK_REPO).quiet();

    // Verify creation success
    const exists = await $`test -d ${worktreePath}`.nothrow().quiet();
    expect(exists.exitCode).toBe(0);

    // Verify worktree list
    const list = await $`git worktree list`.cwd(MOCK_REPO).quiet().text();
    expect(list).toContain(worktreePath);

    // Delete worktree
    await $`git worktree remove ${worktreePath} --force`.cwd(MOCK_REPO).quiet();

    // Verify deletion success
    const existsAfter = await $`test -d ${worktreePath}`.nothrow().quiet();
    expect(existsAfter.exitCode).not.toBe(0);
  });
});

describe("iCloud -> Git sync", () => {
  test("Detect new file and commit", async () => {
    const worktreePath = join(WORKTREE_CACHE, "sync-test-1");

    try {
      // Fetch remote
      await $`git fetch origin`.cwd(MOCK_REPO).quiet();

      // Create worktree
      await $`git worktree add ${worktreePath} origin/main`.cwd(MOCK_REPO).quiet();

      // rsync iCloud to worktree
      await $`rsync -a --delete --exclude='.git' ${MOCK_ICLOUD}/ ${worktreePath}/`.quiet();

      // Check for changes
      const status = await $`git status --porcelain`.cwd(worktreePath).quiet().text();
      expect(status.trim()).not.toBe("");
      expect(status).toContain("note.md");

      // Commit
      await $`git add -A`.cwd(worktreePath).quiet();
      await $`git commit -m "Test sync"`.cwd(worktreePath).quiet();

      // Push
      await $`git push origin HEAD:main`.cwd(worktreePath).quiet();

      // Verify remote has new commit
      await $`git fetch origin`.cwd(MOCK_REPO).quiet();
      const remoteLog = await $`git log --oneline origin/main -2`.cwd(MOCK_REPO).quiet().text();
      expect(remoteLog).toContain("Test sync");
    } finally {
      await $`git worktree remove ${worktreePath} --force`.cwd(MOCK_REPO).nothrow().quiet();
    }
  });

  test("No commit when no changes", async () => {
    const worktreePath = join(WORKTREE_CACHE, "sync-test-2");

    try {
      await $`git fetch origin`.cwd(MOCK_REPO).quiet();
      await $`git worktree add ${worktreePath} origin/main`.cwd(MOCK_REPO).quiet();

      // rsync (content already synced, should have no changes)
      await $`rsync -a --delete --exclude='.git' ${MOCK_ICLOUD}/ ${worktreePath}/`.quiet();

      // Check for changes
      const status = await $`git status --porcelain`.cwd(worktreePath).quiet().text();
      expect(status.trim()).toBe("");
    } finally {
      await $`git worktree remove ${worktreePath} --force`.cwd(MOCK_REPO).nothrow().quiet();
    }
  });

  test("Detect file modification", async () => {
    const worktreePath = join(WORKTREE_CACHE, "sync-test-3");

    try {
      // Modify file in iCloud
      await $`echo "Modified content" >> note.md`.cwd(MOCK_ICLOUD).quiet();

      await $`git fetch origin`.cwd(MOCK_REPO).quiet();
      await $`git worktree add ${worktreePath} origin/main`.cwd(MOCK_REPO).quiet();

      // rsync
      await $`rsync -a --delete --exclude='.git' ${MOCK_ICLOUD}/ ${worktreePath}/`.quiet();

      // Should detect modification
      const status = await $`git status --porcelain`.cwd(worktreePath).quiet().text();
      expect(status.trim()).not.toBe("");
      expect(status).toContain("note.md");

      // Commit and push
      await $`git add -A`.cwd(worktreePath).quiet();
      await $`git commit -m "Modified note"`.cwd(worktreePath).quiet();
      await $`git push origin HEAD:main`.cwd(worktreePath).quiet();
    } finally {
      await $`git worktree remove ${worktreePath} --force`.cwd(MOCK_REPO).nothrow().quiet();
    }
  });

  test("Detect file deletion", async () => {
    const worktreePath = join(WORKTREE_CACHE, "sync-test-4");

    try {
      // Delete file in iCloud
      await $`rm -f note.md`.cwd(MOCK_ICLOUD).quiet();
      await $`echo "new file" > new.md`.cwd(MOCK_ICLOUD).quiet();

      await $`git fetch origin`.cwd(MOCK_REPO).quiet();
      await $`git worktree add ${worktreePath} origin/main`.cwd(MOCK_REPO).quiet();

      // rsync (--delete removes extra files in target)
      await $`rsync -a --delete --exclude='.git' ${MOCK_ICLOUD}/ ${worktreePath}/`.quiet();

      // Should detect deletion and addition
      const status = await $`git status --porcelain`.cwd(worktreePath).quiet().text();
      expect(status).toContain("D"); // Deleted
      expect(status).toContain("new.md"); // Added

      // Commit and push
      await $`git add -A`.cwd(worktreePath).quiet();
      await $`git commit -m "Delete and add"`.cwd(worktreePath).quiet();
      await $`git push origin HEAD:main`.cwd(worktreePath).quiet();
    } finally {
      await $`git worktree remove ${worktreePath} --force`.cwd(MOCK_REPO).nothrow().quiet();
    }
  });
});

describe("Git -> iCloud sync", () => {
  test("Sync from remote to iCloud", async () => {
    const worktreePath = join(WORKTREE_CACHE, "push-test-1");
    const testICloud = join(TEST_DIR, "icloud-push-test");
    await $`mkdir -p ${testICloud}`.quiet();

    try {
      await $`git fetch origin`.cwd(MOCK_REPO).quiet();
      await $`git worktree add ${worktreePath} origin/main`.cwd(MOCK_REPO).quiet();

      // rsync worktree to iCloud
      await $`rsync -a --delete --exclude='.git' ${worktreePath}/ ${testICloud}/`.quiet();

      // Verify files synced successfully
      const files = await $`ls ${testICloud}`.quiet().text();
      expect(files).toContain("new.md");
    } finally {
      await $`git worktree remove ${worktreePath} --force`.cwd(MOCK_REPO).nothrow().quiet();
    }
  });
});

describe("Error handling", () => {
  test("worktree cleanup - force delete", async () => {
    const worktreePath = join(WORKTREE_CACHE, "cleanup-test");

    // Create worktree
    await $`git fetch origin`.cwd(MOCK_REPO).quiet();
    await $`git worktree add ${worktreePath} origin/main`.cwd(MOCK_REPO).quiet();

    // Create uncommitted changes in worktree
    await $`echo "uncommitted" > dirty.txt`.cwd(worktreePath).quiet();

    // Force delete should succeed
    const result = await $`git worktree remove ${worktreePath} --force`
      .cwd(MOCK_REPO)
      .nothrow()
      .quiet();
    expect(result.exitCode).toBe(0);

    // Verify deleted
    const exists = await $`test -d ${worktreePath}`.nothrow().quiet();
    expect(exists.exitCode).not.toBe(0);
  });

  test("worktree prune cleans up leftovers", async () => {
    // Manually create a leftover directory
    const fakePath = join(WORKTREE_CACHE, "fake-worktree");
    await $`mkdir -p ${fakePath}`.quiet();

    // prune should handle it
    const result = await $`git worktree prune`.cwd(MOCK_REPO).nothrow().quiet();
    expect(result.exitCode).toBe(0);
  });
});

describe("Concurrency safety", () => {
  test("Multiple worktrees can coexist", async () => {
    const worktree1 = join(WORKTREE_CACHE, "concurrent-1");
    const worktree2 = join(WORKTREE_CACHE, "concurrent-2");

    try {
      await $`git fetch origin`.cwd(MOCK_REPO).quiet();

      // Create two worktrees simultaneously
      await Promise.all([
        $`git worktree add ${worktree1} origin/main`.cwd(MOCK_REPO).quiet(),
        $`git worktree add ${worktree2} origin/main`.cwd(MOCK_REPO).quiet(),
      ]);

      // Verify both exist
      const list = await $`git worktree list`.cwd(MOCK_REPO).quiet().text();
      expect(list).toContain("concurrent-1");
      expect(list).toContain("concurrent-2");
    } finally {
      await $`git worktree remove ${worktree1} --force`.cwd(MOCK_REPO).nothrow().quiet();
      await $`git worktree remove ${worktree2} --force`.cwd(MOCK_REPO).nothrow().quiet();
    }
  });
});
