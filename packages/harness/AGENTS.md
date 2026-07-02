# Package: @plimeor/harness

This file inherits the root `AGENTS.md`; keep package-local context stable and
limited to this package.

## Boundaries

- Keep `@plimeor/harness` library-only: no `bin`. Native CLI details, identity
  checks, permission semantics, and extension writes live in adapters, not core.

## Docs

- `packages/harness/README.md` owns the public SDK API, adapter matrix,
  extension resources, and stable behavior docs.
