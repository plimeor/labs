import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const srcRoot = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  build: {
    cssCodeSplit: false,
    lib: {
      entry: 'src/index.ts',
      fileName: 'index',
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', '@ark-ui/react', 'lucide-react', 'tailwind-variants']
    }
  },
  plugins: [
    tailwindcss(),
    react(),
    dts({
      // vite-plugin-dts@5 / unplugin-dts@1 renamed `rollupTypes` to `bundleTypes`.
      // This rolls all declarations into a single `dist/index.d.ts` via api-extractor.
      bundleTypes: true,
      // Emit declarations directly under dist/ (drop the leading `src/` segment)
      // so api-extractor finds the entry at dist/index.d.ts.
      entryRoot: srcRoot,
      exclude: ['src/**/*.test.tsx', 'src/**/*.stories.tsx'],
      include: ['src'],
      tsconfigPath: 'tsconfig.json'
    })
  ]
})
