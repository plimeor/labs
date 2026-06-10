# Anchor Stage 1 — iCloud Drive Delivery Consolidated Evidence

任务：把 CP-1 iCloud Drive delivery gate 的全部 workbench 证据（adapter shape、signed runtime facts、conflict / account-state / segment-budget floors、physical-device / simulator reruns）合并、去标识、去重为单一权威记录。
日期：2026-06-10
状态：**workbench evidence（consolidated）—— 非公开接口契约**

> 边界声明（AGENTS 工作台规则，强制）：本文件**不授权**任何 package / workspace / 产品 app / 生成 lockfile / public CLI schema / core 代码改动；权威接口契约属于未来的 `anchor-core` README，本文件只是证据归档。本文件替代并去重了多份分散的 iCloud workbench 报告（原 19/23/26/32/33/37/39/42/45/46/60/64/65/67/69）。

---

## 1. Verdict

**iCloud Drive = approved default transport（B14，2026-06-07）WITH compromise constraints。它从未被 blocked，但被 gated：default-transport 批准依赖固定 adapter shape，并保留若干 OPEN gate 直到真实 remote / account / iOS / product-integration 证据补齐。**

固定 adapter shape（B14 批准前提，违反即不批准）：

1. `NSMetadataQuery` 只用于发现 vault **PACKAGES**（`.anchorvault`）本身，不用于发现 package 内部 segment 文件。
2. `NSFileCoordinator` 守护所有 segment / manifest 的 read / write。
3. Adapter **直接枚举** package 内部 segment 文件，因为 `NSMetadataQuery` 在每个测试规模（1K / 10K / 50K / 100K）下对 `.anchorvault` package 内部 `.seg` 文件都返回 **0**，而 direct enumeration 很便宜（100K 约 270–300ms）。

任何把 per-segment delivery 建立在 `NSMetadataQuery` package-internal discovery 或 `isUbiquitousItem` / `startDownloadingUbiquitousItem` 对 package 内部文件成功之上的 adapter，都**不**符合本批准。

---

## 2. Sanitization legend

本文件用中性占位符替换了所有真实身份/路径 token；以下技术事实保留为证据（非 PII）：golden hash（`snapshot 3ef88671…`、segment ids、字节数）、tool 版本、UTF-16 fixture 计数、error domain code（`NSCocoaErrorDomain:4` 等）、test 计数。

| 占位符 | 含义 |
|---|---|
| `<TEAM_ID>` | Apple Team ID |
| `<DEVELOPER_NAME>` | signing developer 名称 |
| `<DEVICE>` | iPhone / Mac mini 设备名 |
| `<DEVICE_MODEL>` | identity-context 设备型号 |
| `<DEVICE_UDID>` | device UDID（Xcode destination id 形式） |
| `<DEVICE_ID>` | CoreDevice / simulator UUID |
| `<PROFILE_UUID>` | provisioning profile UUID |
| `<SIGNING_HASH>` | codesign SHA-1 |
| `<HOME>` | 用户 home 路径前缀 |
| `<BUNDLE_ID>` / `<ICLOUD_CONTAINER>` | bundle id / iCloud container |
| `<REPO>` / `<PR>` / `<CI_RUN>` | repo / PR / CI run 标识 |

下文用 `<BUNDLE_ID>` 指代 probe app（iOS verifier 与 macOS verifier 各自的 bundle id），用 `<ICLOUD_CONTAINER>` 指代共享 ubiquity container（磁盘形式为 `Mobile Documents/<ICLOUD_CONTAINER>`）。vault UTType 记为 `<BUNDLE_ID>.anchor.vault`（产品 vault 类型标识，conform `com.apple.package`）。

---

## 3. Verifier surface（不变量）

| 项 | 值 |
|---|---|
| Tooling | Xcode 26.5, Swift 6.3.2, rustc 1.95.0 |
| macOS signed verifier | repo-local Xcode-created `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj`（macOS only, `SUPPORTED_PLATFORMS = macosx`） |
| iOS / multi-device probe | repo-external `<HOME>/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj` |
| Spike compile surface | `suites/anchor/apple/AnchorAppleSpike/**`（`AnchorICloudDriveProbe`, `AnchorAppleSmoke`） |
| Signing identity | `Apple Development: <DEVELOPER_NAME> (<TEAM_ID>)` |
| macOS profile | `Mac Team Provisioning Profile: <BUNDLE_ID>`（`<PROFILE_UUID>`） |
| iOS profile | `iOS Team Provisioning Profile: <BUNDLE_ID>`（`<PROFILE_UUID>`） |
| Entitlement 输入 | command-line build settings：`CODE_SIGN_ENTITLEMENTS=AnchorMacProbe.entitlements INFOPLIST_FILE=AnchorMacProbeInfo.plist GENERATE_INFOPLIST_FILE=NO` |
| iCloud 服务 | CloudDocuments only；CloudKit/CKSyncEngine **未引入** |
| Build outputs | `/tmp/anchor-apple-stage1/**` |

Adapter 仅在 Swift 层引用 iCloud API：`FileManager.url(forUbiquityContainerIdentifier:)`、`NSMetadataQuery`、`NSFileCoordinator`、`FileManager.startDownloadingUbiquitousItem(at:)`/`evictUbiquitousItem(at:)`、`NSFileVersion.unresolvedConflictVersionsOfItem(at:)`、`UTType(..., conformingTo: .package)`。

**Core 边界保持纯净。** 在 `suites/anchor/core` 上对 `CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey` 的审计每轮均返回 **0 matches（exit 1）**。Core 只 traffic `SegmentId` / `BlobId` + bytes（`sync_port.rs` / `dto.rs` / `lib.rs` 边界注释）。Apple 侧对 `diff3|order-key|merge|canonical|BLAKE3|normalize` 等 deterministic-core 语义的审计也返回 0 matches；`snapshot_revision` 只作为 transported core 字段名出现，不算 Swift 侧语义实现。

---

## 4. Signed macOS facts（B14 主证据路径，Observed）

来自 repo-local Xcode-created signed macOS verifier 与 repo-external macOS app 的稳定 runtime 事实：

- explicit + implicit ubiquity container lookup 均**非 nil**（`<HOME>/Library/Mobile Documents/<ICLOUD_CONTAINER>`）。
- `.anchorvault` 目录声明为 `<BUNDLE_ID>.anchor.vault`，conform 到 `com.apple.package`，并被报告为 ubiquitous（`vault_is_ubiquitous=true`）。
- `NSFileCoordinator` coordinated write/read 通过：coordinated segment 30 bytes，`coordinated_segment_equal=true`。
- **`NSMetadataQuery` 能发现 package 本身**：`package_metadata_count=1`。
- **`NSMetadataQuery` 不能枚举 package 内部 `.seg`**：每个 scale 均 `metadata_seg_count=0`。
- `NSMetadataQuery` 能枚举 package **外部** `.seg`：128 文件观测到 125（live-update 窗口后）。
- **loose vs package-internal placeholder/download divergence**（见 §5 表）。

签名/分发诊断（非 runtime blocker）：loose 标准可执行文件即使 codesign 通过也被 AMFI 拒绝（`Restricted entitlements not validated ... No matching profile found`）——restricted iCloud entitlement 必须有匹配 provisioning profile；`spctl` 把 Apple Development 签名判为 rejected，属 Gatekeeper distribution 评估，不是 debug runtime blocker。"Designed for iPad/iPhone" 路径被阻止，因为 `<DEVICE>`（Mac mini，`<DEVICE_UDID>`）未注册到开发者账号——provisioning 前提问题，非 core/adapter 代码问题。

---

## 5. Placeholder / download divergence（Observed，macOS signed verifier）

loose iCloud 文件与 package 内部 segment 的 ubiquitous/download 状态不同。这是固定 adapter shape 的核心硬约束之一：

| Path | `isUbiquitousItem` | download status | evict | start download | coordinated read |
|---|---|---|---|---|---|
| loose `external.anchorseg` | true | `Current` | `NSCocoaErrorDomain:512` | nil（成功） | 29 bytes |
| package-internal `Vault.anchorvault/segments/000001.anchorseg` | false | nil | `NSCocoaErrorDomain:4` | `NSCocoaErrorDomain:4` | 28 bytes |

结论：新写入的 package 内部 segment 在 macOS 上**不是** `isUbiquitousItem`，download status 为 `nil`，`evictUbiquitousItem` 与 `startDownloadingUbiquitousItem` 都返回 `NSCocoaErrorDomain:4`，但仍可经 coordinated read 读到 bytes。iOS 物理设备对类比 segment 也报告 `segment_is_ubiquitous=false` / `start_download_error=NSCocoaErrorDomain:4`（见 §8）。loose file 对其执行 evict 返回 `NSCocoaErrorDomain:512`，未形成可观察的 non-current placeholder。因此 per-file resource-value 行为是 platform-sensitive 的，且 remote `.icloud` placeholder download **未被证明**——本机 already-current 文件不能算作成功的 remote download。

---

## 6. Scale evidence（Observed，signed macOS direct enumeration）

`NSMetadataQuery` package-internal discovery 在每个 scale 都失败（`metadata_seg_count=0`），但 direct enumeration 廉价且可用：

| Scale | write_ms | direct count | direct enum_ms | metadata seg count |
|---|---|---|---|---|
| 124（默认 1M-op budget 对应值，见 §9） | 72.58 | 124 | 0.61 | 0 |
| 1K | 377.70 | 1024 | 2.41 | 0 |
| 10K | 3634.66 | 10000 | 22.53 | 0 |
| 50K | 18455.09 | 50000 | 124.70 | 0 |
| 100K | 38509.85 | 100000 | 269.50 | 0 |

解读：100K 文件在 writes 完成后约 270–300ms 内枚举完毕；per-file direct write 在此 probe 中线性（约 0.36s/1K）。`NSMetadataQuery` 在 1K/10K/50K/100K 全部返回 0 package-internal `.seg`，所以 direct-enumeration 约束不变。这**不**证明 remote placeholder、non-macOS large-scale、over-quota/signed-out 或 product steady-state budget。

（早期 standalone macOS scale 运行因写入路径不同时间更长：10K=33759ms、50K=172355ms、100K=337324ms；direct enum 仍为 27.70/142.63/299.51ms，metadata 仍 0。结论一致。）

---

## 7. Conflict evidence（Observed，multi-device + policy/resolution floors）

### 7.1 Online concurrent（converge，no unresolved）
两设备经同一 ubiquity container 写入（iOS `/private/var/mobile/Library/Mobile Documents/<ICLOUD_CONTAINER>`，macOS `<HOME>/Library/Mobile Documents/<ICLOUD_CONTAINER>`）。coordinated 80 iters 与 raw 120 iters 两轮均在 settle 后收敛，`NSFileVersion.unresolvedConflictVersionsOfItem(at:)` 返回 **0**。这只证明 online same-account case 未产生 unresolved 冲突，不证明冲突处理不必要。

### 7.2 Offline fork（materialize unresolved，**load-bearing**）
baseline 两设备先收敛 `writer=mac-base`；iPhone 离线后 iOS 读回 `writer=ios-offline`、macOS 读回 `writer=mac-online`（reconnect 前 `conflict_versions=0`）；reconnect + 60s settle 后，iCloud 选 iOS 离线写为 current（两设备 `writer=ios-offline`），保留 macOS 写为 unresolved conflict，两设备 `conflict_versions=1`。macOS `NSFileVersion` 读出 conflict 版本内容为 `writer=mac-online`。这是**离线 NSFileVersion unresolvedConflictVersions=1 必须被 surface、不能被 drop** 的来源事实。

### 7.3 Conflict policy floor（closed）
read-only `--icloud-conflict-policy-probe`：当 unresolved `NSFileVersion` 冲突或 duplicate `manifest *.json`（观测到 `manifest 2.json`，`writer=ios-base`）任一存在，`adapter_status=blocked_manifest_conflict`，`policy_surface_conflicts=true`、`policy_preserve_versions=true`、`policy_auto_resolve=false`、`resolution_executed=false`。最低产品策略：把任一冲突信号视为 blocked；surface current + conflict-version + duplicate 三个分支；preserve 直到显式 resolution flow；不从 blocked manifest 推进 frontier/GC/cursor；adapter 不 auto-resolve 或删除冲突版本。D31 仍把 public `ConflictRecord`/`resolve` schema 推迟到 Phase 2。

### 7.4 Resolution mechanism floor（closed）
`--icloud-conflict-resolve-probe`（`resolution_choice=current`）：current（`ios-offline`）存为 `current-manifest.json`，conflict（`mac-online`）存为 `conflict-version-0.json`，duplicate（`ios-base`）移入 archive `duplicate-0-manifest 2.json`；`removeOtherVersionsOfItem(at:)` 返回 `nil`。**关键陷阱**：同进程 post-check 仍报 `after_conflict_versions=1`，resolver 不能假设同进程 metadata 已刷新；后续 policy probe 报 `conflict_versions=0`、`duplicate_manifest_files=0`、`adapter_status=ok_no_conflict`。机制下限：先 archive 全部分支，再删除版本/移动 duplicate，再在 coordination/metadata refresh 后复查，复查干净前不推进 manifest 派生决策。

---

## 8. Runtime-by-platform（Observed vs Not-run vs Blocked）

| 平台 / 路径 | 状态 | 关键 observed |
|---|---|---|
| macOS signed app | **Observed / closed** | container 非 nil；vault ubiquitous；coordinated r/w pass；package-internal placeholder 失败 `NSCocoaErrorDomain:4`；1K–100K direct enum pass |
| physical iPhone（<DEVICE_MODEL>, iOS 26.5） | **Observed / closed (local floor)** | `lockState`: `unlockedSinceBoot=true`；container 非 nil；vault ubiquitous；coordinated segment 28 bytes equal=true；`segment_is_ubiquitous=false`；`start_download_error=NSCocoaErrorDomain:4`；metadata seg count 0；1024-subset write 3786.20ms；`cleanup_removed=true`（手动 SIGTERM 终止，非 probe 失败） |
| iOS 26.5 Simulator | **Blocked by runtime（rejected as proof）** | build/install/launch 成功，simulated CloudDocuments entitlement 在 Mach-O `__TEXT,__entitlements` 存在，但 `explicit_nil=true`/`implicit_nil=true`/`blocked=no_ubiquity_container`；`bird` 日志 `BRCloudDocsErrorDomain:153` + `Returning error because iCloud Drive not supported`。多轮重跑（含用户确认已登录 iCloud）结论不变 |
| physical iPhone 前三轮 launch | **Blocked by operator state**（docs 32/37/42/60） | build/install/entitlement 链全绿，但 SpringBoard `BSErrorCodeDescription = Locked`；`--no-activate` 同样被拒；`available (paired)` ≠ unlocked。第四轮设备 unlock 后才执行（见上行） |

iOS Simulator 注意：outer `codesign` 打印空 entitlement dict（`<dict></dict>`），但 Mach-O `__entitlements`（size `00000396`）/`__ents_der`（size `00000201`）携带 simulated entitlement，所以失败应归类为 runtime support 失败，非 "无 entitlement 证据"。XcodeBuildMCP `list_sims`/`build_run_sim` 因工具环境找不到 `simctl` 而失败，属 tool-environment friction，非工程失败；改用显式 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` shell 调用。

---

## 9. Account-state / segment-budget / local-only floors（Observed）

### 9.1 Account-state classifier floor（closed）
`AnchorAppleSpike` 纯分类器：explicit 与 implicit ubiquity URL 同时 nil → `blocked_no_ubiquity_container`。SwiftPM smoke、Xcode Release strict build（`-strict-concurrency=complete -warnings-as-errors`）、Release 可执行、iOS Simulator compile 全绿，输出 `icloud:account_state_classifier=blocked_no_ubiquity_container explicit=false implicit=false`；smoke 同时打印 golden `snapshot 3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63`、`segment:bytes=979`。证明 adapter 有不会静默继续 sync 的 no-container blocking branch；**不**证明真实 signed-out / over-quota runtime。

### 9.2 Segment-budget floor（closed，N ops ≠ ~N segments）
Core `segment_budget` gate（3 tests pass，默认 `ops_per_segment=512`、`compaction_fold=16`）：1,000,000 logical ops 的 steady-state file budget = **124** synced segment files（`sealed=ceil(1_000_000/512)=1954`；`steady_state=ceil(1954/16)+1=124`）。Release million-op replay bench（`scale_bench`，ignored）通过：1,250,000 ops replay 4486.1ms，snapshot `cd10e7610a95`。signed macOS verifier 在真实 iCloud `.anchorvault/segments` 写入并 direct-enumerate 124 个 `.anchorseg`：`direct_count=124`、`enum_ms=0.61`、`metadata_count=0`、`cleanup_ms=7.24`。证明默认 budget 对应的 iCloud file count 可写入/清点/清理且不依赖 package-internal `NSMetadataQuery`；**不**证明真实 product compaction 接入或 million-op 端到端落盘于 iCloud package。

### 9.3 Local-only path classifier floor（partial close，D21/D21a/F41）
`--icloud-local-only-path-probe` 保守分类器 `blocked_local_only_open = raw path in ubiquity container OR resolved symlink target in container OR raw isUbiquitousItem OR resolved isUbiquitousItem`：

| Case | blocked | excluded_from_backup |
|---|---|---|
| sandbox local vault | false | true |
| direct iCloud Documents vault | true | — |
| local symlink → iCloud | true | — |
| iCloud-path symlink → local | true | — |

`sync = "none"` vault 仅当 user 路径与 resolved target 都在 ubiquity container 外才允许；iCloud-visible symlink 即使指向 local target 也 blocked。允许的 local vault 设置并回读 `isExcludedFromBackup=true`。（sandboxed signed app 不能假设任意 `/tmp` 写权限：`/tmp/...` 初次尝试 `NSCocoaErrorDomain Code=513 Operation not permitted`，改用 app sandbox temp。）未覆盖：external volume、security-scoped bookmark、Finder-moved package UI、`.icloud` placeholder、signed-out/unavailable account。

---

## 10. Golden / load-bearing constants（保留为证据）

- core fixture snapshot：`snapshot 3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63`
- spike segment：`segment:bytes=979`；coordinated probe segment：28 / 30 / 38 bytes（按运行）
- million-op replay snapshots：`12500→19cfe1462bb0`、`125000→d6c029182d15`、`625000→91f4cf5dc466`、`1250000→cd10e7610a95`
- default budget：`ops_per_segment=512`、`compaction_fold=16` → 1M ops = 124 segment files
- error domains：`NSCocoaErrorDomain:4`（package-internal evict/download）、`NSCocoaErrorDomain:512`（loose evict）、`NSCocoaErrorDomain:513`（sandbox `/tmp`）、`BRCloudDocsErrorDomain:153`（simulator）
- tool 版本：Xcode 26.5 / Swift 6.3.2 / rustc 1.95.0

---

## 11. Remaining work / open gates

CP-1 **whole-exit 未达成**；以下 gate 保持 OPEN（each listed once，reruns deduped）。

| Open gate | 类型 | Owner |
|---|---|---|
| 真实 remote `.icloud` placeholder download（跨设备、非本机 already-current） | Needs-Apple-runtime | Apple/iCloud verifier |
| iOS package-internal metadata propagation / `NSMetadataQuery` gather on device | Needs-Apple-runtime | Apple/iCloud verifier |
| iOS / non-macOS end-to-end CloudDocuments delivery（超出 local container availability） | Needs-Apple-runtime | Apple/iCloud verifier |
| 真实 signed-out 账号 runtime（macOS/iOS） | Needs-Apple-runtime | Apple/iCloud verifier |
| 真实 over-quota runtime + write-failure 错误域分类 | Needs-Apple-runtime | Apple/iCloud verifier |
| iOS large-scale segment delivery（10K/50K/100K on device） | Needs-Apple-runtime | Apple/iCloud verifier |
| million-op compaction 在真实 iCloud-sync product context 端到端落盘 | Not-run / 需产品集成 | core + Apple integration |
| product compaction integration（real op-log → sealed/compacted segment files） | Not-run / 需产品集成 | core + Apple integration |
| 产品 conflict-resolution UX + core `resolve`/`restore` 语义（D31 public schema 仍 Phase 2 deferred） | Not-run / Needs-human-approval | product + core |
| destructive resolution 仅测过 `current` winner；其他 winner / scale / stale-peer 上下文 | Not-run | Apple/iCloud verifier |
| local-only path edge cases：external volume、security-scoped bookmark、Finder-moved package UI、`.icloud` placeholder path、signed-out/unavailable account path | Not-run | Apple/iCloud verifier |
| product UI/CLI 对 typed blocked / account-state / conflict 的实现 | Not-run / Needs-human-approval | product |
| Developer ID / App Store distribution signing | Not-run / Needs-human-approval | release owner |
| product TextKit/UI dispatch integration | Not-run | product + Apple |

下一有效动作：保持 macOS signed verifier 为 B14 主证据路径；iOS/non-macOS delivery 用 physical-device runtime（已可 launch）继续，**不**用 iOS 26.5 Simulator 关闭 CloudDocuments delivery，除非未来 runtime 返回非 nil ubiquity container 且无 `BRCloudDocsErrorDomain:153`。不得从本机 local physical-device floor 声称 true remote placeholder、package metadata delivery、product sync 或 CP-1 exit。
