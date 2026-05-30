import { $ } from 'bun'

/**
 * On Linux, Chrome stores its "Chrome Safe Storage" key in the system keyring
 * (GNOME Keyring / KWallet), exposed through the Secret Service API. `secret-tool`
 * (libsecret) reads it. Returns `undefined` when the tool is missing, the keyring
 * is locked, or no entry exists — callers then fall back to the hardcoded key.
 */
export async function getKeyringPassword(): Promise<string | undefined> {
  try {
    const out = await $`secret-tool lookup application chrome`.quiet().text()
    const password = out.replace(/\n$/, '')
    return password.length > 0 ? password : undefined
  } catch {
    return undefined
  }
}
