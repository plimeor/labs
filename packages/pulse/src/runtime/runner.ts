#!/usr/bin/env bun
import { resolveCatalogPulse } from '../pulses/catalog'
import { hashFile, importCustomPulse, metadataFromModule } from '../pulses/loader'
import { resolvePulsePaths } from '../store/paths'
import { readState } from '../store/state'

const [mode, value] = process.argv.slice(2)

try {
  if (mode === 'installed') {
    await runInstalledPulse(requireValue(value, 'PULSE name'))
  } else if (mode === 'file') {
    await runFilePulse(requireValue(value, 'PULSE file'))
  } else {
    throw new Error('Usage: pulse runner installed <name> | file <path>')
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}

async function runInstalledPulse(name: string): Promise<void> {
  const paths = resolvePulsePaths()
  const state = await readState(paths.statePath)
  const pulse = resolveCatalogPulse(state, name)

  if (pulse.builtIn) {
    const module = (await importCustomPulse(pulse.source.path)) as { run?: unknown }
    metadataFromModule(module, pulse.source)
    await requireRun(module.run)()
    return
  }

  const currentHash = await hashFile(pulse.source.path)
  if (currentHash !== pulse.source.sha256) {
    throw new Error(`Custom PULSE source changed: ${name}. Run pulse update ${name}.`)
  }

  const module = (await importCustomPulse(pulse.source.path, { fresh: true })) as { run?: unknown }
  await requireRun(module.run)()
}

async function runFilePulse(path: string): Promise<void> {
  const sha256 = await hashFile(path)
  const module = await importCustomPulse(path, { fresh: true })
  metadataFromModule(module, {
    path,
    sha256,
    type: 'file'
  })
  await requireRun((module as { run?: unknown }).run)()
}

function requireRun(value: unknown): () => Promise<void> | void {
  if (typeof value !== 'function') {
    throw new Error('PULSE entry must export function run()')
  }

  return value as () => Promise<void> | void
}

function requireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing ${label}`)
  }

  return value
}
