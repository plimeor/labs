export interface CliInstallResult {
  installedPath: string
  pathHint: string | null
  targetPath: string
}

export async function installAnchorCli(): Promise<CliInstallResult> {
  if (!isTauriRuntime()) {
    throw new Error('CLI install is only available in the desktop app')
  }

  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<CliInstallResult>('install_cli')
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
