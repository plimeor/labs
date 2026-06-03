import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

// Enumerate every story id from the prebuilt static Storybook index and shoot a
// screenshot of each story × theme. The preview decorator (see
// .storybook/preview.ts) reads the `theme` global and sets
// document.documentElement.dataset.theme, so passing globals=theme:<value> on
// the iframe URL switches light/dark.

type StorybookIndex = {
  entries: Record<string, { id: string; type: string }>
}

const indexPath = join(process.cwd(), 'storybook-static', 'index.json')
const index = JSON.parse(readFileSync(indexPath, 'utf8')) as StorybookIndex

const storyIds = Object.values(index.entries)
  .filter(entry => entry.type === 'story')
  .map(entry => entry.id)
  .sort()

const themes = ['light', 'dark'] as const

for (const id of storyIds) {
  for (const theme of themes) {
    test(`${id} · ${theme}`, async ({ page }) => {
      await page.goto(`/iframe.html?id=${id}&globals=theme:${theme}&viewMode=story`)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(200)
      await expect(page).toHaveScreenshot(`${id}-${theme}.png`)
    })
  }
}
