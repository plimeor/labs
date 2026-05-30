import { $ } from 'bun'

import { BrowserPeekError } from '../types'

let cached: string | undefined

/**
 * Chrome encrypts cookie values with a key stored in the macOS Keychain under
 * the "Chrome Safe Storage" service. Reading it triggers a one-time Keychain
 * permission dialog the first time.
 */
export async function getSafeStoragePassword(): Promise<string> {
  if (cached !== undefined) {
    return cached
  }

  try {
    const out = await $`security find-generic-password -wa Chrome -s "Chrome Safe Storage"`.quiet().text()
    cached = out.trim()
    return cached
  } catch {
    throw new BrowserPeekError(
      'Could not read the "Chrome Safe Storage" key from the macOS Keychain. ' +
        'Approve the Keychain access prompt and try again.'
    )
  }
}
