---
id: note_pg_slow_query
kind: note
title: "Postgres slow-query playbook"
created: 2026-05-20T14:00:00+08:00
updated: 2026-05-30T18:30:00+08:00
type: Reference
aliases:
  - "PG perf runbook"
  - "Slow query triage"
tags:
  - postgres
  - performance
  - runbook
properties:
  status: "active"
  owner: "[[Anchor V1]]"
---

# Postgres slow-query playbook

This is the runbook I reach for when a query "feels slow" in production. It is **opinionated and ordered** — work the steps top to bottom, don't skip to indexes. Companion notes: [[Database conventions]], [[Anchor architecture]], and the incident log at [[On-call journal]].

> The single most common mistake is *adding an index before reading the plan*. An index you didn't need is a write you'll pay for forever. Read the plan first. #performance/golden-rule

## When to open this note

Reach for this playbook when **any** of these is true:

- A request `p99` crossed its SLO and the trace points at the database
- `pg_stat_statements` shows a statement with a high `total_exec_time`
- Someone says *"it was fast yesterday"* — usually a plan flip or a stale `ANALYZE`

If you're here for **schema design** instead, that lives in [[Database conventions]], not here.

## Step 0 — Confirm it's actually the query

Before touching anything, prove the database is the bottleneck. Pull the worst offenders straight from [`pg_stat_statements`](https://www.postgresql.org/docs/current/pgstatstatements.html "Postgres docs: pg_stat_statements"):

```sql
-- Top 10 statements by total time spent in them.
-- mean_exec_time tells you "is each call slow"; calls tells you "is it just frequent".
SELECT
  substring(query, 1, 80) AS query,
  calls,
  round(mean_exec_time::numeric, 2)  AS mean_ms,
  round(total_exec_time::numeric, 2) AS total_ms,
  rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

Two different problems hide in this table, and they need **opposite** fixes:

1. **High `mean_ms`, low `calls`** — a genuinely expensive query. Go to [Step 1](#step-1--read-the-plan). This is the *plan* problem.
2. **Low `mean_ms`, huge `calls`** — a fast query fired in a loop. This is an `N+1` in the application; no index will save you. Fix it in [[Anchor architecture]]'s data layer, *not* in SQL.

> **Note**: if `pg_stat_statements` isn't installed, you're flying blind. Add `shared_preload_libraries = 'pg_stat_statements'` to `postgresql.conf` and restart — it's the single highest-leverage observability change you can make.

## Step 1 — Read the plan

Always `EXPLAIN (ANALYZE, BUFFERS)`, never bare `EXPLAIN`. The bare form shows the *estimate*; you need the **actual** rows and timing, plus buffer counts to see if you're I/O bound.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT n.id, n.title
FROM notes n
JOIN tags t ON t.note_id = n.id
WHERE t.name = 'crdt'
  AND n.updated_at > now() - interval '30 days'
ORDER BY n.updated_at DESC
LIMIT 20;
```

What I actually look at, in order:

- [x] **Estimated vs actual rows** — a 100× gap means stale statistics. Run `ANALYZE notes;` and re-check.
- [x] **The widest node** — find the operator eating the most *actual* time, not the scariest-sounding one.
- [ ] **`Rows Removed by Filter`** — a big number here means you scanned a lot to throw most of it away. That's your index candidate.
- [ ] **`Buffers: shared read=…`** — high `read` (vs `hit`) means cache misses; the working set doesn't fit in `shared_buffers`.

> A `Seq Scan` is **not** automatically a bug. On a 5,000-row table it's the *correct* plan — the planner knows random I/O would cost more. Only worry about sequential scans on large tables with a selective filter.

### 1.1 — Reading a nested loop

The plan node that bites most often is the **nested loop join**. It's great when the outer side is tiny and the inner side is indexed; it's a disaster when the planner *thinks* the outer side is tiny and it isn't.

```text
Nested Loop  (cost=0.42..8120.55 rows=1 width=48) (actual rows=48210 ...)
  ->  Seq Scan on tags t  (rows=1)  (actual rows=48210 ...)   <-- estimate off by 48000x
  ->  Index Scan on notes n  ...
```

That `rows=1` estimate against `actual rows=48210` is the smoking gun: the planner picked a nested loop because it expected **one** outer row, then ran the inner scan 48,210 times. The fix is upstream — better stats or a `WHERE` that the planner can estimate — not a new index.

## Step 2 — Decide the intervention

Only now do we change something. Match the symptom to the smallest fix:

1. **Stale statistics** → `ANALYZE`, or lower `autovacuum_analyze_scale_factor` for hot tables.
2. **Missing selective index** → add it, but see the warning below.
3. **Wrong index shape** → a composite index whose column order matches the `WHERE` + `ORDER BY`.
4. **Bloat** → `VACUUM (ANALYZE)`; check `n_dead_tup` in `pg_stat_user_tables` first.

For the example query, a composite index that covers both the filter and the sort lets Postgres skip the sort entirely:

```sql
-- Column order matters: equality columns first, then the range/sort column.
CREATE INDEX CONCURRENTLY idx_tags_name_note
  ON tags (name, note_id);

-- Supports both the updated_at filter AND the ORDER BY ... DESC LIMIT.
CREATE INDEX CONCURRENTLY idx_notes_updated_at
  ON notes (updated_at DESC);
```

> **Warning**: always `CREATE INDEX CONCURRENTLY` in production. The plain form takes an `ACCESS EXCLUSIVE` lock and **blocks every write** to the table until it finishes. I have taken an outage this exact way; it is now the first rule in [[On-call journal]]. #postgres/footgun

## Step 3 — Verify, don't assume

An index that exists is not an index that's *used*. Re-run the **same** `EXPLAIN (ANALYZE, BUFFERS)` and confirm the plan actually changed:

```bash
# Capture before/after plans so the PR reviewer can see the win, not just trust it.
psql "$DATABASE_URL" -f explain_before.sql > before.txt
# ... apply the migration ...
psql "$DATABASE_URL" -f explain_after.sql  > after.txt
diff -u before.txt after.txt
```

A healthy result reads like this — the `Seq Scan` became an `Index Scan`, and the node-level *actual time* dropped by an order of magnitude:

- **Before**: `Seq Scan on tags` → `Rows Removed by Filter: 1.2M`, 840 ms
- **After**: `Index Scan using idx_tags_name_note` → 6 ms

If the plan **didn't** change, the usual culprits are:

- A function wrapping the column (`lower(name) = 'crdt'` won't use an index on `name` — you need an expression index on `lower(name)`).
- An implicit type cast (`note_id = '42'` where `note_id` is `bigint`).
- The table is small enough that a seq scan genuinely *is* cheaper — in which case, **stop**, you've already won.

## Appendix — pocket reference

The catalog views I never remember and always end up grepping for:

- **Currently running queries** → `pg_stat_activity`
- **Per-statement timing** → `pg_stat_statements`
- **Dead tuples / bloat signal** → `pg_stat_user_tables` (watch `n_dead_tup`)
- **Index usage counts** → `pg_stat_user_indexes` (an index with `idx_scan = 0` is dead weight)

Kill a query that's wedging a deploy (get the `pid` from `pg_stat_activity` first):

```sql
-- cancel is polite (lets the statement clean up); terminate is the hammer.
SELECT pg_cancel_backend(pid)    FROM pg_stat_activity WHERE pid = 48127;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = 48127;  -- last resort
```

A connection-pool config that has saved me more than any single index, in [PgBouncer](https://www.pgbouncer.org) terms:

```ini
[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20      ; the database has far fewer cores than this; let the pool queue
```

### Hand-off checklist

Before I close an incident and hand the thread back to [[On-call journal]]:

- [x] Root-caused the plan, not just the symptom
- [x] Migration shipped with `CONCURRENTLY` and a before/after plan in the PR
- [ ] Added the query to a `pg_stat_statements` dashboard so a regression pages us
- [ ] Wrote the one-paragraph *what we learned* into the incident doc

> Closing principle, the same one this note opened with: **measure, change one thing, measure again.** Everything else is folklore. #performance/golden-rule
