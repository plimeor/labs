# @plimeor/browser-peek

Read cookies and local storage from local browser profiles, straight from the
command line. macOS, Linux, and Windows.

Two command groups — `cookie` and `storage` — each with `list` and `get`. Pick
a **browser** (via flag) and a **profile** (via picker), then either list a
store or look a value up by name.

## Install

```bash
bun add --global @plimeor/browser-peek
```

Or run without installing:

```bash
bunx @plimeor/browser-peek cookie list
```

## First command

```bash
# List all cookies for Chrome's current profile
browser-peek cookie list
```

## Commands

Each store has its own group: `cookie` for cookies, `storage` for local
storage. Both groups expose `list` and `get`.

### `cookie list` · `storage list`

Without `--domain`, `list` prints an **overview**: each origin and how many
entries it holds, busiest first. Add `--domain` to drill into one site and see
the actual entries.

```bash
browser-peek cookie list                         # overview of every origin
browser-peek cookie list --domain github.com     # entries for one site
browser-peek storage list --domain github.com --full   # full values, no truncation
```

Both views cap at 50 rows by default. Raise it with `--limit N` (`--limit 0` for
no cap) or lift it entirely with `--all`.

### `cookie get <name>` · `storage get <name>`

Look up an entry by name within the store.

- **Exactly one match** → printed directly.
- **No match or several** → an interactive picker opens.

```bash
browser-peek cookie get session_id                     # may prompt to disambiguate
browser-peek cookie get session_id --domain mysite.com # narrow first, usually one hit
browser-peek storage get theme                         # local storage by key
```

`--domain` is the recommended disambiguator: names are rarely unique across
sites, so filtering by host collapses the candidate set.

## Options

| Option | Shortcut | Description |
| --- | --- | --- |
| `--browser <chrome\|safari>` | `-b` | Browser to read. Default: `chrome`. |
| `--profile <id\|name>` | `-p` | Profile to use. Skips the picker. |
| `--domain <text>` | `-d` | Case-insensitive substring filter on origin/host. Switches `list` to detail rows. |
| `--limit <n>` | `-l` | (`list`) Max rows/origins to show. `0` = no limit. Default: `50`. |
| `--all` | `-a` | (`list`) Show everything; overrides `--limit`. |
| `--full` | | (`list`) Show full values instead of truncating. |
| `--json` | | (`get`) Emit a JSON result envelope; disables all prompts. |

`get --json` never prompts. If a browser has more than one profile, pass
`--profile` explicitly.

## Browser support

| Browser | Cookies | Local Storage | Notes |
| --- | --- | --- | --- |
| **Chrome** | ✅ | ✅ | Verified on macOS. |
| **Safari** | ⚠️ | ⚠️ | macOS only. Requires Full Disk Access; profile selection limited to `Default`. Latest Safari only. |

Per platform:

| Platform | Chrome cookies | Chrome local storage |
| --- | --- | --- |
| **macOS** | ✅ | ✅ |
| **Linux** | ✅ | ✅ |
| **Windows** | ❌ (DPAPI / App-Bound Encryption — not yet) | ✅ |

The browser layer is an adapter registry, so adding Firefox (or Edge, Brave,
etc.) later is a drop-in.

## Permissions

- **Chrome cookies on macOS** are encrypted with a key in the Keychain. The first
  read triggers a one-time Keychain prompt — approve it.
- **Chrome cookies on Linux** are encrypted with a key in the system keyring
  (GNOME Keyring / KWallet), read via `secret-tool` (libsecret) — install it and
  unlock your login keyring. Without a keyring, Chrome's hardcoded fallback key
  is used automatically.
- **Safari** data is protected by the system. Grant your terminal **Full Disk
  Access** in *System Settings → Privacy & Security → Full Disk Access*.

## How it works

Browsers hold exclusive locks on their databases while running, and reading the
live files risks corruption. Each adapter copies the relevant data into a
throwaway temp directory and reads the copy:

- **Chrome cookies** — SQLite (`bun:sqlite`). `v10`/`v11` values are AES-128-CBC
  decrypted with the "Chrome Safe Storage" key — from the macOS Keychain, or on
  Linux from the system keyring (`v11`) or a hardcoded fallback (`v10`); the
  `SHA256(host_key)` prefix that recent Chrome prepends is stripped.
- **Chrome local storage** — LevelDB (`level`); `META:`/`VERSION` keys skipped,
  UTF-16/Latin-1 value encodings decoded.
- **Safari cookies** — the `Cookies.binarycookies` binary format.
- **Safari local storage** — WebKit `.localstorage` SQLite files.

## Library API

```ts
import { getAdapter } from '@plimeor/browser-peek'

const chrome = getAdapter('chrome')
const profile = await chrome.defaultProfile()
const cookies = await chrome.readCookies(profile!)
```

Exports: `getAdapter`, `BROWSER_IDS`, `chromeAdapter`, `safariAdapter`,
`BrowserPeekError`, and the `BrowserAdapter` / `StoreRecord` / `Profile` types.
