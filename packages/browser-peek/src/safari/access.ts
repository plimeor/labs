import { BrowserPeekError } from '../types'

export function isPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const code = (error as { code?: string }).code
  return code === 'EPERM' || code === 'EACCES'
}

export function fullDiskAccessError(): BrowserPeekError {
  return new BrowserPeekError(
    'Safari data is protected by macOS. Grant Full Disk Access to your terminal in ' +
      'System Settings → Privacy & Security → Full Disk Access, then try again.'
  )
}
