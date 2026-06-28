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
import { installDaemonAutostart, uninstallDaemonAutostart } from './runtime/autostart'
import { ensureDaemon, isDaemonRunning, requestDaemon } from './runtime/daemon'
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

const cli = defineCli({
  description: 'Manage local PULSE jobs with Bun',
  name: 'pulse',
  commands: [
    defineCommand('install', {
      argBindings: [{ name: 'file' }],
      args: fileArgs,
      description: 'Install a custom PULSE from a local Bun file',
      run: async context => print(await installCustomPulse(home(), context.args.file))
    }),
    defineCommand('uninstall', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Uninstall a custom PULSE',
      run: async context => print(await uninstallCustomPulse(home(), context.args.name))
    }),
    defineCommand('update', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Update an installed custom PULSE after its entry file changes',
      run: async context => print(await updateCustomPulse(home(), context.args.name))
    }),
    defineCommand('available', {
      description: 'List built-in and installed custom PULSEs',
      run: async () => print(await available(home()))
    }),
    defineCommand('list', {
      description: 'List enabled PULSEs',
      run: async () => print(await listEnabled(home()))
    }),
    defineCommand('enable', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Enable a scheduled PULSE',
      run: async context => print(await enablePulse(home(), context.args.name))
    }),
    defineCommand('disable', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Disable a PULSE and stop its active runtime',
      run: async context => print(await disablePulse(home(), context.args.name))
    }),
    defineCommand('reload', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Reload a PULSE definition and reconcile daemon runtime',
      run: async context => print(await reloadPulse(home(), context.args.name))
    }),
    defineCommand('status', {
      argBindings: [{ name: 'name' }],
      args: nameArgs,
      description: 'Show PULSE catalog and runtime status',
      run: async context => print(await statusPulse(home(), context.args.name))
    }),
    defineCommand('logs', {
      aliases: ['log'],
      argBindings: [{ name: 'name', optional: true }],
      args: optionalNameArgs,
      description: 'Show captured stdout/stderr logs',
      run: async context => print(await logs(home(), context.args.name))
    }),
    defineCommand('run', {
      argBindings: [{ name: 'target' }],
      args: targetArgs,
      description: 'Run an installed PULSE or local Bun file once',
      run: async context => print(await runPulse(home(), context.args.target))
    }),
    defineGroup('daemon', {
      description: 'Manage the pulse daemon process',
      commands: [
        defineCommand('start', {
          description: 'Start the pulse daemon',
          run: async () => {
            await ensureDaemon(home())
            print('daemon: running')
          }
        }),
        defineCommand('stop', {
          description: 'Stop the pulse daemon',
          run: async () => {
            if (await isDaemonRunning(home())) {
              await requestDaemon(home(), { command: 'stop' })
            }
            print('daemon: stopped')
          }
        }),
        defineCommand('restart', {
          description: 'Restart the pulse daemon',
          run: async () => {
            if (await isDaemonRunning(home())) {
              await requestDaemon(home(), { command: 'stop' })
              await Bun.sleep(250)
            }
            await ensureDaemon(home())
            print('daemon: restarted')
          }
        }),
        defineCommand('status', {
          description: 'Show daemon status',
          run: async () => {
            print((await isDaemonRunning(home())) ? 'daemon: running' : 'daemon: stopped')
          }
        }),
        defineCommand('install', {
          description: 'Install user-level daemon autostart',
          run: async () => print(`Installed daemon autostart: ${await installDaemonAutostart(home())}`)
        }),
        defineCommand('uninstall', {
          description: 'Uninstall user-level daemon autostart',
          run: async () => print(`Uninstalled daemon autostart: ${await uninstallDaemonAutostart()}`)
        })
      ]
    })
  ]
})

await cli.serve(process.argv.slice(2))

function home(): string {
  return resolvePulseHome()
}

function print(text: string): void {
  if (text) {
    process.stdout.write(`${text}\n`)
  }
}
