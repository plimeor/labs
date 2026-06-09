# Anchor Stage 1 — iOS Device iCloud Locked Rerun Report

任务：CP-1 iCloud delivery gate，第三次尝试在 paired physical iPhone 上启动已安装的 signed CloudDocuments verifier。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮不关闭 physical iPhone runtime / iOS CloudDocuments delivery gate，确认 blocker 仍是 device locked state。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 `suites/anchor/core/src/**` production source；没有创建 repo 内 product app shell；没有改 Xcode project / bundle id / entitlement。外部操作限于通过 `devicectl` 尝试启动已安装 verifier app。

---

## 1. 结论

**Strongest conclusion：the physical iPhone CloudDocuments runtime gate is still externally blocked by the phone being locked; this run is not evidence of an iCloud, entitlement, build, install, or app-runtime failure.**

The device is visible as paired and available, but SpringBoard denied launch:

```text
BSErrorCodeDescription = Locked
Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked.
```

This is the third observed launch attempt blocked by locked device state across docs `32`, `37`, and `42`. The next useful action for this gate is not more code work; it is rerunning the same launch while the device is unlocked.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| Xcode project / bundle id / entitlement | not changed |
| product app shell | not created |
| iCloud account mutation | not performed |
| checkpoint exit | not reached |

---

## 3. Observed evidence

### 3.1 Device list

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl list devices
```

Observed excerpt:

```text
Plimeor's iPhone  C51610FF-15B1-5989-A8A3-DE2EDFACEB5B  available (paired)  iPhone 15 Pro Max (iPhone16,2)
```

### 3.2 Launch attempt

Command:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device process launch \
    --device C51610FF-15B1-5989-A8A3-DE2EDFACEB5B \
    --console \
    --terminate-existing \
    dev.plimeor.AnchorProvisionProbe \
    --icloud-runtime-probe
```

Observed:

```text
02:15:34  Acquired tunnel connection to device.
02:15:34  Enabling developer disk image services.
02:15:34  Acquired usage assertion.
ERROR: The application failed to launch. (com.apple.dt.CoreDeviceError error 10002 (0x2712))
       BundleIdentifier = dev.plimeor.AnchorProvisionProbe
       ----------------------------------------
           The request to open "dev.plimeor.AnchorProvisionProbe" failed. (FBSOpenApplicationServiceErrorDomain error 1 (0x01))
           NSLocalizedFailureReason = The request was denied by service delegate (SBMainWorkspace) for reason: Locked ("Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked").
           BSErrorCodeDescription = RequestDenied
       ----------------------------------------
               The operation couldn’t be completed. Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked. (FBSOpenApplicationErrorDomain error 7 (0x07))
               NSLocalizedFailureReason = Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked.
               BSErrorCodeDescription = Locked
```

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| physical iPhone visibility / pairing | closed for this attempt |
| physical iPhone app launch | blocked by locked device |
| physical iPhone iCloud runtime | open / not observed |
| iOS/non-macOS CloudDocuments delivery | open / not observed |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE** for non-device gates. Do not spend more iterations on this physical-device runtime gate until the iPhone is unlocked.
