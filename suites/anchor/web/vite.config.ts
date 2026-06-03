import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  base: './',
  clearScreen: false,
  build: {
    target: 'es2022'
  },
  plugins: [
    tanstackRouter({
      target: 'solid',
      routeTreeFileHeader: [
        '/* eslint-disable */',
        '// @ts-nocheck',
        '// noinspection JSUnusedGlobalSymbols',
        '// biome-ignore-all format: generated route tree'
      ]
    }),
    solid(),
    tailwindcss()
  ],
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: false,
    proxy: {
      // Proxy /anchor-core/* → http://127.0.0.1:4317/* (the Axum HTTP bridge).
      // The '/anchor-core' prefix is rewritten away so the Rust server sees
      // plain paths like /rpc, /notes, /search, etc.
      '/anchor-core': {
        changeOrigin: true,
        target: 'http://127.0.0.1:4317',
        rewrite: path => path.replace(/^\/anchor-core/, '')
      }
    },
    // The demo vault lives beside the desktop shell (../anchor/demo/vault). It is a runtime
    // data dir, not a source asset: every autosave rewrites a .md file, deletes
    // and recreates .anchor/cache/index.sqlite, and creates/renames .anchor-tmp
    // files. Left unignored, chokidar reports those writes and Vite issues a
    // full page reload after each save. Excluding the vault from the watcher
    // keeps autosave silent. (The Rust core reads/writes the vault on its own
    // path — the dev server never needs to watch it.)
    watch: {
      ignored: ['**/demo/vault/**', '../anchor/demo/vault/**']
    }
  }
})
