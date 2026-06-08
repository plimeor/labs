# Anchor Stage 1 - iCloud Drive Adapter Report

Date: 2026-06-07
Owner: Codex / Apple verifier
Status: workbench artifact, not a public interface contract

## Conclusion

iCloud Drive status is **compromise: viable as the CP-1 default transport only with direct package-internal enumeration and explicit delivery gates**.

The current CP-1 gate is macOS-only and uses a repo-local macOS verifier app created through Xcode UI. The verifier project file was not hand-patched after creation; the iCloud entitlement and Info.plist inputs were supplied as explicit `xcodebuild` build settings for the signed runtime probe. This run proves:

- explicit and implicit ubiquity container lookup return non-nil
- a `.anchorvault` directory declared as `dev.plimeor.anchor.vault` conforms to `com.apple.package`
- the vault package path is reported as ubiquitous
- `NSFileCoordinator` write/read of a segment succeeds
- the package-internal segment reports `isUbiquitousItem = false` and download status `nil` on macOS
- `evictUbiquitousItem(at:)` and `startDownloadingUbiquitousItem(at:)` both return `NSCocoaErrorDomain:4` for the freshly written package-internal segment on macOS
- same-device manifest double-write produced 0 unresolved conflict versions
- a 1024 segment measured subset wrote in about 378ms
- repo-local signed macOS scale wrote 10K / 50K / 100K package-internal segment files and direct-enumerated the same counts
- package-internal `NSMetadataQuery` gathered but returned 0 `.seg` files at 1K / 10K / 50K / 100K

The hard constraint is that package-internal segment discovery cannot rely on `NSMetadataQuery`. A real signed macOS app proves `NSMetadataQuery` can discover the `.anchorvault` package itself and can discover files outside the package, but it still returns 0 for `.seg` files inside the `.anchorvault` package, including a visible non-dot subdirectory and the 10K / 50K / 100K scale runs. The viable adapter shape is: use metadata query for vault/package discovery, use file coordination plus direct package-internal enumeration for segment files, and keep remote placeholder, conflict-resolution, account-state, non-macOS scale/delivery, and steady-state segment-budget gates open.

Historical Stage 1 multi-device evidence remains recorded below: same-account online concurrent writes converged without unresolved versions, while an offline iOS fork followed by reconnect produced a real unresolved conflict version. This does not approve product conflict resolution. It only proves the adapter can observe the file-version conflict surface outside the current macOS-only gate.

## Created probe files

- `suites/anchor/apple/AnchorAppleSpike/Sources/AnchorICloudDriveProbe/AnchorICloudDriveProbe.swift`
- `suites/anchor/apple/macos-icloud-probe/AnchorMacICloudProbe.swift`
- `suites/anchor/apple/macos-icloud-probe/AnchorMacICloudProbe.entitlements`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj/project.pbxproj`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj/project.xcworkspace/contents.xcworkspacedata`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacProbe.entitlements`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacProbeInfo.plist`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/AnchorMacICloudProbeApp.swift`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ContentView.swift`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/ICloudRuntimeProbe.swift`
- `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe/Assets.xcassets/**`

The repo-local probe references iCloud Drive APIs only in the Swift adapter layer:

- `FileManager.url(forUbiquityContainerIdentifier:)`
- `NSMetadataQuery`
- `NSFileCoordinator`
- `FileManager.startDownloadingUbiquitousItem(at:)`
- `NSFileVersion.unresolvedConflictVersionsOfItem(at:)`
- `UTType(..., conformingTo: .package)`

No cloud/file-coordination symbols were added to `suites/anchor/core`.

Physical-device runtime was run with the existing repo-external signed probe:

- project: `/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj`
- bundle id: `dev.plimeor.AnchorProvisionProbe`
- iCloud container: `<ICLOUD_CONTAINER>`
- device: `Plimeor's iPhone`, iPhone 15 Pro Max, Xcode destination id `00008130-0002093A01D3803A`

That probe was extended outside the labs repo with:

- `/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProbeInfo.plist`
- `/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe/AnchorProvisionProbeApp.swift`
- `/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj/project.pbxproj`

The second physical-device run fixed the probe lifecycle so the app finished launching before running the iCloud work, and increased the measured write subset from 128 to 1024 segment files.

macOS runtime was first attempted two insufficient ways:

- a signed standalone macOS executable with iCloud entitlements
- the existing Xcode project built for the `My Mac` "Designed for iPad/iPhone" destination

Those first two macOS paths were blocked by provisioning prerequisites, not by core or adapter code, and were superseded by the real signed macOS app project below.

After the user explicitly authorized direct Xcode work, Codex created a real macOS app project and let Xcode automatic signing solve provisioning:

- project: `/Users/plimeor/Documents/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj`
- bundle id: `dev.plimeor.AnchorMacICloudProbe`
- initial iCloud container: `iCloud.dev.plimeor.AnchorMacICloudProbe`
- profile generated/used by Xcode: `Mac Team Provisioning Profile: dev.plimeor.AnchorMacICloudProbe` (`edc43134-4561-435f-9707-4a7ab39ffa5b`)
- app artifact: `/tmp/anchor-apple-stage1/DerivedData/macos-app-signed-v3/Build/Products/Debug/AnchorMacICloudProbe.app`

Codex controlled Xcode directly through Computer Use to open the project and verify the active scheme/destination:

- scheme: `AnchorMacICloudProbe`
- destination: `My Mac`

For the multi-device conflict harness, the iOS and macOS repo-external probes were extended to share the same iCloud container:

- shared iCloud container: `<ICLOUD_CONTAINER>`
- iOS app source: `/Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe/AnchorProvisionProbeApp.swift`
- macOS app source: `/Users/plimeor/Documents/AnchorMacICloudProbe/AnchorMacICloudProbe/AnchorMacICloudProbeApp.swift`
- macOS entitlements: `/Users/plimeor/Documents/AnchorMacICloudProbe/AnchorMacICloudProbe/AnchorMacICloudProbe.entitlements`
- conflict path: `Documents/AnchorConflictProbe/<runID>/manifest.json` inside the shared ubiquity container
- launch flag: `--icloud-conflict-probe <runID> <startEpochMilliseconds> <writer> <mode> <iterations> <settleSeconds>`
- modes tested: `coordinated` via `NSFileCoordinator` with `.forReplacing`, and `raw` via direct `Data.write`

Repo-local Xcode-created macOS verifier app:

- project: `suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj`
- target/scheme: `AnchorMacICloudProbe`
- created through Xcode UI as a macOS App
- platforms: macOS only (`SUPPORTED_PLATFORMS = macosx`)
- bundle id: `dev.plimeor.AnchorMacICloudProbe`
- team: `<DEVELOPER_NAME>` / `<TEAM_ID>`
- project configuration provenance: `project.pbxproj` is Xcode-created; Codex did not hand-patch it
- signed build input: `CODE_SIGN_ENTITLEMENTS=AnchorMacProbe.entitlements`
- Info.plist input: `INFOPLIST_FILE=AnchorMacProbeInfo.plist GENERATE_INFOPLIST_FILE=NO`
- iCloud runtime entitlement: CloudDocuments only, shared container `<ICLOUD_CONTAINER>`, CloudKit not enabled
- Info.plist runtime declaration: `.anchorvault` exported as `dev.plimeor.anchor.vault` conforming to `com.apple.package`
- runtime probe entrypoint: app init runs only for `--icloud-runtime-probe` or `--icloud-scale-probe`

## Commands and results

| Command | Result |
|---|---|
| `ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-darwin/release swift build --package-path suites/anchor/apple/AnchorAppleSpike --scratch-path /tmp/anchor-apple-stage1/swift-build-icloud --product AnchorICloudDriveProbe` | passed; SwiftPM warned the automatic product flag is redundant |
| `ANCHOR_CORE_FFI_LIB_DIR=/tmp/anchor-apple-stage1/ffi-target/aarch64-apple-ios-sim/release xcodebuild -scheme AnchorICloudDriveProbe -destination 'generic/platform=iOS Simulator' -configuration Debug -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/icloud-ios-2 -quiet build` | passed |
| `xcodebuild -project ~/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj -scheme AnchorProvisionProbe -destination 'platform=iOS,id=00008130-0002093A01D3803A' -configuration Debug -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/icloud-device-runtime -allowProvisioningUpdates build` | passed |
| `xcrun devicectl device install app --device 00008130-0002093A01D3803A /tmp/anchor-apple-stage1/DerivedData/icloud-device-runtime/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app` | passed |
| `xcrun devicectl device process launch --device 00008130-0002093A01D3803A --terminate-existing --console --timeout 45 dev.plimeor.AnchorProvisionProbe --icloud-runtime-probe` | passed, app exited 0 |
| `swiftc suites/anchor/apple/macos-icloud-probe/AnchorMacICloudProbe.swift -o /tmp/anchor-apple-stage1/AnchorMacICloudProbe` | passed |
| `codesign --force --sign <SIGNING_HASH> --identifier dev.plimeor.AnchorMacICloudProbe --entitlements suites/anchor/apple/macos-icloud-probe/AnchorMacICloudProbe.entitlements /tmp/anchor-apple-stage1/AnchorMacICloudProbe` | passed |
| `codesign -dvvv --entitlements :- /tmp/anchor-apple-stage1/AnchorMacICloudProbe` | passed; iCloud entitlements were present |
| `/tmp/anchor-apple-stage1/AnchorMacICloudProbe` | blocked by AMFI; restricted entitlements require a matching provisioning profile |
| `xcodebuild -project ~/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj -scheme AnchorProvisionProbe -showdestinations` | passed; showed `My Mac` as `Designed for [iPad,iPhone]` destination |
| `xcodebuild -project ~/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj -scheme AnchorProvisionProbe -destination 'id=00008132-000A05691EFA401C' ... build` | blocked; Mac mini is not registered in the developer account and the iOS profile does not include the Mac device |
| `xcodebuild ... -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/icloud-device-runtime-v3 -quiet build` | passed after probe lifecycle fix |
| `xcrun devicectl device install app ... /tmp/anchor-apple-stage1/DerivedData/icloud-device-runtime-v3/.../AnchorProvisionProbe.app && xcrun devicectl device process launch ... --timeout 90 ... --icloud-runtime-probe` | passed, app exited 0 |
| `xcodebuild -project /Users/plimeor/Documents/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj -list` | passed; target/scheme `AnchorMacICloudProbe` present |
| `xcodebuild -project /Users/plimeor/Documents/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj -scheme AnchorMacICloudProbe -showdestinations` | passed; macOS `My Mac` and `Any Mac` destinations present |
| `xcodebuild ... CODE_SIGNING_ALLOWED=NO build` | passed; proved local macOS project/probe code compiles without signing |
| `xcodebuild ... -allowProvisioningUpdates -allowProvisioningDeviceRegistration build` | passed; Xcode generated/used `Mac Team Provisioning Profile: dev.plimeor.AnchorMacICloudProbe` |
| `codesign -dvvv --entitlements :- /tmp/anchor-apple-stage1/DerivedData/macos-app-signed/Build/Products/Debug/AnchorMacICloudProbe.app` | passed; app has CloudDocuments, ubiquity container, app sandbox, hardened runtime |
| `spctl -a -vv /tmp/anchor-apple-stage1/DerivedData/macos-app-signed/Build/Products/Debug/AnchorMacICloudProbe.app` | rejected as Apple Development; expected for Gatekeeper distribution assessment, not a local debug runtime blocker |
| `/tmp/anchor-apple-stage1/DerivedData/macos-app-signed-v3/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe --icloud-runtime-probe` | passed, app exited 0 |
| `xcodebuild -project /Users/plimeor/Documents/AnchorProvisionProbe/AnchorProvisionProbe.xcodeproj -scheme AnchorProvisionProbe -destination 'platform=iOS,id=00008130-0002093A01D3803A' -configuration Debug -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/icloud-conflict-ios -allowProvisioningUpdates build` | passed; only warning was missing document-browser/open-in-place keys |
| `xcodebuild -project /Users/plimeor/Documents/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj -scheme AnchorMacICloudProbe -destination 'platform=macOS,arch=arm64' -configuration Debug -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/icloud-conflict-mac -allowProvisioningUpdates -allowProvisioningDeviceRegistration build` | passed |
| `codesign -dvvv --entitlements :- /tmp/anchor-apple-stage1/DerivedData/icloud-conflict-mac/Build/Products/Debug/AnchorMacICloudProbe.app` | passed; macOS app has shared `<ICLOUD_CONTAINER>` CloudDocuments entitlements |
| `xcrun devicectl device install app --device 00008130-0002093A01D3803A /tmp/anchor-apple-stage1/DerivedData/icloud-conflict-ios/Build/Products/Debug-iphoneos/AnchorProvisionProbe.app` | passed |
| `xcrun devicectl device process launch ... --icloud-conflict-probe conflict-20260607T112908Z-coordinated 1780831773000 ios coordinated 80 20` and macOS app launched with the same run id/start time as writer `mac` | passed; both apps exited 0, final manifest was macOS `seq=79`, conflict versions `0` on both devices |
| `xcrun devicectl device process launch ... --icloud-conflict-probe conflict-20260607T113006Z-raw 1780831831000 ios raw 120 30` and macOS app launched with the same run id/start time as writer `mac` | passed; both apps exited 0, final manifest was iOS `seq=119`, conflict versions `0` on both devices |
| `xcrun devicectl device process launch ... --icloud-conflict-probe offline-conflict-20260607T113449Z 1780832114000 ios-base coordinated 1 20` and macOS app launched with writer `mac-base` | passed; online baseline converged to `writer=mac-base`, conflict versions `0` |
| after user put iPhone offline, `xcrun devicectl device process launch ... --icloud-conflict-probe offline-conflict-20260607T113449Z 1780832258000 ios-offline coordinated 1 10` and macOS app launched with writer `mac-online` | passed; offline fork created divergent local states: iOS saw `writer=ios-offline`, macOS saw `writer=mac-online`, conflict versions `0` before reconnect |
| after user restored iPhone network, `xcrun devicectl device process launch ... --icloud-conflict-probe offline-conflict-20260607T113449Z 0 ios-after-restore coordinated 0 60` and macOS app launched with writer `mac-after-restore` | passed; no manifest rewrite, both devices saw current `writer=ios-offline` and `conflict_versions=1` |
| `swift -` read of macOS `NSFileVersion.unresolvedConflictVersionsOfItem(at:)` for the same manifest | passed; current file was `writer=ios-offline`, conflict version content was `writer=mac-online` |
| `xcodebuild -project /Users/plimeor/Documents/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj -scheme AnchorMacICloudProbe -configuration Debug -derivedDataPath /tmp/anchor-mac-icloud-scale-derived -quiet build` | passed; signed macOS scale probe built |
| `/tmp/anchor-mac-icloud-scale-derived/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe --icloud-scale-probe scale-10k-20260607 10000 20 cleanup` | passed; write `33759.85ms`, direct count `10000`, direct enumeration `27.70ms`, package-internal metadata count `0` |
| `/tmp/anchor-mac-icloud-scale-derived/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe --icloud-scale-probe scale-50k-20260607 50000 20 cleanup` | passed; write `172355.40ms`, direct count `50000`, direct enumeration `142.63ms`, package-internal metadata count `0` |
| `/tmp/anchor-mac-icloud-scale-derived/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe --icloud-scale-probe scale-100k-20260607 100000 20 cleanup` | passed; write `337324.94ms`, direct count `100000`, direct enumeration `299.51ms`, package-internal metadata count `0` |
| `bun install --dry-run --frozen-lockfile --ignore-scripts` | passed; workspace resolution did not pull `suites/anchor/apple` into Bun workspaces |
| `find suites/anchor -name package.json -print` | passed; 0 results |
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj -list` | passed; target/scheme `AnchorMacICloudProbe` present |
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj -scheme AnchorMacICloudProbe -showdestinations` | passed; destinations are macOS only |
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project suites/anchor/apple/AnchorMacICloudProbe/AnchorMacICloudProbe.xcodeproj -scheme AnchorMacICloudProbe -destination 'platform=macOS,arch=arm64' -configuration Debug -derivedDataPath /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-xcode-ui -allowProvisioningUpdates -allowProvisioningDeviceRegistration CODE_SIGN_ENTITLEMENTS=AnchorMacProbe.entitlements INFOPLIST_FILE=AnchorMacProbeInfo.plist GENERATE_INFOPLIST_FILE=NO build` | passed; Xcode used `Mac Team Provisioning Profile: dev.plimeor.AnchorMacICloudProbe` and Apple Development signing; the project file was not modified by this command |
| `codesign -d --entitlements :- /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-xcode-ui/Build/Products/Debug/AnchorMacICloudProbe.app` | passed; CloudDocuments and shared `<ICLOUD_CONTAINER>` entitlements present |
| `plutil -p /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-xcode-ui/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/Info.plist` | passed; `.anchorvault` exported package UTType and `NSUbiquitousContainers` declaration present |
| `security cms -D -i /tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-xcode-ui/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/embedded.provisionprofile` | passed; Xcode-managed profile includes both `iCloud.dev.plimeor.AnchorMacICloudProbe` and `<ICLOUD_CONTAINER>` |
| `/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-xcode-ui/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe --icloud-runtime-probe` | passed, app exited 0; package-internal segment evict/download both returned `NSCocoaErrorDomain:4` |
| `/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-xcode-ui/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe --icloud-scale-probe 10000` | passed; write `3634.66ms`, direct count `10000`, direct enumeration `22.53ms`, package-internal metadata count `0` |
| `/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-xcode-ui/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe --icloud-scale-probe 50000` | passed; write `18455.09ms`, direct count `50000`, direct enumeration `124.70ms`, package-internal metadata count `0` |
| `/tmp/anchor-apple-stage1/DerivedData/AnchorMacICloudProbe-xcode-ui/Build/Products/Debug/AnchorMacICloudProbe.app/Contents/MacOS/AnchorMacICloudProbe --icloud-scale-probe 100000` | passed; write `38509.85ms`, direct count `100000`, direct enumeration `269.50ms`, package-internal metadata count `0` |

Signed-device runtime output:

```text
icloud-runtime:explicit_nil=false
icloud-runtime:implicit_nil=false
icloud-runtime:explicit_path=/private/var/mobile/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe
icloud-runtime:implicit_path=/private/var/mobile/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe
icloud-runtime:vault_package=AnchorStage1Probe.anchorvault
icloud-runtime:vault_type_identifier=dev.plimeor.anchor.vault
icloud-runtime:vault_is_ubiquitous=true
icloud-runtime:coordinated_segment_bytes=28
icloud-runtime:coordinated_segment_equal=true
icloud-runtime:segment_is_ubiquitous=true
icloud-runtime:segment_download_status=NSURLUbiquitousItemDownloadingStatusCurrent
icloud-runtime:start_download=ok
icloud-runtime:manifest_conflict_versions=0
icloud-runtime:metadata_initial_gathered=false
icloud-runtime:metadata_seg_count=0
icloud-runtime:metadata_seg_names=
icloud-runtime:scale_subset_files=128
icloud-runtime:scale_subset_write_ms=531.08
icloud-runtime:scale_metadata_gathered=false
icloud-runtime:scale_metadata_seg_count=0
icloud-runtime:cleanup_removed=true
```

Signed-device runtime output after lifecycle fix and 1024-file subset:

```text
icloud-runtime:explicit_nil=false
icloud-runtime:implicit_nil=false
icloud-runtime:explicit_path=/private/var/mobile/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe
icloud-runtime:implicit_path=/private/var/mobile/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe
icloud-runtime:vault_package=AnchorStage1Probe.anchorvault
icloud-runtime:vault_type_identifier=dev.plimeor.anchor.vault
icloud-runtime:vault_is_ubiquitous=true
icloud-runtime:coordinated_segment_bytes=28
icloud-runtime:coordinated_segment_equal=true
icloud-runtime:segment_is_ubiquitous=true
icloud-runtime:segment_download_status=NSURLUbiquitousItemDownloadingStatusCurrent
icloud-runtime:start_download=ok
icloud-runtime:manifest_conflict_versions=0
icloud-runtime:metadata_initial_gathered=false
icloud-runtime:metadata_seg_count=0
icloud-runtime:metadata_seg_names=
icloud-runtime:scale_subset_files=1024
icloud-runtime:scale_subset_write_ms=3720.38
icloud-runtime:scale_metadata_gathered=false
icloud-runtime:scale_metadata_seg_count=0
icloud-runtime:cleanup_removed=true
```

macOS standalone signed executable diagnostics:

```text
codesign --verify --verbose=4 /tmp/anchor-apple-stage1/AnchorMacICloudProbe
/tmp/anchor-apple-stage1/AnchorMacICloudProbe: valid on disk
/tmp/anchor-apple-stage1/AnchorMacICloudProbe: satisfies its Designated Requirement

spctl -a -vv /tmp/anchor-apple-stage1/AnchorMacICloudProbe
/tmp/anchor-apple-stage1/AnchorMacICloudProbe: rejected
origin=Apple Development: <DEVELOPER_NAME> (<TEAM_ID_ALT>)
```

Relevant system log:

```text
Disallowing dev.plimeor.AnchorMacICloudProbe because no eligible provisioning profiles found
Restricted entitlements not validated, bailing out. Error: No matching profile found
```

macOS "Designed for iPad/iPhone" build result:

```text
Device "Plimeor’s Mac mini" isn't registered in your developer account.
Provisioning profile "iOS Team Provisioning Profile: dev.plimeor.AnchorProvisionProbe" doesn't include the currently selected device "Plimeor’s Mac mini" (identifier 00008132-000A05691EFA401C).
```

Signed macOS app runtime output:

```text
macos-app-icloud:explicit_nil=false
macos-app-icloud:implicit_nil=false
macos-app-icloud:explicit_path=/Users/plimeor/Library/Mobile Documents/iCloud~dev~plimeor~AnchorMacICloudProbe
macos-app-icloud:implicit_path=/Users/plimeor/Library/Mobile Documents/iCloud~dev~plimeor~AnchorMacICloudProbe
macos-app-icloud:vault_package=AnchorStage1MacAppProbe.anchorvault
macos-app-icloud:vault_type_identifier=dev.plimeor.anchor.vault
macos-app-icloud:vault_is_ubiquitous=true
macos-app-icloud:coordinated_segment_bytes=38
macos-app-icloud:coordinated_segment_equal=true
macos-app-icloud:segment_is_ubiquitous=false
macos-app-icloud:segment_download_status=nil
macos-app-icloud:start_download_error=NSCocoaErrorDomain:4
macos-app-icloud:manifest_conflict_versions=0
macos-app-icloud:package_metadata_gathered=true
macos-app-icloud:package_metadata_count=1
macos-app-icloud:package_metadata_names=AnchorStage1MacAppProbe.anchorvault
macos-app-icloud:metadata_initial_gathered=true
macos-app-icloud:metadata_seg_count=0
macos-app-icloud:scale_subset_files=1024
macos-app-icloud:scale_subset_write_ms=3247.49
macos-app-icloud:scale_direct_seg_count=1024
macos-app-icloud:scale_metadata_gathered=true
macos-app-icloud:scale_metadata_seg_count=0
macos-app-icloud:visible_package_direct_seg_count=128
macos-app-icloud:visible_package_metadata_gathered=true
macos-app-icloud:visible_package_metadata_seg_count=0
macos-app-icloud:outside_direct_seg_count=128
macos-app-icloud:outside_metadata_gathered=true
macos-app-icloud:outside_metadata_seg_count=125
macos-app-icloud:cleanup_removed=true
```

Important macOS observation:

- `NSMetadataQuery` can discover the `.anchorvault` package itself: package count `1`.
- Direct filesystem enumeration can see package-internal segments: hidden `.anchor` scale direct count `1024`, visible package directory direct count `128`.
- `NSMetadataQuery` does not enumerate package-internal `.seg` files in this probe: hidden package count `0`, visible package directory count `0`.
- `NSMetadataQuery` can enumerate `.seg` files outside the package: 125 of 128 observed after the fixed live-update wait window.
- macOS reported the freshly written package-internal segment as `isUbiquitous=false` and download status `nil` even though the package directory itself is ubiquitous; iOS reported the analogous segment as ubiquitous/current. The adapter should treat per-file resource-value behavior as platform-sensitive.

Signed macOS scale output:

```text
10K: write_ms=33759.85 direct_seg_count=10000 direct_enumeration_ms=27.70 metadata_gathered=true metadata_seg_count=0 cleanup_ms=458.59
50K: write_ms=172355.40 direct_seg_count=50000 direct_enumeration_ms=142.63 metadata_gathered=true metadata_seg_count=0 cleanup_ms=4230.80
100K: write_ms=337324.94 direct_seg_count=100000 direct_enumeration_ms=299.51 metadata_gathered=true metadata_seg_count=0 cleanup_ms=11282.01
```

Repo-local signed macOS verifier runtime output:

```text
icloud_probe explicit_nil=false
icloud_probe implicit_nil=false
icloud_probe container_path=/Users/plimeor/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe
icloud_probe vault_package=AnchorStage1MacProbe.anchorvault
icloud_probe vault_uttype_lookup=dyn.ah62d4rv4ge80c5xdrb11e7xbsz0hk
icloud_probe vault_type_identifier=dev.plimeor.anchor.vault
icloud_probe vault_is_ubiquitous=true
icloud_probe coordinated_segment_bytes=30
icloud_probe coordinated_segment_equal=true
icloud_probe segment_is_ubiquitous=false
icloud_probe segment_download_status=nil
icloud_probe segment_type_identifier=dyn.ah62d4rv4ge80c5xdrb11e65fq6
icloud_probe evict_segment_error=NSCocoaErrorDomain:4 file not found
icloud_probe after_evict_is_ubiquitous=false
icloud_probe after_evict_download_status=nil
icloud_probe start_download_error=NSCocoaErrorDomain:4 file not found
icloud_probe manifest_conflict_versions=0
icloud_probe metadata_initial_gathered=true
icloud_probe metadata_seg_count=0
icloud_probe scale_subset_files=1024
icloud_probe scale_subset_write_ms=377.70
icloud_probe scale_subset_direct_count=1024
icloud_probe scale_subset_enum_ms=2.41
icloud_probe cleanup_removed=true
```

Repo-local signed macOS verifier scale output:

```text
10K: write_ms=3634.66 direct_seg_count=10000 direct_enumeration_ms=22.53 metadata_gathered=true metadata_seg_count=0 cleanup_ms=673.31
50K: write_ms=18455.09 direct_seg_count=50000 direct_enumeration_ms=124.70 metadata_gathered=true metadata_seg_count=0 cleanup_ms=5374.98
100K: write_ms=38509.85 direct_seg_count=100000 direct_enumeration_ms=269.50 metadata_gathered=true metadata_seg_count=0 cleanup_ms=12324.26
```

Scale interpretation:

- macOS signed-app direct package-internal enumeration is not the current no-go: 100K files enumerated in about 300ms after writes completed.
- Per-file direct writes are linear in this probe: about 0.36s per 1K files for the current repo-local verifier run.
- `NSMetadataQuery` remains unusable for package-internal segment discovery at every tested scale: 10K / 50K / 100K all returned 0 package-internal `.seg` files.
- This does not prove remote placeholder behavior, non-macOS large-scale behavior, over-quota/signed-out states, or product steady-state segment budget.

Two-device conflict harness output:

```text
coordinated run:
ios: mode=coordinated, iterations=80, write_ms=3366.82
mac: mode=coordinated, iterations=80, write_ms=2924.17
ios final_text writer=mac seq=79
mac final_text writer=mac seq=79
ios conflict_versions=0
mac conflict_versions=0

raw run:
ios: mode=raw, iterations=120, write_ms=4150.53
mac: mode=raw, iterations=120, write_ms=4031.44
ios final_text writer=ios seq=119
mac final_text writer=ios seq=119
ios conflict_versions=0
mac conflict_versions=0
```

Conflict interpretation:

- The two devices did write through the same ubiquity container: iOS used `/private/var/mobile/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe`, macOS used `/Users/plimeor/Library/Mobile Documents/iCloud~dev~plimeor~AnchorProvisionProbe`.
- Online concurrent writes converged on both devices after the settle window.
- `NSFileVersion.unresolvedConflictVersionsOfItem(at:)` returned 0 for both coordinated and raw runs.
- This does not prove conflict handling is unnecessary. It means the tested online same-account case did not produce an unresolved file-version conflict. The missing test is an offline/unsynced fork followed by reconnection.

Offline fork conflict output:

```text
baseline:
ios final_text writer=mac-base seq=0
mac final_text writer=mac-base seq=0
ios conflict_versions=0
mac conflict_versions=0

offline fork before reconnect:
ios final_text writer=ios-offline seq=0
mac final_text writer=mac-online seq=0
ios conflict_versions=0
mac conflict_versions=0

after reconnect and 60s settle:
ios final_text writer=ios-offline seq=0
mac final_text writer=ios-offline seq=0
ios conflict_versions=1
mac conflict_versions=1

macOS NSFileVersion content read:
current_text writer=ios-offline
conflict_0_text writer=mac-online
```

Offline conflict interpretation:

- The shared baseline was real: both devices first converged to `writer=mac-base`.
- The offline fork was real: with iPhone offline, iOS read back `writer=ios-offline` while macOS read back `writer=mac-online`.
- After reconnect, iCloud selected the iOS offline write as the current file on both devices and preserved the macOS online write as an unresolved conflict version.
- `NSFileVersion.unresolvedConflictVersionsOfItem(at:)` exposed 1 conflict on both devices.
- A macOS read of the conflict version URL confirmed the retained version content was the `mac-online` JSON.
- No resolution or deletion was performed. Product adapter work still needs an explicit policy for surfacing, preserving, and resolving manifest conflicts.

## Core cloud-symbol audit

Command:

```fish
rg -n "CloudKit|CKRecord|CKAsset|CKContainer|CKSyncEngine|NSFileCoordinator|NSMetadataQuery|ubiquit|iCloud|NSURLIsExcludedFromBackupKey" suites/anchor/core
```

Result: exit 1, **0 matches**.

Command:

```fish
rg -n "OpSyncPort|push_segment|pull_segment|SegmentId|BlobId" suites/anchor/core
```

Result: expected matches in:

- `suites/anchor/core/src/sync_port.rs`
- `suites/anchor/core/src/dto.rs`
- `suites/anchor/core/src/lib.rs` boundary comment

Observed core boundary remains intact: core traffics only `SegmentId` / `BlobId` + bytes and contains no Apple cloud/file-coordination types.

## Runtime checklist status

| Item | Status | Evidence |
|---|---|---|
| Anchor target iCloud capability signing | partial passed | repo-local Xcode-created verifier app is signed with CloudDocuments entitlement via explicit build settings; no repo-local product Anchor app target exists |
| ubiquity container lookup | passed | explicit and implicit lookup returned non-nil on repo-local signed macOS verifier |
| vault file package with `com.apple.package` UTType | passed for local runtime type id | `.anchorvault` package reported `dev.plimeor.anchor.vault` and `isUbiquitousItem=true`; repo-local Info.plist exports `.anchorvault` as `dev.plimeor.anchor.vault` conforming to `com.apple.package` |
| `NSMetadataQuery` live discovery | compromise | repo-local macOS verifier gathered but returned 0 package-internal `.seg` files at 1K / 10K / 50K / 100K |
| `NSFileCoordinator` read/write | passed | coordinated write/read of 30 bytes, equality true |
| placeholder download behavior | partial / macOS package-internal failure observed | macOS package-internal segment reported `isUbiquitous=false`, download status `nil`; `evictUbiquitousItem` and `startDownloadingUbiquitousItem` both returned `NSCocoaErrorDomain:4`; no remote placeholder case |
| manifest conflict / `NSFileVersion` behavior | partial passed | same-device macOS manifest double-write produced 0 conflict versions; historical offline iOS / online macOS fork produced 1 unresolved conflict version after reconnect; resolution policy not implemented |
| signed-out / over-quota states | Blocked / not run | requires account/device state |
| segment-file-count scale 1K/10K/50K/100K | compromise | repo-local macOS verifier wrote 1024 / 10K / 50K / 100K files; direct enumeration saw the same counts; enumeration was `22.53ms` at 10K, `124.70ms` at 50K, `269.50ms` at 100K; package-internal metadata enumeration stayed 0 |
| local-only path-in-ubiquity boundary | Blocked / not run | requires runtime path/account/container cases |
| macOS signed runtime | passed for real `.app` | repo-external and repo-local macOS app projects signed with Mac Team Provisioning Profile and ran the probe; repo-local project file was Xcode-created and not hand-patched; loose executable remains invalid for restricted iCloud entitlements |

## Decision impact

iCloud Drive should remain **compromise: viable as the CP-1 default transport only under the direct-enumeration adapter shape and remaining delivery gates**.

The correct CP-1 state is now:

- iCloud adapter compile surface: passed
- Core cloud boundary audit: passed
- signed macOS ubiquity container: passed
- package type id and ubiquitous package path: passed
- coordinated read/write: passed
- package-internal segment placeholder/download behavior: macOS failure observed with `NSCocoaErrorDomain:4`; remote placeholder not proved
- repo-local Xcode-created macOS verifier: project created through Xcode UI; `project.pbxproj` not hand-patched; signed macOS build/runtime passed via explicit entitlement/Info build settings
- metadata-query discovery: package discovery passed on macOS, package-internal segment metadata enumeration failed
- 1K / 10K / 50K / 100K package-internal write/direct-enumeration path: passed on repo-local signed macOS app, failed for package-internal metadata enumeration
- multi-device online concurrent manifest write: passed for convergence, produced 0 unresolved conflicts
- offline/unsynced manifest conflict materialization: passed; current file was `ios-offline`, conflict version retained `mac-online`
- 10K/50K/100K scale gate: passed for signed macOS direct enumeration; not run for remote placeholder/sync delivery

Stage 1 decision files should not approve an iCloud adapter that depends on `NSMetadataQuery` for per-segment discovery inside `.anchorvault`. The viable compromise shape is: `NSMetadataQuery` discovers vault packages, `NSFileCoordinator` protects reads/writes, and the adapter directly enumerates package-internal segment files. That compromise still needs a product conflict-resolution policy, remote placeholder, signed-out/over-quota, non-macOS large-scale delivery behavior, and steady-state segment budget evidence before default transport approval.
