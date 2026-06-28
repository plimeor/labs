import { resolve } from 'node:path'

import { cancel, confirm, isCancel, isTTY, log } from '@clack/prompts'

import {
  catalogPulseStatus,
  hasPulseName,
  listCatalogPulses,
  metadataToInstalledPulse,
  resolveCatalogPulse
} from './pulses/catalog'
import { hashFile, loadCustomPulseMetadata } from './pulses/loader'
import type { PulseKind } from './pulses/types'
import { ensureDaemon, isDaemonRunning, requestDaemon } from './runtime/daemon'
import { readPulseLogs, startManagedRun } from './runtime/logs'
import { resolvePulsePaths } from './store/paths'
import { readRuntime, readState, updateState } from './store/state'

type ConfirmPrompt = typeof confirm

export type PromptOverrides = {
  confirmPrompt?: ConfirmPrompt
}

export async function available(home: string): Promise<string> {
  const state = await readState(resolvePulsePaths(home).statePath)
  return listCatalogPulses(state)
    .map(pulse => {
      const detail = pulse.kind === 'scheduled' ? ` ${pulse.schedule}` : ''
      return `${pulse.name}\t${pulse.kind}${detail}`
    })
    .join('\n')
}

export async function installCustomPulse(home: string, file: string, prompts: PromptOverrides = {}): Promise<string> {
  const absolutePath = resolve(file)
  const sha256 = await hashFile(absolutePath)
  await confirmBeforeImport(`Import ${absolutePath} (${sha256})?`, prompts.confirmPrompt)
  const metadata = await loadCustomPulseMetadata(absolutePath, sha256)
  const paths = resolvePulsePaths(home)
  const state = await readState(paths.statePath)
  if (hasPulseName(state, metadata.name)) {
    throw new Error(`PULSE already exists: ${metadata.name}`)
  }

  await confirmAfterLoad(metadata.name, metadata.kind, metadata.schedule, prompts.confirmPrompt)
  await updateState(paths.statePath, paths.lockPath, async current => {
    current.installed[metadata.name] = metadataToInstalledPulse(metadata)
    return current
  })

  const lines = [`Installed ${metadata.name}`, `kind: ${metadata.kind}`, `source: ${absolutePath}`]
  if (metadata.kind !== 'manual' && (await askEnableNow(metadata.name, prompts.confirmPrompt))) {
    await ensureDaemon(home)
    await requestDaemon(home, { command: 'enable', name: metadata.name })
    lines.push(`enabled: yes`)
  }

  return lines.join('\n')
}

export async function updateCustomPulse(home: string, name: string, prompts: PromptOverrides = {}): Promise<string> {
  const paths = resolvePulsePaths(home)
  const state = await readState(paths.statePath)
  const installed = state.installed[name]
  if (!installed) {
    throw new Error(`Custom PULSE is not installed: ${name}`)
  }

  const sha256 = await hashFile(installed.source.path)
  await confirmBeforeImport(`Import ${installed.source.path} (${sha256})?`, prompts.confirmPrompt)
  const metadata = await loadCustomPulseMetadata(installed.source.path, sha256)
  if (metadata.name !== name) {
    throw new Error(`PULSE update cannot rename ${name} to ${metadata.name}`)
  }

  await confirmAfterLoad(metadata.name, metadata.kind, metadata.schedule, prompts.confirmPrompt)
  await updateState(paths.statePath, paths.lockPath, async current => {
    const enabled = current.enabled[name]
    current.installed[name] = {
      ...metadataToInstalledPulse(metadata),
      installedAt: installed.installedAt,
      updatedAt: new Date().toISOString()
    }
    if (enabled) {
      current.enabled[name] = {
        ...enabled,
        kind: metadata.kind
      }
    }
    return current
  })

  const lines = [`Updated ${name}`]
  if (state.enabled[name] && metadata.kind === 'scheduled' && (await isDaemonRunning(home))) {
    await requestDaemon(home, { command: 'reload', name })
    lines.push('reloaded: yes')
  }

  return lines.join('\n')
}

export async function uninstallCustomPulse(home: string, name: string, prompts: PromptOverrides = {}): Promise<string> {
  const paths = resolvePulsePaths(home)
  const state = await readState(paths.statePath)
  if (!state.installed[name]) {
    throw new Error(`Custom PULSE is not installed: ${name}`)
  }

  if (state.enabled[name]) {
    await confirmEnabledUninstall(name, prompts.confirmPrompt)
    if (await isDaemonRunning(home)) {
      await requestDaemon(home, { command: 'disable', name })
    }
  }

  await updateState(paths.statePath, paths.lockPath, async current => {
    delete current.enabled[name]
    delete current.installed[name]
    return current
  })

  return `Uninstalled ${name}`
}

export async function listEnabled(home: string): Promise<string> {
  if (await isDaemonRunning(home)) {
    const data = (await requestDaemon(home, { command: 'list' })) as Array<{
      enabled: boolean
      kind: PulseKind
      name: string
      status: string
    }>
    return data
      .filter(item => item.enabled)
      .map(item => `${item.name}\t${item.kind}\t${item.status}`)
      .join('\n')
  }

  const [state, runtime] = await Promise.all([
    readState(resolvePulsePaths(home).statePath),
    readRuntime(resolvePulsePaths(home).runtimePath)
  ])
  const lines = Object.entries(state.enabled).map(([name, enabled]) => {
    const status = runtime?.pulses[name]?.status ?? 'daemon: stopped'
    return `${name}\t${enabled.kind}\t${status}`
  })
  return lines.join('\n')
}

export async function statusPulse(home: string, name: string): Promise<string> {
  if (await isDaemonRunning(home)) {
    const data = (await requestDaemon(home, { command: 'status', name })) as {
      enabled: boolean
      pulse: string[]
      runtime?: Record<string, unknown>
    }
    return [...data.pulse, `enabled: ${data.enabled ? 'yes' : 'no'}`, `runtime: ${formatObject(data.runtime)}`].join(
      '\n'
    )
  }

  const state = await readState(resolvePulsePaths(home).statePath)
  const pulse = resolveCatalogPulse(state, name)
  const status = await catalogPulseStatus(pulse)
  return [...status, `enabled: ${state.enabled[name] ? 'yes' : 'no'}`, 'daemon: stopped'].join('\n')
}

export async function runPulse(home: string, target: string): Promise<string> {
  if (looksLikeFile(target)) {
    const run = await startManagedRun(home, 'file', resolve(target), `file-${Date.now()}`)
    const result = await run.result
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `PULSE file exited with ${result.exitCode}`)
    }

    return [result.stdout.trimEnd(), result.stderr.trimEnd()].filter(Boolean).join('\n')
  }

  await ensureDaemon(home)
  const result = (await requestDaemon(home, { command: 'run', name: target })) as {
    exitCode: number | null
    stderr: string
    stdout: string
  }
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `PULSE exited with ${result.exitCode}`)
  }

  return [result.stdout.trimEnd(), result.stderr.trimEnd()].filter(Boolean).join('\n')
}

export async function enablePulse(home: string, name: string): Promise<string> {
  await ensureDaemon(home)
  await requestDaemon(home, { command: 'enable', name })
  return `Enabled ${name}`
}

export async function disablePulse(home: string, name: string): Promise<string> {
  await ensureDaemon(home)
  await requestDaemon(home, { command: 'disable', name })
  return `Disabled ${name}`
}

export async function reloadPulse(home: string, name: string): Promise<string> {
  await ensureDaemon(home)
  await requestDaemon(home, { command: 'reload', name })
  return `Reloaded ${name}`
}

export async function logs(home: string, name?: string): Promise<string> {
  if (name) {
    return readPulseLogs(home, name)
  }

  const state = await readState(resolvePulsePaths(home).statePath)
  const pulseLogs = await Promise.all(listCatalogPulses(state).map(pulse => readPulseLogs(home, pulse.name)))
  return pulseLogs.join('\n\n')
}

async function confirmBeforeImport(message: string, confirmPrompt = confirm): Promise<void> {
  if (!canPrompt(confirmPrompt)) {
    throw new Error('Refusing to import custom PULSE in non-interactive terminal')
  }

  log.warn('Importing a custom PULSE executes its module top-level code.')
  const answer = await confirmPrompt({ active: 'Import', inactive: 'Cancel', initialValue: false, message })
  if (isCancel(answer)) {
    cancel('Cancelled')
    throw new Error('Cancelled')
  }

  if (!answer) {
    throw new Error('Cancelled')
  }
}

async function confirmAfterLoad(
  name: string,
  kind: PulseKind,
  schedule: string | undefined,
  confirmPrompt = confirm
): Promise<void> {
  const details = [`name: ${name}`, `kind: ${kind}`, ...(schedule ? [`schedule: ${schedule}`] : [])].join('\n')
  log.info(details)
  const answer = await confirmPrompt({
    active: 'Install',
    inactive: 'Cancel',
    initialValue: true,
    message: 'Install this PULSE?'
  })
  if (isCancel(answer)) {
    cancel('Cancelled')
    throw new Error('Cancelled')
  }

  if (!answer) {
    throw new Error('Cancelled')
  }
}

async function askEnableNow(name: string, confirmPrompt = confirm): Promise<boolean> {
  const answer = await confirmPrompt({
    active: 'Enable',
    inactive: 'Skip',
    initialValue: false,
    message: `Enable ${name} now?`
  })
  return answer === true
}

async function confirmEnabledUninstall(name: string, confirmPrompt = confirm): Promise<void> {
  if (!canPrompt(confirmPrompt)) {
    throw new Error(`Refusing to uninstall enabled PULSE in non-interactive terminal: ${name}`)
  }

  const answer = await confirmPrompt({
    active: 'Disable and uninstall',
    inactive: 'Cancel',
    initialValue: false,
    message: `${name} is enabled. Disable and uninstall it?`
  })
  if (isCancel(answer) || !answer) {
    throw new Error('Cancelled')
  }
}

function canPrompt(confirmPrompt: ConfirmPrompt): boolean {
  return confirmPrompt !== confirm || (isTTY(process.stdout) && process.stdin.isTTY !== false)
}

function looksLikeFile(target: string): boolean {
  return target.includes('/') || target.endsWith('.ts') || target.endsWith('.js')
}

function formatObject(value: unknown): string {
  return value ? JSON.stringify(value) : 'none'
}
