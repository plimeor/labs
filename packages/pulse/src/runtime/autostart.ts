import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { daemonScriptPath, resolvePulsePaths } from '../store/paths'

export async function installDaemonAutostart(home: string): Promise<string> {
  if (process.platform !== 'darwin') {
    throw new Error(`Daemon autostart is unsupported on ${process.platform}`)
  }

  const plistPath = launchAgentPath()
  const paths = resolvePulsePaths(home)
  await Promise.all([mkdir(dirname(plistPath), { recursive: true }), mkdir(paths.logDir, { recursive: true })])
  await writeFile(
    plistPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.plimeor.pulse</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(process.execPath)}</string>
    <string>${escapeXml(daemonScriptPath())}</string>
    <string>--home</string>
    <string>${escapeXml(home)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(paths.logDir, 'daemon-out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(paths.logDir, 'daemon-error.log'))}</string>
</dict>
</plist>
`
  )
  return plistPath
}

export async function uninstallDaemonAutostart(): Promise<string> {
  if (process.platform !== 'darwin') {
    throw new Error(`Daemon autostart is unsupported on ${process.platform}`)
  }

  const plistPath = launchAgentPath()
  await rm(plistPath, { force: true })
  return plistPath
}

function launchAgentPath(): string {
  if (!process.env.HOME) {
    throw new Error('HOME is required to install daemon autostart')
  }

  return join(process.env.HOME, 'Library', 'LaunchAgents', 'com.plimeor.pulse.plist')
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
