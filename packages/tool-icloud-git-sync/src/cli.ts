#!/usr/bin/env bun
/**
 * iCloud Git Sync CLI (PM2 daemon version)
 *
 * Usage:
 *   icloud-git-sync start --icloud <path> --repo <path>
 */
import { parseArgs } from 'node:util'

import { start } from './start'

const _HELP = `
iCloud Git Sync - Sync iCloud with Git using worktree isolation

Usage:
  icloud-git-sync start --icloud <path> --repo <path>

Options:
  --icloud <path>   iCloud directory path (required)
  --repo <path>     Git repository path (required)

Example:
  icloud-git-sync start --icloud "~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Attic" --repo ~/Documents/atlas

Process Management:
  Use PM2 to manage the process:
    pm2 start ecosystem.config.cjs
    pm2 stop atlas-icloud-sync
    pm2 logs atlas-icloud-sync
    pm2 restart atlas-icloud-sync
`

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '-h' || command === '--help') {
    process.exit(0)
  }

  if (command !== 'start') {
    console.error(`Unknown command: ${command}`)
    console.error("Only 'start' command is available. Use PM2 for process management.")
    process.exit(1)
  }

  const commandArgs = args.slice(1)

  // Check for help flag in start command
  if (commandArgs.includes('-h') || commandArgs.includes('--help')) {
    process.exit(0)
  }

  const { values } = parseArgs({
    args: commandArgs,
    options: {
      icloud: { type: 'string' },
      repo: { type: 'string' }
    },
    allowPositionals: false
  })

  if (!values.icloud || !values.repo) {
    console.error('Error: --icloud and --repo are required')
    console.error("Run 'icloud-git-sync start --help' for usage")
    process.exit(1)
  }

  await start({
    icloudPath: values.icloud,
    repoPath: values.repo
  })
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
