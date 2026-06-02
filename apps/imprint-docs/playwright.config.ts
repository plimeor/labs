import { defineConfig } from '@playwright/test'

// Visual regression for the prebuilt static Storybook. Run `build-storybook`
// first, then `test:visual`. Baselines are committed only for linux
// (CI runs inside the Playwright container); darwin/win32 snapshots are
// gitignored local sanity artifacts.
export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  reporter: 'list',
  // The {platform} token suffixes every snapshot with the OS (e.g. `-linux`,
  // `-darwin`), so CI (linux) baselines and local (darwin) ones never collide
  // and the `*-darwin.png`/`*-win32.png` gitignore rules match. Only the
  // linux baselines are committed (seeded by the visual-baselines workflow).
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{platform}{ext}',
  testDir: './visual',
  // Visual specs use `.visual.ts` (not `.spec.ts`/`.test.ts`) so Bun's test
  // runner never picks them up — only Playwright runs them.
  testMatch: '**/*.visual.ts',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' }
    }
  ],
  use: {
    baseURL: 'http://localhost:6007'
  },
  webServer: {
    command: 'bunx http-server storybook-static -p 6007 -s --silent',
    reuseExistingServer: true,
    timeout: 120_000,
    url: 'http://localhost:6007'
  }
})
