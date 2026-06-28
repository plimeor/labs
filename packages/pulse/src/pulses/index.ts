import { readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadPulseFile, type PulseImportOptions } from './loader'
import type { LoadedPulse } from './types'

export const builtInPulseDirectory = fileURLToPath(new URL('./builtin', import.meta.url))

export let builtInPulses = await loadBuiltInPulses()

export async function reloadBuiltInPulses(directory = builtInPulseDirectory): Promise<LoadedPulse[]> {
  builtInPulses = await loadBuiltInPulses(directory, { fresh: true })
  return builtInPulses
}

export async function loadBuiltInPulses(
  directory = builtInPulseDirectory,
  options: PulseImportOptions = {}
): Promise<LoadedPulse[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = entries
    .filter(entry => entry.isFile() && isPulseFile(entry.name))
    .map(entry => join(directory, entry.name))
    .sort()

  return Promise.all(
    files.map(path =>
      loadPulseFile(
        path,
        {
          path,
          type: 'builtin'
        },
        options
      )
    )
  )
}

function isPulseFile(name: string): boolean {
  return ['.js', '.ts'].includes(extname(name)) && !name.endsWith('.d.ts')
}
