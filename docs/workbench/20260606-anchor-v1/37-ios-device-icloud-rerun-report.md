# Anchor Stage 1 — iOS Device iCloud Rerun Report

任务：CP-1 iCloud delivery gate，重试已安装的 physical iPhone CloudDocuments runtime probe。
日期：2026-06-10
状态：**workbench artifact** —— 非公开接口契约；本轮确认 physical iPhone runtime 仍被设备锁定状态阻止，不关闭 iOS device runtime 或 iOS CloudDocuments delivery gate。

> **边界声明（AGENTS 工作台规则，强制）：** 创建本文件**不授权**package / workspace / 产品 app / 生成 lockfile / public CLI schema 改动；本轮没有改 root `package.json` / `bun.lock` / `tsconfig` / workspace 配置；没有改 repo 内 product app shell；没有改 `suites/anchor/core/src/**` production source；没有改 iCloud account 状态。操作仅为对 repo-external Xcode-managed probe app 的 `devicectl` launch 重试。

---

## 1. 结论

**Strongest conclusion：physical iPhone runtime probe 仍未执行；SpringBoard 再次拒绝 launch，原因是设备 locked。**

Observed:

```text
Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked.
```

This preserves doc 32's state: device build/install/entitlement chain is proven, but runtime iCloud container lookup on physical iPhone is not observed in the current turn. This is an external device state block, not a CloudDocuments runtime result.

---

## 2. Scope-fence check

| Fence | Result |
|---|---|
| root workspace / package / lockfile | not changed |
| `suites/anchor/core/src/**` | not changed |
| public CLI schema | not changed |
| repo product app shell | not created |
| iCloud account mutation | not performed |
| physical iPhone launch | attempted, blocked by locked device |
| checkpoint exit | not reached |

---

## 3. Observed evidence

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
01:43:38  Acquired tunnel connection to device.
01:43:38  Enabling developer disk image services.
01:43:38  Acquired usage assertion.
ERROR: The application failed to launch. (com.apple.dt.CoreDeviceError error 10002 (0x2712))
       BundleIdentifier = dev.plimeor.AnchorProvisionProbe
       The request to open "dev.plimeor.AnchorProvisionProbe" failed. (FBSOpenApplicationServiceErrorDomain error 1 (0x01))
       NSLocalizedFailureReason = The request was denied by service delegate (SBMainWorkspace) for reason: Locked ("Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked").
       BSErrorCodeDescription = RequestDenied
       The operation couldn’t be completed. Unable to launch dev.plimeor.AnchorProvisionProbe because the device was not, or could not be, unlocked. (FBSOpenApplicationErrorDomain error 7 (0x07))
       BSErrorCodeDescription = Locked
```

---

## 4. Gate evaluation

| Gate | Result |
|---|---|
| physical iPhone build/install/entitlement chain | already closed by doc 32 |
| physical iPhone runtime launch | open / still blocked by locked device |
| iOS/non-macOS CloudDocuments delivery | open / runtime not observed |
| CP-1 whole-exit | **not exited** |

Gate evaluation: **CONTINUE** for non-device gates; rerun physical device runtime only after the iPhone is unlocked.
