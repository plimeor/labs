import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'

import { daemonScriptPath, resolvePulsePaths } from '../store/paths'

const LABEL = 'com.plimeor.pulse'

type CommandResult = {
  exitCode: number
  stderr: string
  stdout: string
}

type CommandRunner = (command: readonly string[]) => Promise<CommandResult>

type DaemonAutostartOptions = {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  runCommand?: CommandRunner
  uid?: number
}

export async function installDaemonAutostart(home: string, options: DaemonAutostartOptions = {}): Promise<string> {
  assertDarwin(options)

  const plistPath = launchAgentPath(options.env)
  const paths = resolvePulsePaths(home)
  await Promise.all([mkdir(dirname(plistPath), { recursive: true }), mkdir(paths.logDir, { recursive: true })])
  await writeFile(plistPath, launchAgentPlist(home, options))
  await chmod(plistPath, 0o644)
  await loadDaemonAutostart(options, { unloadFirst: true })
  return plistPath
}

export async function uninstallDaemonAutostart(options: DaemonAutostartOptions = {}): Promise<string> {
  assertDarwin(options)

  const plistPath = launchAgentPath(options.env)
  await stopDaemonAutostart(options)
  await rm(plistPath, { force: true })
  return plistPath
}

export async function startDaemonAutostart(options: DaemonAutostartOptions = {}): Promise<void> {
  assertDarwin(options)
  await loadDaemonAutostart(options, { unloadFirst: false })
}

export async function stopDaemonAutostart(options: DaemonAutostartOptions = {}): Promise<void> {
  assertDarwin(options)
  const command = ['launchctl', 'bootout', serviceTarget(options)]
  const result = await commandRunner(options)(command)
  if (result.exitCode !== 0 && !isMissingLaunchdService(result)) {
    throw commandError(command, result)
  }
}

export async function getDaemonAutostartStatus(home: string, options: DaemonAutostartOptions = {}) {
  assertDarwin(options)
  const plist = await readLaunchAgentPlist(options.env)
  const result = await commandRunner(options)(['launchctl', 'print', serviceTarget(options)])
  return {
    installed: plist !== undefined,
    installedForHome: plist !== undefined && plistTargetsHome(plist, home),
    loaded: result.exitCode === 0
  }
}

export async function isDaemonAutostartInstalled(home: string, options: DaemonAutostartOptions = {}): Promise<boolean> {
  if (platform(options) !== 'darwin') {
    return false
  }

  const plist = await readLaunchAgentPlist(options.env)
  return plist !== undefined && plistTargetsHome(plist, home)
}

async function readLaunchAgentPlist(env = process.env): Promise<string | undefined> {
  try {
    return await readFile(launchAgentPath(env), 'utf8')
  } catch {
    return undefined
  }
}

function plistTargetsHome(plist: string, home: string): boolean {
  // code-lean: string-match our own plist, upgrade when third-party plist edits must be parsed structurally.
  return plist.includes(`<string>${escapeXml(home)}</string>`)
}

function launchAgentPlist(home: string, options: DaemonAutostartOptions): string {
  const paths = resolvePulsePaths(home)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
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
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${escapeXml(userHome(options.env))}</string>
    <key>PATH</key>
    <string>${escapeXml(pathWithExecPath(options))}</string>
    <key>PULSE_HOME</key>
    <string>${escapeXml(home)}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(paths.logDir, 'daemon-out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(paths.logDir, 'daemon-error.log'))}</string>
</dict>
</plist>
`
}

async function loadDaemonAutostart(
  options: DaemonAutostartOptions,
  { unloadFirst }: { unloadFirst: boolean }
): Promise<void> {
  const runner = commandRunner(options)
  const plistPath = launchAgentPath(options.env)
  await runRequired(runner, ['plutil', '-lint', plistPath])

  if (unloadFirst) {
    await stopDaemonAutostart(options)
  } else {
    const current = await runner(['launchctl', 'print', serviceTarget(options)])
    if (current.exitCode === 0) {
      await runRequired(runner, ['launchctl', 'enable', serviceTarget(options)])
      await runRequired(runner, ['launchctl', 'kickstart', '-k', serviceTarget(options)])
      await runRequired(runner, ['launchctl', 'print', serviceTarget(options)])
      return
    }
  }

  await runRequired(runner, ['launchctl', 'bootstrap', domainTarget(options), plistPath])
  await runRequired(runner, ['launchctl', 'enable', serviceTarget(options)])
  await runRequired(runner, ['launchctl', 'kickstart', '-k', serviceTarget(options)])
  await runRequired(runner, ['launchctl', 'print', serviceTarget(options)])
}

async function runRequired(runner: CommandRunner, command: readonly string[]): Promise<CommandResult> {
  const result = await runner(command)
  if (result.exitCode !== 0) {
    throw commandError(command, result)
  }

  return result
}

async function defaultCommandRunner(command: readonly string[]): Promise<CommandResult> {
  const subprocess = Bun.spawn({
    cmd: [...command],
    stderr: 'pipe',
    stdout: 'pipe'
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text()
  ])
  return { exitCode, stderr, stdout }
}

function commandRunner(options: DaemonAutostartOptions): CommandRunner {
  return options.runCommand ?? defaultCommandRunner
}

function commandError(command: readonly string[], result: CommandResult): Error {
  const details = [
    `Command failed (${result.exitCode}): ${formatCommand(command)}`,
    result.stdout ? `stdout: ${result.stdout.trimEnd()}` : '',
    result.stderr ? `stderr: ${result.stderr.trimEnd()}` : ''
  ].filter(Boolean)
  return new Error(details.join('\n'))
}

function domainTarget(options: DaemonAutostartOptions): string {
  return `gui/${uid(options)}`
}

function serviceTarget(options: DaemonAutostartOptions): string {
  return `${domainTarget(options)}/${LABEL}`
}

function uid(options: DaemonAutostartOptions): number {
  const current = options.uid ?? process.getuid?.()
  if (current === undefined) {
    throw new Error('User id is required to manage daemon autostart')
  }

  return current
}

function pathWithExecPath(options: DaemonAutostartOptions): string {
  const execDir = dirname(process.execPath)
  const entries = (options.env?.PATH ?? process.env.PATH ?? '').split(delimiter).filter(Boolean)
  if (!entries.includes(execDir)) {
    entries.push(execDir)
  }

  return entries.join(delimiter)
}

function launchAgentPath(env = process.env): string {
  const home = userHome(env)
  return join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`)
}

function userHome(env = process.env): string {
  if (!env.HOME) {
    throw new Error('HOME is required to install daemon autostart')
  }

  return env.HOME
}

function assertDarwin(options: DaemonAutostartOptions): void {
  const current = platform(options)
  if (current !== 'darwin') {
    throw new Error(`Daemon autostart is unsupported on ${current}`)
  }
}

function platform(options: DaemonAutostartOptions): NodeJS.Platform {
  return options.platform ?? process.platform
}

function isMissingLaunchdService(result: CommandResult): boolean {
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase()
  return (
    text.includes('could not find service') ||
    text.includes('could not find specified service') ||
    text.includes('service is not loaded') ||
    text.includes('no such process')
  )
}

function formatCommand(command: readonly string[]): string {
  return command.map(part => JSON.stringify(part)).join(' ')
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
