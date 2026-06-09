# Anchor Stage 1 — DTO/Error Vocabulary Report

任务：CP-1 binding release gate，冻结 core-owned `TransactionResult` / `ValidationError` vocabulary，并区分 core validation errors 与 adapter-local errors。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 final production DTO/error vocabulary gate，不关闭 UniFFI generated async surface、complete product wrapper binary package 或 fresh-machine/hosted CI gate。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 Apple product app shell。代码变更限于 `suites/anchor/core/tests/dto_surface.rs` 的 vocabulary regression test；没有改 `suites/anchor/core/src/**` production source 或 DTO implementation。

---

## 1. 结论

**Strongest conclusion：Stage-1 production DTO/error vocabulary 可以冻结为 core-owned structured `TransactionResult` envelope + exactly three core `ValidationError` codes；adapter-local `adapter_null_session` / `adapter_parse_error` 不属于 core DTO vocabulary。**

Frozen core validation codes:

| Code | Meaning |
|---|---|
| `invalid_utf16_offset` | Apple text edit produced invalid UTF-16 boundary |
| `direct_active_to_deleted` | direct active → deleted is rejected; trash first |
| `structural_dispatch_deferred` | split/merge structural dispatch is deferred to CP-2 |

Structured envelope remains:

```text
TransactionResult {
  changed_ids,
  validation_error: Option<{ code, message }>,
  new_revisions,
  selection_hint,
  conflicts,
  projection_fresh,
  mirror_fresh
}
```

This closes the vocabulary freeze gate for Stage 1. It does not freeze future product additions after a new checkpoint approval; any new core validation code changes the cross-language contract and must update tests/docs/bindings together.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` production source | not changed |
| public CLI schema | not changed |
| Apple product app shell | not created |
| DTO/error vocabulary implementation | observed, not changed |
| regression test | added one core test |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Core vocabulary regression test

Changed file:

```text
suites/anchor/core/tests/dto_surface.rs
```

The new test asserts:

- the three stable codes in order;
- their exact messages;
- `adapter_null_session` and `adapter_parse_error` are absent from core validation vocabulary.

Command:

```sh
cargo test --manifest-path suites/anchor/Cargo.toml -p anchor-core --test dto_surface
```

Observed:

```text
running 7 tests
test validation_error_vocabulary_is_frozen ... ok
test dispatch_rejects_direct_active_to_deleted ... ok
test blob_surface_for_transfer_benchmark ... ok
test fixture_summary_is_populated ... ok
test dispatch_insert_text_updates_body ... ok
test dispatch_add_tag_round_trips ... ok
test segment_bytes_surface_is_stable ... ok

test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

### 3.2 Source mapping audit

Command:

```sh
rg -n "InvalidUtf16Offset|DirectActiveToDeleted|StructuralDispatchDeferred|adapter_null_session|adapter_parse_error|adapterNullSession|adapterParseError" \
  suites/anchor/core/src/dto.rs \
  suites/anchor/core/tests/dto_surface.rs \
  suites/anchor/apple/ffi/src/lib.rs \
  suites/anchor/apple/uniffi/src/lib.rs \
  suites/anchor/apple/uniffi/src/anchor_core_uniffi.udl \
  suites/anchor/apple/AnchorAppleSpike/Sources/AnchorCoreBindings/AnchorCoreBindings.swift
```

Observed result:

- `suites/anchor/core/src/dto.rs` defines and maps only `InvalidUtf16Offset`, `DirectActiveToDeleted`, and `StructuralDispatchDeferred`;
- `suites/anchor/apple/uniffi/src/lib.rs` maps only those three core variants into UniFFI `ValidationErrorCode`;
- `suites/anchor/apple/uniffi/src/anchor_core_uniffi.udl` exposes `NoError` plus those three validation codes;
- `adapter_null_session` / `adapter_parse_error` appear only in C ABI JSON wrapper / Swift wrapper decode/session surfaces.

### 3.3 Swift wrapper smoke

Command:

```sh
ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release \
  swift run \
  --package-path suites/anchor/apple/AnchorAppleSpike \
  --scratch-path /tmp/anchor-apple-stage1/swift-build-dto-vocab-20260610 \
  AnchorAppleSmoke
```

Observed excerpt:

```text
Build of product 'AnchorAppleSmoke' complete! (22.46s)
fixture:vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
dispatch:insert changed=blk_a selection=3:3
dispatch:error validation=direct_active_to_deleted
segment:bytes=979
async:sendable summary=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 changed=blk_a segment=979
```

Interpretation: Swift wrapper still decodes the structured core validation envelope and observes `direct_active_to_deleted`. The adapter-local error cases remain wrapper implementation detail, not core vocabulary.

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| final production DTO/error vocabulary | closed for Stage 1 |
| structured error envelope | closed / observed |
| core vs adapter-local error boundary | closed / observed |
| Swift wrapper structured error decode | closed / observed |
| UniFFI generated async surface | open / not run |
| complete product wrapper binary package | open / not run |
| fresh-machine / hosted CI reproduction | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. Binding still has release gates outside vocabulary: UniFFI generated async surface, complete product wrapper binary package, and fresh-machine/hosted CI reproduction.
