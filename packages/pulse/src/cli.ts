#!/usr/bin/env bun
import { defineCli, defineCommand, defineGroup } from '@plimeor/command-kit'
import * as v from 'valibot'

import {
  available,
  disablePulse,
  enablePulse,
  installCustomPulse,
  listEnabled,
  logs,
  reloadPulse,
  runPulse,
  statusPulse,
  uninstallCustomPulse,
  updateCustomPulse
} from './manager'
import {
  getDaemonAutostartStatus,
  installDaemonAutostart,
  isDaemonAutostartInstalled,
  startDaemonAutostart,
  stopDaemonAutostart,
  uninstallDaemonAutostart
} from './runtime/autostart'
import {
  ensureDaemon,
  isDaemonRunning,
  requestDaemon,
  waitForDaemonRunning,
  waitForDaemonStopped
} from './runtime/daemon'
import { resolvePulseHome } from './store/paths'

const nameArgs = v.object({
  name: v.string()
})

const optionalNameArgs = v.object({
  name: v.optional(v.string())
})

const fileArgs = v.object({
  file: v.string()
})

const targetArgs = v.object({
  target: v.string()
})

const pulseHome = resolvePulseHome()

const cli = defineCli({
  description: 'Manage local PULSE jobs with Bun',
  name: 'pulse',
  commands: [
    defineCommand('install', {
      argBindings: [{ name: 'file' }],
      args: fileArgs,
      description: 'Install a custom PULSE from a local Bun file',
      run: async context => print(await installCustomPulse(pulseHome, context.args.file))
    }),
    defineCommand('uninstall', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Uninstall a custom PULSE',
      run: async context => print(await uninstallCustomPulse(pulseHome, context.args.name))
    }),
    defineCommand('update', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Update an installed custom PULSE after its entry file changes',
      run: async context => print(await updateCustomPulse(pulseHome, context.args.name))
    }),
    defineCommand('available', {
      description: 'List built-in and installed custom PULSEs',
      run: async () => print(await available(pulseHome))
    }),
    defineCommand('list', {
      description: 'List enabled PULSEs',
      run: async () => print(await listEnabled(pulseHome))
    }),
    defineCommand('enable', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Enable a scheduled PULSE',
      run: async context => print(await enablePulse(pulseHome, context.args.name))
    }),
    defineCommand('disable', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Disable a PULSE and stop its active runtime',
      run: async context => print(await disablePulse(pulseHome, context.args.name))
    }),
    defineCommand('reload', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Reload a PULSE definition and reconcile daemon runtime',
      run: async context => print(await reloadPulse(pulseHome, context.args.name))
    }),
    defineCommand('status', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Show PULSE catalog and runtime status',
      run: async context => print(await statusPulse(pulseHome, context.args.name))
    }),
    defineCommand('logs', {
      aliases: ['log'],
      argBindings: [{ name: 'name', optional: true }],
      args: optionalNameArgs,
      description: 'Show captured stdout/stderr logs',
      run: async context => print(await logs(pulseHome, context.args.name))
    }),
    defineCommand('run', {
      argBindings: [{ name: 'target' }],
      args: targetArgs,
      description: 'Run an installed PULSE or local Bun file once',
      run: async context => print(await runPulse(pulseHome, context.args.target))
    }),
    defineGroup('daemon', {
      description: 'Manage the pulse daemon process',
      commands: [
        defineCommand('start', {
          description: 'Start the pulse daemon',
          run: async () => {
            await ensureDaemon(pulseHome)
            print('daemon: running')
          }
        }),
        defineCommand('stop', {
          description: 'Stop the pulse daemon',
          run: async () => {
            if (await useAutostartForHome()) {
              await stopDaemonAutostart()
              await waitForDaemonStopped(pulseHome)
            } else if (await isDaemonRunning(pulseHome)) {
              await requestDaemon(pulseHome, { command: 'stop' })
              await waitForDaemonStopped(pulseHome)
            }
            print('daemon: stopped')
          }
        }),
        defineCommand('restart', {
          description: 'Restart the pulse daemon',
          run: async () => {
            if (await useAutostartForHome()) {
              await startDaemonAutostart()
              await waitForDaemonRunning(pulseHome)
            } else {
              if (await isDaemonRunning(pulseHome)) {
                await requestDaemon(pulseHome, { command: 'stop' })
                await waitForDaemonStopped(pulseHome)
              }
              await ensureDaemon(pulseHome)
            }
            print('daemon: restarted')
          }
        }),
        defineCommand('status', {
          description: 'Show daemon status',
          run: async () => {
            print(await daemonStatus())
          }
        }),
        defineCommand('install', {
          description: 'Install user-level daemon autostart',
          run: async () => {
            if (await isDaemonRunning(pulseHome)) {
              await requestDaemon(pulseHome, { command: 'stop' })
              await waitForDaemonStopped(pulseHome)
            }
            const plistPath = await installDaemonAutostart(pulseHome)
            await waitForDaemonRunning(pulseHome)
            print(`Installed daemon autostart: ${plistPath}`)
          }
        }),
        defineCommand('uninstall', {
          description: 'Uninstall user-level daemon autostart',
          run: async () => {
            const matchesHome = await useAutostartForHome()
            const plistPath = await uninstallDaemonAutostart()
            if (matchesHome) {
              await waitForDaemonStopped(pulseHome)
            }
            print(`Uninstalled daemon autostart: ${plistPath}`)
          }
        })
      ]
    })
  ]
})

await cli.serve(process.argv.slice(2))

function print(text: string): void {
  if (text) {
    process.stdout.write(`${text}\n`)
  }
}

async function daemonStatus(): Promise<string> {
  const running = await isDaemonRunning(pulseHome)
  const lines = [`daemon: ${running ? 'running' : 'stopped'}`]
  if (process.platform === 'darwin') {
    const status = await getDaemonAutostartStatus(pulseHome)
    lines.push(`autostart: ${autostartLabel(status)}`)
    lines.push(`launchd: ${status.loaded ? 'loaded' : 'not loaded'}`)
  }

  return lines.join('\n')
}

function autostartLabel(status: { installed: boolean; installedForHome: boolean }): string {
  if (!status.installed) {
    return 'not installed'
  }

  return status.installedForHome ? 'installed' : 'installed (different PULSE_HOME)'
}

async function useAutostartForHome(): Promise<boolean> {
  return process.platform === 'darwin' && (await isDaemonAutostartInstalled(pulseHome))
}
