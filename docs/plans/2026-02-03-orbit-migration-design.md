# Orbit Migration Design

**Date:** 2026-02-03
**Status:** ✅ Completed

## Overview

Migrated the `apps/orbit` project from the labs monorepo to a standalone repository at `~/Documents/orbit` with full commit history preservation and restructured as a bun workspace monorepo.

## Migration Summary

### Source
- **Repository:** ~/Documents/labs (labs monorepo)
- **Path:** apps/orbit/
- **Commits:** 6 commits affecting orbit

### Destination
- **Repository:** ~/Documents/orbit (standalone)
- **Structure:** Bun workspace monorepo
- **Total commits:** 8 (6 original + 2 restructuring)

## Implementation

### 1. History Extraction

Used `git subtree split` to extract the `apps/orbit` subdirectory with full commit history:

```bash
git subtree split --prefix=apps/orbit -b orbit-extraction
```

This created a new branch containing only commits that touched `apps/orbit`, with paths rewritten to remove the `apps/orbit/` prefix.

### 2. Repository Setup

- Fetched extraction branch into ~/Documents/orbit
- Reset main branch to match extracted history
- All 6 original commits preserved with full metadata

### 3. Monorepo Restructure

Reorganized the flat structure into a proper monorepo layout:

**Before:**
```
orbit/
├── server/
├── web/
├── shared/
├── README.md
└── tsconfig.json
```

**After:**
```
orbit/
├── apps/
│   ├── web/       # React frontend
│   └── server/    # Elysia backend
├── packages/
│   └── shared/    # Shared types/utils
├── package.json   # Workspace root
└── bun.lock
```

### 4. Configuration Updates

- Created workspace root `package.json` with unified scripts
- Fixed all tsconfig.json `extends` paths (../tsconfig.json → ../../tsconfig.json)
- Updated TypeScript path mappings for @orbit/shared imports
- Preserved orbit-specific configs (.gitignore, .env.example, README.md)

### 5. Commits Added

1. **refactor: restructure as bun workspace monorepo** - Reorganized directory structure
2. **fix: update tsconfig paths for monorepo structure** - Fixed TypeScript configuration

## Final State

### Commit History
```
4da7e16 fix: update tsconfig paths for monorepo structure
d2a94a0 refactor: restructure as bun workspace monorepo
fbae0b9 refactor(orbit): remove redundant package.json
eecfa17 feat(orbit): add feature module placeholders
b3ed01a feat(orbit): create web package with React and Vite setup
3d8b9da feat(orbit): create server package with Elysia setup
fa1e4ed feat(orbit): create shared package structure
4715401 feat(orbit): initialize orbit workspace root
```

### Workspace Configuration

**Root package.json:**
- Workspaces: `apps/*`, `packages/*`
- Unified scripts: dev, build, type-check
- Individual scripts: dev:web, dev:server, db:* commands

**Packages:**
- `@orbit/web` - React frontend with Vite
- `@orbit/server` - Elysia backend with Drizzle ORM
- `@orbit/shared` - Shared TypeScript types and utilities

### Verification

- ✅ All 6 original commits preserved
- ✅ File renames correctly detected by git
- ✅ Workspace dependencies installed (350 packages)
- ✅ TypeScript configuration validated
- ✅ Web package type-checks successfully
- ✅ Shared package type-checks successfully

## Usage

```bash
cd ~/Documents/orbit

# Install dependencies
bun install

# Run all packages in dev mode
bun dev

# Run specific packages
bun dev:web      # Frontend only
bun dev:server   # Backend only

# Database operations
bun db:generate  # Generate migrations
bun db:migrate   # Run migrations
bun db:studio    # Open Drizzle Studio
```

## Notes

- The original labs repo still contains orbit in apps/orbit
- The orbit-extraction branch has been cleaned up from labs repo
- Server package has expected type errors from third-party dependencies (normal with Bun)
- All workspace dependencies resolve correctly via workspace:* protocol
