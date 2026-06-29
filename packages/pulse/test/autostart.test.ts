import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { installDaemonAutostart, uninstallDaemonAutostart } from '../src/runtime/autostart'
import { daemonScriptPath } from '../src/store/paths'

type CommandResult = {
  exitCode: number
  stderr: string
  stdout: string
}

describe('daemon autostart', () => {
  test('writes a launchd plist and bootstraps it with modern launchctl commands', async () => {
    const dir = await tempDir()
    const env = { HOME: join(dir, 'user'), PATH: '/usr/bin:/bin' }
    const pulseHome = join(dir, 'pulse & home')
    const commands: string[][] = []
    const runCommand = async (command: readonly string[]): Promise<CommandResult> => {
      commands.push([...command])
      if (command[0] === 'launchctl' && command[1] === 'bootout') {
        return { exitCode: 113, stderr: 'Boot-out failed: 113: Could not find specified service', stdout: '' }
      }

      return { exitCode: 0, stderr: '', stdout: '' }
    }

    const plistPath = await installDaemonAutostart(pulseHome, {
      env,
      platform: 'darwin',
      runCommand,
      uid: 501
    })

    expect(plistPath).toBe(join(env.HOME, 'Library', 'LaunchAgents', 'com.plimeor.pulse.plist'))
    expect(commands).toEqual([
      ['plutil', '-lint', plistPath],
      ['launchctl', 'bootout', 'gui/501/com.plimeor.pulse'],
      ['launchctl', 'bootstrap', 'gui/501', plistPath],
      ['launchctl', 'enable', 'gui/501/com.plimeor.pulse'],
      ['launchctl', 'kickstart', '-k', 'gui/501/com.plimeor.pulse'],
      ['launchctl', 'print', 'gui/501/com.plimeor.pulse']
    ])

    const plist = await readFile(plistPath, 'utf8')
    expect(plist).toContain('<string>com.plimeor.pulse</string>')
    expect(plist).toContain(`<string>${process.execPath}</string>`)
    expect(plist).toContain(`<string>${daemonScriptPath()}</string>`)
    expect(plist).toContain('<string>--home</string>')
    expect(plist).toContain(`<string>${pulseHome.replaceAll('&', '&amp;')}</string>`)
    expect(plist).toContain('<key>SuccessfulExit</key>')
    expect(plist).toContain('<false/>')
    expect(plist).toContain('<key>EnvironmentVariables</key>')
    expect(plist).toContain('<key>HOME</key>')
    expect(plist).toContain(`<string>${env.HOME}</string>`)
    expect(plist).toContain('<key>PULSE_HOME</key>')
    expect(plist).toContain('/usr/bin:/bin')
    expect(plist).toContain(dirname(process.execPath))
    expect(plist).not.toContain('/bin/sh')
    expect(plist).not.toContain('OnDemand')
    expect(plist).not.toContain('LaunchOnlyOnce')
    expect(plist).not.toContain('UserName')
  })

  test('bootouts before removing the launchd plist', async () => {
    const dir = await tempDir()
    const env = { HOME: join(dir, 'user'), PATH: '/usr/bin:/bin' }
    const plistPath = join(env.HOME, 'Library', 'LaunchAgents', 'com.plimeor.pulse.plist')
    await mkdir(join(env.HOME, 'Library', 'LaunchAgents'), { recursive: true })
    await writeFile(plistPath, '<plist/>')
    const commands: string[][] = []

    const result = await uninstallDaemonAutostart({
      env,
      platform: 'darwin',
      uid: 501,
      runCommand: async command => {
        commands.push([...command])
        return { exitCode: 0, stderr: '', stdout: '' }
      }
    })

    expect(result).toBe(plistPath)
    expect(commands).toEqual([['launchctl', 'bootout', 'gui/501/com.plimeor.pulse']])
    await expect(readFile(plistPath, 'utf8')).rejects.toThrow()
  })
})

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pulse-autostart-test-'))
}
