import type { InstalledPulseState, PulseState } from '../store/state'
import { builtInPulses } from './index'
import type { CustomPulseMetadata } from './loader'
import { hashFile } from './loader'
import type { LoadedPulse, PulseKind } from './types'

export type CatalogPulse =
  | (LoadedPulse & {
      builtIn: true
    })
  | {
      builtIn: false
      kind: PulseKind
      name: string
      schedule?: string
      source: {
        path: string
        sha256: string
        type: 'file'
      }
    }

export function listCatalogPulses(state: PulseState): CatalogPulse[] {
  return [...builtInPulses.map(toBuiltInCatalogPulse), ...listInstalledPulses(state)]
}

export function listInstalledPulses(state: PulseState): CatalogPulse[] {
  return Object.values(state.installed).map(installed => installedPulseToCatalog(installed))
}

export function resolveCatalogPulse(state: PulseState, name: string): CatalogPulse {
  const pulse = listCatalogPulses(state).find(candidate => candidate.name === name)
  if (!pulse) {
    throw new Error(
      `Unknown PULSE: ${name}. Available: ${listCatalogPulses(state)
        .map(item => item.name)
        .join(', ')}`
    )
  }

  return pulse
}

export function hasPulseName(state: PulseState, name: string): boolean {
  return listCatalogPulses(state).some(pulse => pulse.name === name)
}

export function metadataToInstalledPulse(metadata: CustomPulseMetadata, now = new Date()): InstalledPulseState {
  return {
    installedAt: now.toISOString(),
    kind: metadata.kind,
    name: metadata.name,
    schedule: metadata.schedule,
    source: metadata.source
  }
}

export async function catalogPulseStatus(pulse: CatalogPulse): Promise<string[]> {
  return [
    pulse.name,
    `kind: ${pulse.kind}`,
    ...(pulse.schedule ? [`schedule: ${pulse.schedule}`] : []),
    `source: ${pulse.source.path}`,
    ...(pulse.source.type === 'file'
      ? [`sha256: ${pulse.source.sha256}`, `changed: ${(await isCustomEntryChanged(pulse)) ? 'yes' : 'no'}`]
      : [])
  ]
}

export async function isCustomEntryChanged(pulse: CatalogPulse): Promise<boolean> {
  if (pulse.source.type !== 'file') {
    return false
  }

  // code-lean: entry-file hash only, upgrade when custom PULSEs need transitive import integrity.
  return (await hashFile(pulse.source.path)) !== pulse.source.sha256
}

function installedPulseToCatalog(installed: InstalledPulseState): CatalogPulse {
  return {
    builtIn: false,
    kind: installed.kind,
    name: installed.name,
    schedule: installed.schedule,
    source: installed.source
  }
}

function toBuiltInCatalogPulse(pulse: (typeof builtInPulses)[number]): CatalogPulse {
  return {
    builtIn: true,
    kind: pulse.kind,
    name: pulse.name,
    schedule: pulse.schedule,
    source: pulse.source
  }
}
