# Anchor Stage 1 — Physical iPhone UniFFI Async Runtime Report

任务：CP-1 binding release gate，把 UniFFI generated async smoke 打包成 development-signed iPhone app bundle 并在 physical iPhone 上运行。
日期：2026-06-10
状态：**workbench evidence** —— 非公开接口契约。本文件关闭 physical-device generated async runtime 机制下限；不关闭 Developer ID notarization、App Store/TestFlight distribution、product app integration、release upload/distribution channel 或 CP-1 whole-exit gate。

> 边界声明（AGENTS 工作台规则）：本轮没有改 root workspace / package / lockfile / public CLI schema；没有改 repo 内 Apple project、bundle id、entitlement、iCloud container 或产品 app；没有改 `suites/anchor/core/src/**` production source。`/tmp/anchor-apple-stage1` 下的 verifier `.app` 由现有 iPhoneOS UniFFI async smoke、existing development provisioning profile、existing app scaffold 临时组装并重新签名；安装运行后已把原 `AnchorProvisionProbe.app` 重新安装回 physical iPhone。

---

## 1. Strongest conclusion

**Physical-device generated async runtime is now observed.** The UniFFI generated async iPhoneOS smoke ran inside a development-signed `.app` on `Plimeor's iPhone` and exited `0`.

Observed runtime output:

```text
uniffi:fixture vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
uniffi:async fixture snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
uniffi:dispatch insert changed=blk_a selection=3:3
uniffi:dispatch error=directActiveToDeleted message=direct active→deleted rejected; trash first (D10/D20)
uniffi:roundtrip before=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 after=56e9e39d17157e6bc97d9008aef910791ae4d89b340b4aa767abb8f2fba0e1b6 segment=987 id=seg_1a1fa331b3f1e2c09a880af24bc76e74c5f829c80e47cd7752cf895454a364e3
uniffi:segment bytes=806 checksum=9609028308393580495
uniffi:bench size=1048576 bytes=1048576 ms=3.78 maxrss=9420800 checksum=1479290224479992690
uniffi:bench size=4194304 bytes=4194304 ms=9.33 maxrss=21037056 checksum=1479290224479992690
uniffi:bench size=16777216 bytes=16777216 ms=51.28 maxrss=75628544 checksum=1479290224479992690
uniffi:bench size=67108864 bytes=67108864 ms=196.22 maxrss=293797888 checksum=1479290224479992690
The app terminated with the exit code 0.
```

This closes the open gate left by `40-uniffi-iphoneos-packaging-report.md` / `43-hosted-binding-package-ci-report.md`: iPhoneOS standalone compile/link was already observed; now the same generated async smoke has a signed app-bundle install/launch/runtime proof on a physical iPhone.

This is still a verifier-runtime proof, not release distribution proof. Developer ID / App Store distribution, notarization/upload, and product app integration remain open.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| repo Apple project / product app shell | not changed / not created |
| Xcode project / bundle id / entitlement | not changed |
| temporary verifier `.app` | created under `/tmp/anchor-apple-stage1/PhysicalUniFFIAsyncSmoke-20260610` |
| physical iPhone install / launch | performed with existing development signing |
| original physical iPhone probe app | reinstalled after UniFFI smoke run |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 iPhoneOS smoke artifact shape

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  otool -L /tmp/anchor-apple-stage1/local-binding-artifacts/uniffi-async-smoke-iphoneos
```

Observed excerpt:

```text
/tmp/anchor-apple-stage1/local-binding-artifacts/uniffi-async-smoke-iphoneos:
    /tmp/anchor-apple-stage1/local-binding-artifacts/uniffi-target/aarch64-apple-ios/release/deps/libanchor_core_uniffi.dylib
    /usr/lib/libSystem.B.dylib
    /System/Library/Frameworks/Foundation.framework/Foundation
    /usr/lib/swift/libswiftCore.dylib
    /usr/lib/swift/libswift_Concurrency.dylib
```

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  vtool -show-build /tmp/anchor-apple-stage1/local-binding-artifacts/uniffi-async-smoke-iphoneos
```

Observed:

```text
platform IOS
minos 17.0
sdk 26.5
```

Command:

```sh
file \
  /tmp/anchor-apple-stage1/local-binding-artifacts/uniffi-async-smoke-iphoneos \
  /tmp/anchor-apple-stage1/local-binding-artifacts/uniffi-target/aarch64-apple-ios/release/libanchor_core_uniffi.dylib
```

Observed:

```text
uniffi-async-smoke-iphoneos: Mach-O 64-bit executable arm64
libanchor_core_uniffi.dylib: Mach-O 64-bit dynamically linked shared library arm64
```

Interpretation:

- The smoke executable is a real iPhoneOS `arm64` artifact.
- The original standalone link used an absolute `/tmp` dylib load command, which is not valid on device.
- The verifier app therefore had to embed the dylib and rewrite the load command to `@executable_path/Frameworks/...`.

### 3.2 Temporary verifier app packaging and signing

Command:

```sh
set -euo pipefail
APP_SRC=/tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-unlocked-rerun2-20260610/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app
OUT_APP=/tmp/anchor-apple-stage1/PhysicalUniFFIAsyncSmoke-20260610/AnchorProvisionProbe.app
SMOKE=/tmp/anchor-apple-stage1/local-binding-artifacts/uniffi-async-smoke-iphoneos
DYLIB=/tmp/anchor-apple-stage1/local-binding-artifacts/uniffi-target/aarch64-apple-ios/release/libanchor_core_uniffi.dylib
OLD_LOAD=/tmp/anchor-apple-stage1/local-binding-artifacts/uniffi-target/aarch64-apple-ios/release/deps/libanchor_core_uniffi.dylib
ENTITLEMENTS=/tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-unlocked-rerun2-20260610/Build/Intermediates.noindex/AnchorProvisionProbe.build/Debug-iphoneos/AnchorProvisionProbe.build/AnchorProvisionProbe.app.xcent
IDENTITY=<SIGNING_HASH>
rm -rf /tmp/anchor-apple-stage1/PhysicalUniFFIAsyncSmoke-20260610
mkdir -p "$(dirname "$OUT_APP")"
cp -R "$APP_SRC" "$OUT_APP"
rm -rf "$OUT_APP/_CodeSignature"
mkdir -p "$OUT_APP/Frameworks"
cp "$SMOKE" "$OUT_APP/AnchorProvisionProbe"
cp "$DYLIB" "$OUT_APP/Frameworks/libanchor_core_uniffi.dylib"
chmod +x "$OUT_APP/AnchorProvisionProbe" "$OUT_APP/Frameworks/libanchor_core_uniffi.dylib"
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun install_name_tool -id '@executable_path/Frameworks/libanchor_core_uniffi.dylib' "$OUT_APP/Frameworks/libanchor_core_uniffi.dylib"
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun install_name_tool -change "$OLD_LOAD" '@executable_path/Frameworks/libanchor_core_uniffi.dylib' "$OUT_APP/AnchorProvisionProbe"
/usr/bin/codesign --force --sign "$IDENTITY" --timestamp=none --generate-entitlement-der "$OUT_APP/Frameworks/libanchor_core_uniffi.dylib"
/usr/bin/codesign --force --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" --timestamp=none --generate-entitlement-der "$OUT_APP"
/usr/bin/codesign --verify --strict --verbose=2 "$OUT_APP"
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer otool -L "$OUT_APP/AnchorProvisionProbe"
```

Observed:

```text
/tmp/anchor-apple-stage1/PhysicalUniFFIAsyncSmoke-20260610/AnchorProvisionProbe.app: valid on disk
/tmp/anchor-apple-stage1/PhysicalUniFFIAsyncSmoke-20260610/AnchorProvisionProbe.app: satisfies its Designated Requirement
/tmp/anchor-apple-stage1/PhysicalUniFFIAsyncSmoke-20260610/AnchorProvisionProbe.app/AnchorProvisionProbe:
    @executable_path/Frameworks/libanchor_core_uniffi.dylib
    /usr/lib/libSystem.B.dylib
    /System/Library/Frameworks/Foundation.framework/Foundation
    /usr/lib/swift/libswiftCore.dylib
    /usr/lib/swift/libswift_Concurrency.dylib
```

Interpretation:

- The temporary verifier app is validly signed for development install.
- The executable now loads `libanchor_core_uniffi.dylib` from inside the app bundle.
- This is not a product packaging recommendation; it is a verifier-only physical-runtime proof.

### 3.3 Physical iPhone install

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device install app \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B \
  /tmp/anchor-apple-stage1/PhysicalUniFFIAsyncSmoke-20260610/AnchorProvisionProbe.app
```

Observed:

```text
App installed:
• bundleID: dev.plimeor.AnchorProvisionProbe
• installationURL: file:///private/var/containers/Bundle/Application/B1D540F3-842A-4FDE-8449-E92F503F31C6/AnchorProvisionProbe.app/
• launchServicesIdentifier: unknown
• databaseUUID: 0689B5EA-844D-4A09-9326-4A7D918720C1
• databaseSequenceNumber: 2548
```

### 3.4 Physical iPhone launch

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device process launch \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B \
  --console \
  --terminate-existing \
  dev.plimeor.AnchorProvisionProbe
```

Observed:

```text
uniffi:fixture vault=vault_demo_0001 notes=1 snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
uniffi:async fixture snapshot=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63
uniffi:dispatch insert changed=blk_a selection=3:3
uniffi:dispatch error=directActiveToDeleted message=direct active→deleted rejected; trash first (D10/D20)
uniffi:roundtrip before=3ef88671e9a22cb9de21e22b0c4e635b6ecc569142197675700285dd2a877b63 after=56e9e39d17157e6bc97d9008aef910791ae4d89b340b4aa767abb8f2fba0e1b6 segment=987 id=seg_1a1fa331b3f1e2c09a880af24bc76e74c5f829c80e47cd7752cf895454a364e3
uniffi:segment bytes=806 checksum=9609028308393580495
uniffi:bench size=1048576 bytes=1048576 ms=3.78 maxrss=9420800 checksum=1479290224479992690
Launched application with dev.plimeor.AnchorProvisionProbe bundle identifier.
Waiting for the application to terminate…
uniffi:bench size=4194304 bytes=4194304 ms=9.33 maxrss=21037056 checksum=1479290224479992690
uniffi:bench size=16777216 bytes=16777216 ms=51.28 maxrss=75628544 checksum=1479290224479992690
uniffi:bench size=67108864 bytes=67108864 ms=196.22 maxrss=293797888 checksum=1479290224479992690
The app terminated with the exit code 0.
```

Interpretation:

- The generated async Swift smoke executed on the physical iPhone.
- The async fixture path returned the frozen `snapshot_revision`.
- The dispatch path returned expected insert and structured validation error output.
- The segment round-trip and 64MB bytes benchmark completed on device.

### 3.5 Restore original iCloud probe app

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device install app \
  --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B \
  /tmp/anchor-apple-stage1/DerivedData/AnchorProvisionProbe-device-unlocked-rerun2-20260610/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app
```

Observed:

```text
App installed:
• bundleID: dev.plimeor.AnchorProvisionProbe
• installationURL: file:///private/var/containers/Bundle/Application/3921749A-3D4A-44C6-9C6E-B35A19FDEC36/AnchorProvisionProbe.app/
• launchServicesIdentifier: unknown
• databaseUUID: 0689B5EA-844D-4A09-9326-4A7D918720C1
• databaseSequenceNumber: 2556
```

Interpretation:

- The temporary UniFFI verifier replaced the same bundle id only for the runtime test.
- The original iCloud runtime probe app was restored afterward for future iCloud verifier runs.

---

## 4. Gate result

Closed this iteration:

- iPhoneOS generated async signed app-bundle packaging mechanism floor.
- Physical iPhone install/runtime for the generated async binding smoke.
- Development-signed app-bundle/device runtime integration for the verifier binding path.

Still open:

- Product app integration of the binding package.
- Developer ID notarization.
- App Store / TestFlight distribution identity and upload path.
- Real release upload / distribution channel.
- Product TextKit/UI integration.
- iCloud true remote `.icloud` placeholder / metadata propagation / account-state / product context gates.
- CP-1 whole-exit.

---

## 5. Ledger entry

### Ledger entry — 2026-06-10 — iteration 49 — doc 70-physical-iphone-uniffi-async-runtime-report.md

- **Checkpoint / cursor:** CP-1 Apple half, binding physical-device generated async runtime gate.
- **Action selected:** package the existing iPhoneOS UniFFI generated async smoke into a development-signed verifier `.app`, install it on the physical iPhone, and run it.
- **Owner classification:** Apple/binding verifier → executed with `/tmp` verifier app bundle assembled from existing artifacts; no repo Apple project, product app, root workspace, public CLI schema, or core production source mutation.
- **Scope-fence check:** passed — no root workspace / package / lockfile changes; no public CLI schema; no repo product app shell; no Swift-side deterministic core semantics; original iCloud probe app restored after the runtime check.
- **Evidence (Observed = command + output):**
  - `otool -L uniffi-async-smoke-iphoneos` → iPhoneOS smoke originally loads `libanchor_core_uniffi.dylib` through an absolute `/tmp` path.
  - `install_name_tool` + `codesign` packaging script → verifier app valid on disk, satisfies designated requirement, executable load path rewritten to `@executable_path/Frameworks/libanchor_core_uniffi.dylib`.
  - `devicectl device install app ... PhysicalUniFFIAsyncSmoke-20260610/AnchorProvisionProbe.app` → app installed on physical iPhone.
  - `devicectl device process launch ... dev.plimeor.AnchorProvisionProbe` → `uniffi:async fixture snapshot=3ef88671...`, dispatch insert/error output, segment output, 1MB/4MB/16MB/64MB benches, and `The app terminated with the exit code 0.`
  - `devicectl device install app ... AnchorProvisionProbe.app` → original iCloud runtime probe app restored.
- **Gates closed this iteration:** physical-device generated async runtime; development-signed verifier app-bundle/device runtime integration for the binding smoke.
- **Gates still open:** product app binding integration, Developer ID notarization, App Store/TestFlight distribution, real release upload/distribution channel, product TextKit/UI integration, iCloud remote/account/product-context gates, CP-1 whole-exit.
- **Backfill to 04/05/06:** `04` binding/iCloud baseline and `05` D01/D35 evidence updated to remove the stale physical-device locked/open wording and record docs 69/70; no new D/F numbers.
- **Axis matrix delta:** binding moves from `approved boundary / partially release-gated` with physical-device runtime open to `approved boundary / release-distribution-gated`; release distribution remains open.
- **Gate evaluation:** CONTINUE only for remaining distribution, product-integration, account-state, remote-delivery, or human sign-off gates. Do not claim Developer ID/App Store release, product app integration, or CP-1 exit from this verifier runtime proof.
- **New doc:** `docs/workbench/20260606-anchor-v1/70-physical-iphone-uniffi-async-runtime-report.md`
