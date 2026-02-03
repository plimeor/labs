import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = resolve(__dirname, '..', 'oxfmtrc.json')

// Walk up to find the project root (where package.json is, outside node_modules)
function findProjectRoot() {
  let dir = resolve(__dirname, '..')

  // If we're inside node_modules, walk up past it
  while (dir.includes('node_modules')) {
    dir = dirname(dir)
  }

  // Now find the nearest package.json
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, 'package.json'))) {
      return dir
    }
    dir = dirname(dir)
  }

  return null
}

const projectRoot = findProjectRoot()

if (!projectRoot) {
  console.warn('[@plimeor-labs/oxfmt-config] Could not find project root, skipping config copy.')
  process.exit(0)
}

const target = resolve(projectRoot, '.oxfmtrc.json')

const config = JSON.parse(readFileSync(source, 'utf-8'))

// Add $schema if oxfmt is installed locally
if (existsSync(resolve(projectRoot, 'node_modules/oxfmt/configuration_schema.json'))) {
  config.$schema = './node_modules/oxfmt/configuration_schema.json'
}

writeFileSync(target, JSON.stringify(config, null, 2) + '\n')
console.log(`[@plimeor-labs/oxfmt-config] Applied oxfmt config to ${target}`)
