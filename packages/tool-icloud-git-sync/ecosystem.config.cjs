require('dotenv').config()

// Environment variable validation
if (!process.env.ICLOUD_PATH || !process.env.REPO_PATH) {
  throw new Error('Missing required environment variables: ICLOUD_PATH and REPO_PATH')
}

// Expand ~ in path
function expandHome(path) {
  if (path.startsWith('~')) {
    const os = require('os')
    const home = process.env.HOME || os.homedir()
    return home + path.slice(1)
  }
  return path
}

const ICLOUD_PATH = expandHome(process.env.ICLOUD_PATH)
const REPO_PATH = expandHome(process.env.REPO_PATH)

module.exports = {
  apps: [
    {
      name: 'atlas-icloud-sync',
      script: '/opt/homebrew/bin/bun',
      args: ['run', 'src/cli.ts', 'start', '--icloud', ICLOUD_PATH, '--repo', REPO_PATH],
      cwd: __dirname,
    },
  ],
}
