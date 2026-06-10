# Anchor — Workbench Ledger（CP-1/CP-2/Stage-2 readiness）

任务：Anchor workbench 唯一进度 ledger（rewrite-in-place state block §1–§7 + append-only iteration history §8）
日期：2026-06-10
状态：**workbench ledger —— 非公开接口契约**。gate 状态只在本文件记录；cursor 在 `00` §0；决策/批准只在 `05`（D01–D39）。

> **边界声明（AGENTS 工作台规则，强制）：** 本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / 代码改动；不改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置，不创建产品 app shell / entitlement / bundle id / iCloud container。权威接口契约在实现后归未来 `anchor-core` 包 README，本文件仅记录 Stage 1 实测证据与 CP-1 gate 状态。

本文件整合 core spike 证据（Claude / core owner）与 Apple verifier Stage 1 实测（Codex），并作为全工作台进度 ledger。它取代分散的逐次迭代记录。**Consolidated evidence pointers：** `09-apple-verification.md`（Apple 现实核验 + integration state）、`17-apple-binding-evidence.md`（binding）、`18-textkit-adapter-evidence.md`（TextKit/UIKit）、`19-icloud-drive-evidence.md`（iCloud Drive）、`20-cross-target-ci-evidence.md`（cross-target 执行 / CI）。决策契约：`04-contract-baseline.md` / `05-key-decisions.md`（D01–D39）/ `06-fixture-set.md`（F01–F43）/ `10-cp-0-approval.md` / `11-cp-0-final.md`。逐迭代原始 reruns 已 consolidate 进 `09`/`17`/`18`/`19`/`20`；core CP-2 迭代已并入 `23`；Stage-2 ground floor 终态 = `24`；CP-1 exit assembly = `22`。

---

## 1. 结论（当前状态）

**全部 Claude/core-executable 工作已收口：CP-1 core side complete，CP-2 core 已落地（`23`），Stage-2 ground floor 全关（`24`，终态 145 tests）；非 Apple whole-exit 已由用户签字（D39，2026-06-10）；剩余 open gate 全部为 Apple 类；无 axis 被 blocked。** World A 多目标编译 gate、client 零真理逻辑红线、core/cli 零云符号边界均通过。binding（组 2）= B4 产品边界已批准（release-distribution-gated）；TextKit（组 3）机制面通过（产品 runtime 集成未跑）；iCloud Drive（组 4）= **approved default transport WITH compromise constraints**（B14）。CP-1 / CP-2 / Stage-2 的**形式** whole-exit 仍 gated on 同一条 Apple 链：Apple operator round + release distribution + product app 集成（§7）。Stop condition 全部未触发（§4）。

---

## 2. Verified ground truth（Stage-1 时点快照，Observed）

Stage-1 时点（CP-2 / Stage-2 之前）的实测快照；**终态 command + output（145 tests、audit 范围含 `cli`、`members=["core","cli"]`）的 home 是 `24` §3**，此处不复述。Repo-local Apple addition 限于 verifier-only 工程；root workspace、lockfile、core、product app target 均未改。命令为可复跑红线。

| 命令 | 观察 |
|---|---|
| `git diff --check` | clean |
| `bun install --dry-run --frozen-lockfile --ignore-scripts` | passed；Bun 未把 `suites/anchor/apple` 拉入 workspaces |
| `find suites/anchor -name package.json -print` | 0 results（Option A 纪律：`members=["core"]`） |
| `cargo test --manifest-path suites/anchor/Cargo.toml` | **77 passed; 0 failed; 1 ignored**（`scale_bench::replay_cost_curve`，默认门控；Stage-1 起点为 74，core 迭代后升至 77） |
| `cargo clippy --manifest-path suites/anchor/Cargo.toml --all-targets -- -D warnings` | `Finished`（clean） |
| `cargo build … --target wasm32-unknown-unknown` | `Finished` |
| `cargo build … --target aarch64-linux-android` | `Finished` |
| `rg "CloudKit\|CKRecord\|CKAsset\|CKContainer\|CKSyncEngine\|NSFileCoordinator\|NSMetadataQuery\|ubiquit\|iCloud\|NSURLIsExcludedFromBackupKey" suites/anchor/core` | **0 matches, exit 1** → 可直接作 CI 红线 |
| `rg "diff3\|order-key\|merge\|normaliz\|op-creation\|tree-invariant\|blake3" suites/anchor/apple` | **0 matches** → Swift 侧零确定性语义 |

跨 FFI 真值一致：fixture `snapshot_revision 3ef88671…a877b63` 在两侧 Swift smoke、physical-device async smoke 与 core `determinism_vectors` 逐字节一致。benchmark report-Observed：C ABI 64MB ≈38.22ms / 96MB RSS；UniFFI 64MB ≈145.22ms / 267MB RSS（3.8× 慢 / 2.8× RSS）；million-op replay ≈2.1µs/op（1.25M ops ≈2.6s，release `--ignored`）。

---

## 3. Readiness matrix（AUTHORITATIVE state block，按 axis）

| Axis | Verdict | 依据 |
|---|---|---|
| **core deterministic（组 1+5）** | **go** | 终态 **145/0 测试 + 2 ignored**（corpus、scale_bench 按设计；`24` §3。Stage-1 时点 77，见 §2）、clippy clean、`no_std`+`alloc`+`forbid(unsafe_code)`+零外部依赖、`BTreeMap`/`BTreeSet`（无迭代序不确定）、diff3/order-key/merge/BLAKE3 为 core 内唯一 vendored 实现；`mirror_parity`（structured search == ripgrep(md)、mirror 写失败隔离、body 冲突 git fence）通过。Core side complete。 |
| **CP-2 dispatch / op-shape（core）** | **go（core landed；formal freeze 签字已授 D39）** | 单一已校验 dispatch chokepoint（chokegrep 恰 2 个 appender：`Session::commit` + `IngestState::ingest`）、all-or-nothing structural macros、`split_merge_structural` 冲突物化、D24 op-shape full-envelope freeze golden `18582d53…`（三轮未漂移）、native+wasm 跨目标执行。见 `23`。 |
| **Stage-2 ground floor** | **go（全部 closed）** | codec（严格 canonical）、Markdown importer + parity + 330-file 语料浸泡、`Renormalize` + F26c CAS 坍缩、确定性 split/merge intent-rebase、editor-core 完整意图面 + F21 选择阶梯、resolve 产线（`supersedes_rev` 首次消费）、`anchor` CLI（D31 Phase-2）；权威契约 = `suites/anchor/core/README.md` + `suites/anchor/cli/README.md`。见 `24` §2。 |
| **multi-target compile（D36）** | **go** | `wasm32-unknown-unknown` + `aarch64-linux-android` 编译 gate 通过（CLI 为 std host bin，跨目标保证属 core）；零依赖使 gate by construction 不可被 transitive crate 打破。 |
| **zero-cloud-symbol boundary** | **go** | core+cli 云/文件协调/ubiquity/account token grep = 0 matches, exit 1（终态范围含 `cli`，`24` §3）；core 内唯一 Apple 命中是 `src/lib.rs` 描述性边界注释，无 import/使用。`OpSyncPort` 仅 `SegmentId`/`BlobId` + `&[u8]`，`associated type Error` 让 adapter 用自有 typed error。 |
| **binding B4（组 2，A2/B4）** | **approved / release-distribution-gated** | 用户 2026-06-07 批准产品边界 `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`（C ABI 为**保留**项，非 fallback-only，由 64MB benchmark 3.8×/2.8× 支撑）。typed `ValidationError` enum 已落 core DTO + C ABI + UniFFI；synchronous + async generated Swift 通过 `-swift-version 6 -strict-concurrency=complete -warnings-as-errors`；三 slice XCFramework + SwiftPM checksum wrapper；physical-device generated-async runtime 与 development-signed verifier app-bundle/device runtime 已观察（exit `0`）。**Open：** Developer ID / App Store distribution、product app 集成。 |
| **TextKit（组 3，D18）** | **compromise（mechanism-go）** | 机制面可行且边界干净（Swift 零确定性语义、buffer 非真理）；macOS AppKit + iOS UIKit 的 selection/marked-text/keyboard-intent/menu/undo-suppression/view-lifecycle/accessibility mechanism floor 已观察；probe-level insert + structural split/merge intent → real `anchor-core` dispatch bridge 已观察；core-sourced `EditorPatch` projection + core-owned undo-group/undo-replay lower bound 已观察。**Open：** 产品 app-hosted UI runtime、`NSUndoManager` grouping/redo、VoiceOver、moving-view replace replay、concurrent intent rebase。 |
| **iCloud B14（组 4）** | **approved default transport / compromise constraints** | 用户 2026-06-07 批准 iCloud Drive 作首期 default transport。signed macOS app + repo-local Xcode-created verifier 通过 ubiquity/package/coordinator/direct-enumeration/build-signing gates；package-internal `.seg` 发现**不依赖** `NSMetadataQuery`（direct enumeration）。manifest conflict floor = surface/preserve/block/no-auto-resolve，explicit current-winner resolution mechanism 已观察。physical iPhone CloudDocuments container + file-coordinated segment write/read mechanism floor 已观察。**Open：** remote `.icloud` placeholder、signed-out/over-quota、product resolver UX/core integration、steady-state budget、non-macOS large-scale delivery。 |
| **layout / retention（D02/D14/D38）** | **compromise** | Option A 纪律守住，`bun install --dry-run` passed；四-horizon retention 模型内部一致，core `retention`(7) + `segment_budget`(3) 通过，1M-op steady-state segment-budget file-count floor 已观察。**Open：** iCloud-语境 steady-state budget、stale-peer watermark advance、产品 conflict policy。 |
| **cross-target execution** | **partially-run** | native + wasm（Node WebAssembly）+ iOS Simulator slice + hosted Android emulator golden-vector execution 均已观察通过（`anchor_*_vector_status=0`，6 determinism vectors）；repo-local runner 持久化。**Note：** 当期 hosted GitHub workflow 已移除（成本），历史执行证据保留；persistent repo-enforced CI wiring 未重建。 |

> **Verdict 语义：** go = 证据足以进 CP-1 当前基线；approved / *-gated = 产品边界已批准但仍有 delivery gate；compromise = 机制/core 面通过但仍有明确 open gate；partially-run = 部分目标已执行、其余未持久化；blocked / no-go = 无（本轮未出现）。

---

## 4. Stop-condition check（本轮）

| Stop condition | 触发 |
|---|---|
| 改 root workspace / package / lockfile（或加 placeholder `package.json`） | 否（`members = ["core", "cli"]` 为 round-3 用户授权的显式覆盖（D39）；Bun workspace / root 配置 / root lockfile 未动，`24` §4） |
| Swift/TextKit 复制 core 确定性语义 | 否（`apple/` 零确定性语义 grep = 0 matches） |
| 绕过 B14 compromise constraints 发布 iCloud transport（package-internal `NSMetadataQuery` / 静默处理 unresolved conflict / 绕过 placeholder/account gates） | 否（transport approved；delivery gates preserved） |
| iCloud-Drive 路径引入 CloudKit schema / CKSyncEngine | 否 |
| 公开 CLI schema 变更 | 否 |
| Apple probe 变产品 app shell | 否（verifier-only 工程；无产品 app target） |
| `anchor-core` 泄漏 Apple 云/文件协调/account/ubiquity 类型 | 否（0 matches, exit 1） |
| scale 出现 N logical op → ~N synced segment（使 batching/compaction 失效） | 否（macOS direct enumeration 到 100K，未观察 N→~N） |

**全部未触发。**

---

## 5. Approved decision baseline + clean boundary（当前）

- **非 Apple whole-exit（D39 approved，2026-06-10）：** CP-1 非 Apple 签字 / CP-2 formal freeze 授权 / Stage-2 ground floor whole-exit / CLI（D31 Phase-2）/ editor-core 完整意图面；批准原文 home = `05` D39。剩余 open = Apple 类（§7）。
- **Binding（B4 approved，2026-06-07）：** `UniFFI DTO / ordinary dispatch + C ABI bytes fast path`（非 pure-UniFFI bulk bytes）。Swift 侧零确定性语义；时钟/熵（`op_id` / HLC）由 Swift 传入 core，core 永不自取（D36）。
- **iCloud adapter 形状：** `NSMetadataQuery` 发现 vault/package；`NSFileCoordinator` 保护读写；package-internal segment 用 **file-coordinated direct enumeration**（**不**用 `NSMetadataQuery` 枚举 package internals）；manifest 默认 per-device immutable cursor；冲突 surface/preserve/block/no-auto-resolve。
- **边界：** core 永不出现云/文件协调/account 类型；Swift/TextKit 不实现 merge/normalization/op-creation/tree-invariant/diff3/order-key；Option A `suites/anchor/*` 为已批准 spike 位置；`apple/ffi`（staticlib）与 `apple/uniffi`（staticlib+cdylib）是 **非 member** wrapper crate（显式 `--manifest-path` 构建），故不破坏 core 红线与 multi-target gate。
- **核验环境：** macOS + Xcode 26.5、Swift 6.3.2、rustc/cargo 1.95.0；`aarch64-apple-darwin` target 已装；付费 ADP team（Team ID `<TEAM_ID>`，developer `<DEVELOPER_NAME>`）+ signed macOS verifier app + 真实 iCloud account；构建产物落 repo 外（`/tmp/anchor-apple-stage1`）；签名身份 hash `<SIGNING_HASH>`；profile UUID `<PROFILE_UUID>`；home paths `<HOME>/...`；bundle id `<BUNDLE_ID>`；container `<ICLOUD_CONTAINER>`。

---

## 6. Closed-gate ledger（deduplicated；one row per closed gate）

每条 gate 仅记一次，指向其权威 evidence 文档（逐迭代原始 reruns 已 dedupe）。所有列为 **closed / observed** 的 gate 均为机制下限或 verifier-runtime 证据，**不**蕴含 CP-1 whole-exit 或 release distribution。

| 已关闭 gate | Evidence doc |
|---|---|
| repo-local signed macOS iCloud verifier 复跑可重现 | `19` |
| macOS 10K direct package-internal enumeration | `19` |
| Xcode-managed iOS Simulator build/install/launch chain | `19` |
| native + wasm（Node WASM）+ iOS Simulator slice golden-vector execution | `20` |
| repo-local 持久化 cross-target runner（native/wasm/iOS-sim） | `20` |
| iCloud conflict surfacing / preservation / blocking floor + duplicate-manifest detection | `19` |
| macOS TextKit IME marked-text / hit-testing / controlled direct-buffer undo suppression floor + iOS-sim compile | `18` |
| Swift wrapper actor async surface + DTO/error `Sendable` floor + macOS release strict-concurrency runtime | `17` |
| repo-external SwiftPM path-dependency import（external consumer release strict run） | `17` |
| raw C ABI binary-target import（external binary consumer release strict run） | `17` |
| Linux native+wasm 与 macOS iOS-sim vector job workflow config + local skip/full runner validation | `20` |
| physical iPhone build/install/entitlement chain | `19`, `18` |
| macOS placeholder failure-shape + package-internal start-download negative evidence | `19` |
| final production DTO/error vocabulary + core-vs-adapter error boundary + Swift structured-error decode | `17` |
| product wrapper binary-package mechanism floor（Swift over binary target release strict run） | `17` |
| UniFFI generated-async source gen + macOS strict-concurrency async runtime + iOS-sim compile/link | `17` |
| SwiftPM binary-artifact checksum mechanism + wrapper-compatible XCFramework zip shape | `17` |
| explicit destructive/user-resolution exec mechanism + branch archival + duplicate-manifest live cleanup + post-refresh clean state | `19` |
| iPhoneOS generated-async standalone `arm64` compile/link（prior `arm64e` mismatch = wrong target selection） | `17` |
| hosted Linux native+wasm + hosted macOS native+wasm+iOS-sim vector execution | `20` |
| hosted/fresh-runner binding-package reproduction（C ABI wrapper binary package + UniFFI async smokes） | `17` |
| artifact provenance/signing/notarization **policy floor** + verifier artifact provenance manifest shape | `17` |
| local-only path classifier floor（normal / direct iCloud / symlink↔iCloud / backup-exclusion readback） | `19` |
| macOS accessibility selected-range readback floor | `18` |
| adapter view-model projection patch replay（insert/move/remove text surfaces） | `18` |
| macOS AppKit `keyDown` capture → split/merge-backward intents | `18` |
| real AppKit `NSView`/`NSTextView` insert/move/remove lifecycle floor | `18`* |
| macOS AppKit first-responder keyboard routing across two text surfaces | `18` |
| macOS AppKit accessibility hierarchy across two text surfaces | `18` |
| macOS AppKit selector / menu-item sender routing → split/merge-backward floor | `18` |
| macOS AppKit responder-chain `undo:` suppression → adapter-owned semantic undo | `18` |
| macOS AppKit split/scroll focus lifecycle across two text surfaces | `18` |
| iOS-sim `UITextView` runtime floor（UTF-16 selection / marked-text commit / `UIKeyInput` intent / scroll-hosted identity+a11y） | `18` |
| iOS-sim UIKit `UIScrollView`/`UITextView` insert/move/remove lifecycle replay floor | `18` |
| iOS-sim UIKit `UIKeyCommand` target-action routing → split/merge-backward floor | `18` |
| iOS-sim UIKit responder target-action undo → adapter-owned grouped semantic undo floor | `18` |
| Android runner branch + hosted Android emulator workflow config | `20` |
| hosted Android emulator execution（cross-target execution machine gate） | `20` |
| probe-level TextKit adapter insert intent → real `anchor-core` dispatch bridge | `18` |
| no-container account-state classifier floor（`blocked_no_ubiquity_container`） | `19` |
| 1M-op steady-state segment-budget file-count floor（default budget） | `19` |
| probe-level structural split/merge-backward intents → real `anchor-core` dispatch typed-deferral bridge | `18` |
| physical iPhone CloudDocuments container + file-coordinated segment write/read floor | `19` |
| physical-device generated-async runtime + development-signed verifier app-bundle/device runtime integration（exit `0`） | `17` |
| current-period hosted Android/WASM workflow removed（cost；historical execution evidence retained） | `20` |
| core split/merge-backward dispatch lower bound + Swift structural-intent bridge | `23` |
| core-sourced `EditorPatch` DTO lower bound + C ABI JSON/Swift decode + TextKit projection probe | `23` |
| core-owned undo-group DTO lower bound + C ABI JSON/Swift decode + TextKit inverse projection | `23` |
| core-only undo replay lower bound（insert/split/merge-backward groups lower to committed core ops + replay state） | `23` |
| op-segment round-trippable codec（strict canonical decode；op-log file format） | `24` |
| Markdown importer + import/export parity + 330-file 本机语料浸泡 | `24` |
| `Renormalize` producer + F26c all-or-nothing CAS 坍缩 | `24` |
| 确定性 split/merge intent-rebase（保守单侧规则；floor 不变） | `24` |
| editor intent surface 扩展（`DeleteText`/`ReplaceText`/`RemoveMark`/`CreateBlock`） | `24` |
| editor-core 完整意图面（indent/outdent/exit-container/transform/insert-code-block/paste-fragment + 多块选区 `DeleteBlocks`/`MoveBlocks`） | `24` |
| F21 选择提升/降级阶梯（core 拥有；`Selection::Block`/`Embedded` 首次发射） | `24` |
| body keep-both resolution 产线（`dispatch_resolve_body`；D24 预留 `supersedes_rev` 首次消费） | `24` |
| 结构冲突启发式因果收紧（macro 下游编辑 + superseded rev 不再误报并发） | `24` |
| `anchor` CLI（D31 Phase-2，user-approved 2026-06-10）：vault segment I/O + 公开 ConflictRecord/resolve/restore 面 + 退出码契约 e2e | `24` |

\* 上表每行的 evidence pointer 指向 consolidation 后的权威证据文档（`09`/`17`/`18`/`19`/`20`；core CP-2 迭代已并入 `23`，Stage-2 ground floor 为 `24`）。原本分散的逐次 reruns（iOS-device locked rerun、device visibility-only、iOS-sim 复测、support reruns、Developer-ID signing availability 等负面/无新增证据项）不产生新的 closed gate，仅强化既有证据或记录负面 delivery 结论；其净结论已并入 §3 readiness matrix 与 §7 open gates，原始命令输出（含设备/账号细节）已在 consolidation 中按工作台规则脱敏移除。

---

## 7. Remaining work / open gates

CP-1 whole-exit gated on 以下未关闭项。所有 **closed** gate（§6）均为机制/verifier-runtime 证据，不蕴含 release / product / whole-exit。

| Open gate | 状态 | Owner | Evidence pointer |
|---|---|---|---|
| Developer ID Application / Installer / Apple Distribution identity | Blocked — no match observed locally | Needs-Apple-account（distribution identity） | `20` |
| macOS product app archive / notarization | Not run — no product archive, no Developer ID identity | Needs-Apple-runtime + product app target | `20` |
| App Store / TestFlight distribution + real upload/distribution channel | Not run — no Apple Distribution identity or upload artifact | Needs-Apple-account | `20`, `17` |
| product app binding integration（非 verifier） | Not run | Apple product owner | `17` |
| remote `.icloud` placeholder download to `Current` | Not run — macOS package-internal path returns `NSCocoaErrorDomain:4`; true remote placeholder unproved | Needs-Apple-runtime（remote ubiquity） | `19` |
| signed-out / over-quota account states | Not run — only no-container classifier floor observed | Needs-Apple-runtime | `19` |
| iOS / non-macOS CloudDocuments runtime | Blocked — iOS Simulator returns `BRCloudDocsErrorDomain:153` "iCloud Drive not supported"; physical-iPhone container observed but full delivery unproved | Needs-Apple-runtime（real iOS account） | `19` |
| product conflict-resolution UX / core integration（never silently resolve `NSFileVersion`） | Not run — policy floor only | Apple product owner | `19` |
| iCloud-context million-op replay/merge/compaction + steady-state segment budget | Not run in iCloud context — core-side linear + 1M-op floor observed only | core + Apple verifier | `19` |
| non-macOS package-level metadata gather / large-scale delivery | Not run — macOS-only gate | Needs-Apple-runtime | `19` |
| local-only path-in-ubiquity 边界（D21/D21a：external volume / security-scoped bookmark / signed-out） | Partially Blocked — classifier floor observed; signed-out/external-volume not run | Needs-Apple-runtime | `19` |
| TextKit 产品 runtime（`NSUndoManager` grouping/redo、VoiceOver/UI runtime、moving-view replace replay、mark-preserving full inverse-op contract；concurrent intent rebase 与 `split_merge_structural` materialization 的 core 侧已落地 `24`，product runtime 集成未跑） | Not run — mechanism floors only | Apple product owner | `18`/`23` |
| Swift/FFI undo-group input contract | Not run — core-only replay lower bound observed | binding owner | `23` |
| persistent repo-enforced cross-target CI wiring（incl. android in CI） | Not run — hosted workflow removed; historical execution retained; runner under `/tmp` | core / infra owner | `20` |
| **CP-1 whole-exit** | **Open — 非 Apple human sign-off 已签（D39，2026-06-10）；剩余 = Apple operator round** | Needs-Apple-runtime | D39；assembly `22` §5 |

> Claude/core 与 human-approval 可达的工作已全部收口（Stage-2 ground floor 关闭、CLI D31 Phase-2 落地、非 Apple whole-exit 签字 = D39）。下一动作唯余 Apple operator round（signed device + ADP + 真实 iCloud + product app 集成 + distribution identity），或在恢复 hosted CI 时重建 persistent cross-target wiring（须不触 root workspace / lockfile / package-boundary）。Cursor home = `00` §0。

---

## 8. Iteration history（append-only；一行一轮）

> 2026-06-10 consolidation（76→25 docs）之前的逐次迭代原始文档已折叠（原始记录在 git 历史）；该日期前的行以 consolidation 粒度重建（Inferred from consolidated docs），此后逐轮追加。

| # | 日期 | Gate / 动作 | Evidence |
|---|---|---|---|
| 0 | 2026-06-06 | CP-0 packet 起草（plan / conflict model / research / contract / decisions / fixtures / layout / verification packet） | `01`–`08` |
| 1 | 2026-06-07 | CP-0 批准（user sign-off，A1–A9 / B1–B16）+ Stage-1 entry | `09`–`13` |
| 2 | 2026-06-07 | CP-1 core spike（74→77 tests、multi-target compile、零云符号红线） | `14` / `15` / `16` |
| 3 | 2026-06-07 → 06-10 | Apple verifier rounds（binding / TextKit / iCloud / cross-target；逐次 reruns 已 dedupe 进 §6） | `17` / `18` / `19` / `20` |
| 4 | 2026-06-10 | Workbench consolidation 76→25 + 全量 PII scrub | 全目录（git 历史） |
| 5 | 2026-06-10 | CP-2 core（dispatch chokepoint、structural macros、D24 freeze golden、native+wasm 执行；77→85 tests） | `23` |
| 6 | 2026-06-10 | Stage-2 round 1（公开契约 `core/README.md` + reference `MemoryOpSyncPort`） | `24` |
| 7 | 2026-06-10 | Stage-2 round 2（codec / importer+语料浸泡 / renormalize+F26c / intent-rebase / +4 intents；→120 tests；D39 round-2 授权） | `24` |
| 8 | 2026-06-10 | Stage-2 round 3（editor-core 全集 + F21 阶梯、`anchor` CLI（D31 Phase-2）、resolve 产线；→145 tests；D39 round-3 授权 + 非 Apple whole-exit 签字；round-2/3 报告 `25`/`26` 并入 `24` 后删除） | `24` / `22` §5 / `23` |
| 9 | 2026-06-10 | Workbench 整理（spec conformance pass）：本文件终态化为 ledger（state block + §8 history）、D39 入决策表 `05`、driver `00` cursor 置顶并去重 | `25` |
