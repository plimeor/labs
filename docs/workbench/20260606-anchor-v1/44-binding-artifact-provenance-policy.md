# Anchor Stage 1 — Binding Artifact Provenance Policy

任务：CP-1 binding release gate，冻结 Apple binding artifact 的 provenance / checksum / signing / notarization 责任边界，避免把 verifier XCFramework checksum、app signing、notarization、release upload 混成一个 gate。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮关闭 artifact provenance/signing/notarization policy floor，不关闭实际 signed app bundle、Developer ID notarization、App Store/TestFlight upload、physical-device runtime 或 CP-1 whole-exit。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建或修改 Apple project / bundle id / entitlement；没有上传、发布、签名、notarize 任何 artifact。本文只冻结 Stage 1 policy floor。

---

## 1. 结论

**Strongest conclusion：for CP-1, artifact provenance is closed as a policy floor, but actual product signing/notarization remains open.**

The release boundary is split into three non-interchangeable layers:

1. **Binding binary package provenance**：clean hosted CI run + immutable commit SHA + SwiftPM checksum + artifact manifest. This is now policy-closed for verifier artifacts by `43-hosted-binding-package-ci-report.md` and this policy.
2. **macOS app distribution trust**：signed app archive + hardened/runtime distribution settings + notarization/export path. This remains open because no product app archive exists and this machine currently exposes only Apple Development identities, not a Developer ID Application identity.
3. **iOS distribution/device trust**：Xcode signing/provisioning + device/TestFlight/App Store path. This remains open and is not notarization.

The important boundary: **do not treat a checksummed SwiftPM binary XCFramework zip as a notarized app, and do not treat a future notarized app archive as proof that the underlying binding package has reproducible provenance.** Both gates are required, but they prove different things.

---

## 2. Official reference pointers

These Apple pages were consulted as current official references. The pages are JavaScript-rendered, so this report records the official page titles and URLs rather than quoting page body text.

| Topic | Official Apple reference |
|---|---|
| Binary frameworks as Swift packages | [Distributing binary frameworks as Swift packages](https://developer.apple.com/documentation/xcode/distributing-binary-frameworks-as-swift-packages) |
| SwiftPM binary target checksum | [Target.checksum](https://developer.apple.com/documentation/PackageDescription/Target/checksum) |
| macOS notarization | [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) |
| app distribution prep | [Preparing your app for distribution](https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution/) |
| hardened runtime | [Configuring the hardened runtime](https://developer.apple.com/documentation/xcode/configuring-the-hardened-runtime) |
| CI builds for Swift packages/apps | [Building Swift packages or apps that use them in continuous integration workflows](https://developer.apple.com/documentation/xcode/building-swift-packages-or-apps-that-use-them-in-continuous-integration-workflows) |

---

## 3. Observed local tool evidence

### 3.1 SwiftPM checksum

Command:

```sh
swift package compute-checksum --help
```

Observed:

```text
OVERVIEW: Compute the checksum for a binary artifact.
USAGE: swift package compute-checksum <path>
ARGUMENTS:
  <path>                  The absolute or relative path to the binary artifact.
```

Policy consequence: the SwiftPM binary artifact gate is a checksum/provenance gate. It pins the exact binary archive consumed by package clients; it is not an app signing or notarization gate.

### 3.2 XCFramework creation

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -create-xcframework -help
```

Observed:

```text
OVERVIEW: Utility for packaging multiple build configurations of a given library or framework into a single xcframework.
USAGE:
xcodebuild -create-xcframework -framework <path> [-framework <path>...] -output <path>
xcodebuild -create-xcframework -library <path> [-headers <path>] [-library <path> [-headers <path>]...] -output <path>
```

Policy consequence: CP-1 verifier artifacts may package static libraries + headers as an XCFramework; that packaging proof remains separate from app archive signing/notarization.

### 3.3 Notary tool

Command:

```sh
xcrun notarytool --help
```

Observed:

```text
OVERVIEW: Manage submissions to the Apple notary service
SUBCOMMANDS:
  store-credentials
  submit                  Submit an archive to the Notary service
  info
  wait
  history
  log
```

Command:

```sh
xcrun notarytool submit --help
```

Observed:

```text
OVERVIEW: Submit an archive to the Notary service
USAGE: notarytool submit [<options>] <file-path>
ARGUMENTS:
  <file-path>             Path to the archive
```

Policy consequence: notarization belongs to the release/archive trust path for macOS-distributed software. A CP-1 verifier XCFramework checksum does not close notarization; notarization waits for a real macOS app/archive distribution artifact.

### 3.4 Xcode archive export / signing surface

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -help
```

Observed excerpts:

```text
xcodebuild -exportArchive -archivePath <xcarchivepath> [-exportPath <destinationpath>] -exportOptionsPlist <plistpath>
xcodebuild -exportNotarizedApp -archivePath <xcarchivepath> -exportPath <destinationpath>
-allowProvisioningUpdates
-allowProvisioningDeviceRegistration
method : String
  Available options: app-store-connect, release-testing, enterprise, debugging, developer-id, mac-application, and validation.
signingCertificate : String
  Automatic selectors include "Apple Development", "Apple Distribution", "Developer ID Application", "iOS Developer", "iOS Distribution", "Mac App Distribution", and "Mac Developer".
```

Policy consequence: app distribution trust is attached to Xcode archive/export/signing mode, not to the standalone verifier package alone.

### 3.5 Available local signing identities

Command:

```sh
security find-identity -v -p codesigning
```

Observed:

```text
1) <SIGNING_HASH> "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)"
2) EAD1B29B65C3BDFB4D8A5918CB02F6897A07601 "Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)"
2 valid identities found
```

Policy consequence: this machine can run development-signed verifier probes, but no Developer ID Application identity was observed in the local keychain. Developer ID notarization is therefore not runnable as a Stage 1 local command today, independent of user authorization.

### 3.6 Hosted provenance anchor

Command:

```sh
gh run view 27227167945 --json databaseId,headSha,url,conclusion,jobs
```

Observed:

```text
databaseId=27227167945
headSha=a54aa1fc526e6125e3be97d649fededa8e97a2ca
conclusion=success
apple-binding-package: success
ios-simulator: success
native-wasm: success
```

From `43-hosted-binding-package-ci-report.md`, hosted `apple-binding-package` produced:

```text
AnchorCoreCBinary.xcframework.zip checksum:
ae44684eed3e29e68e471125f4999405c0f4e30db61b6ecb77e1ba38e6b3abfd
```

Policy consequence: this run is the current CP-1 provenance anchor for verifier binding artifacts. A future product release must produce a new release manifest rather than inheriting this verifier manifest by implication.

---

## 4. Policy floor

### 4.1 Verifier artifact provenance

For CP-1 verifier binding artifacts, the minimum provenance record is:

| Required field | Current observed value |
|---|---|
| repo / PR | `plimeor/labs`, PR `#9` |
| workflow run | `27227167945` |
| head SHA | `a54aa1fc526e6125e3be97d649fededa8e97a2ca` |
| job | `apple-binding-package` |
| artifact path | `/tmp/anchor-apple-stage1/hosted-binding-artifacts/AnchorCoreCBinary.xcframework.zip` |
| SwiftPM checksum / SHA-256 | `ae44684eed3e29e68e471125f4999405c0f4e30db61b6ecb77e1ba38e6b3abfd` |
| wrapper truth | fixture snapshot `3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63`, `direct_active_to_deleted`, segment bytes |
| UniFFI truth | async fixture snapshot, insert, structured error, segment bytes, iOS-sim and iPhoneOS compile-link |

This closes the CP-1 provenance policy floor for verifier artifacts.

### 4.2 Release artifact policy

A future release artifact must produce a separate manifest with:

- release commit SHA and tag;
- workflow run ID and job URLs;
- Xcode / Swift / Rust versions;
- all Rust targets and Apple SDKs used;
- XCFramework zip checksums;
- generated Swift/header/modulemap checksums if they are distributed separately;
- app archive checksum if a macOS/iOS app is exported;
- signing identity class used for archive/export;
- notarization submission ID and final accepted status for macOS direct distribution;
- export method (`developer-id`, `app-store-connect`, `release-testing`, etc.);
- verification commands and observed outputs.

The manifest is a release artifact. It belongs outside CP-1 unless the user explicitly asks to productize a release channel.

### 4.3 Notarization boundary

For macOS direct distribution, notarization is a product app/archive gate. It is not closed by:

- raw Rust static libraries;
- a local verifier script;
- a SwiftPM checksum;
- a GitHub Actions success badge;
- a simulator compile/link;
- an iPhoneOS standalone Mach-O compile/link.

For iOS, the corresponding distribution gate is Xcode signing/provisioning plus TestFlight/App Store/device distribution, not notarization.

### 4.4 Stop conditions

The loop must stop if a future implementation:

- presents a checksum-only XCFramework as a notarized product;
- presents a development-signed probe as release-signed product evidence;
- claims notarization without a notary submission ID and accepted status;
- claims App Store/TestFlight readiness without an archive/export/upload path;
- treats the CP-1 verifier artifact manifest as a public release contract.

---

## 5. Gate evaluation

| Gate | Result |
|---|---|
| artifact provenance policy floor | closed / observed-supported |
| verifier binding artifact checksum provenance | closed by doc 43 + this policy |
| Developer ID signing availability | open / not observed locally |
| macOS product app archive | open / not created |
| macOS notarization submission | open / not run |
| iOS app archive / TestFlight / App Store upload | open / not run |
| real release upload/distribution channel | open / not run |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE**. The policy floor is closed; actual app signing/notarization/distribution remains release-gated and requires a product app/archive.

---

## 6. Ledger entry

### Ledger entry — 2026-06-10 — iteration 23 — doc 44-binding-artifact-provenance-policy.md

- **Checkpoint / cursor:** CP-1 Apple half, binding artifact provenance/signing/notarization policy gate.
- **Action selected:** define and evidence the artifact provenance policy floor using official Apple reference pointers, local tool help, local signing identity inventory, and the hosted binding package run.
- **Owner classification:** Apple binding release policy → executed as documentation/evidence synthesis; no signing/notarization/upload was performed.
- **Scope-fence check:** passed — no root workspace / lockfile / repo product app shell / public CLI schema changes; no Apple project / bundle / entitlement changes; no `suites/anchor/core/src/**` production source changes; no external release upload.
- **Evidence (Observed = command + output):**
  - `swift package compute-checksum --help` → checksum is for a binary artifact path.
  - `xcodebuild -create-xcframework -help` → packages libraries/frameworks into an XCFramework.
  - `xcrun notarytool --help` / `xcrun notarytool submit --help` → manages notary service submissions and submits an archive path.
  - `xcodebuild -help` → archive/export/notarized-app export and signing/export method surfaces.
  - `security find-identity -v -p codesigning` → only Apple Development identities observed; no Developer ID Application identity observed locally.
  - `gh run view 27227167945 ...` → hosted provenance anchor, success, head `a54aa1fc526e6125e3be97d649fededa8e97a2ca`.
- **Gates closed this iteration:** artifact provenance/signing/notarization policy floor; verifier artifact provenance manifest shape.
- **Gates still open:** Developer ID signing availability, macOS product app archive, macOS notarization submission, iOS app archive/TestFlight/App Store path, real release upload/distribution channel, signed app-bundle/device runtime integration, physical-device generated async runtime, physical iPhone runtime after unlock, iOS/non-macOS CloudDocuments delivery, true remote placeholder, signed-out/over-quota, steady-state segment budget/million-op iCloud context, local-only path edge cases, product conflict-resolution UX/core integration, Android execution, real app TextKit runtime.
- **Backfill to 04/05/06:** `04-contract-baseline.md` binding baseline; `05-key-decisions.md` D01.
- **Axis matrix delta:** binding remains `approved boundary / partially release-gated`; artifact provenance policy floor moved from open to closed, while actual signing/notarization/distribution remains open.
- **Gate evaluation:** CONTINUE — next action should target signed app/device runtime after unlock, remaining iCloud gates, Android execution feasibility, TextKit product-runtime gates, or product app archive only if explicitly scoped.
- **New doc:** `docs/workbench/20260606-anchor-v1/44-binding-artifact-provenance-policy.md`
