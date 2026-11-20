#!/usr/bin/env node
/**
 * Render the PNG app icons in public/ from public/favicon.svg.
 * Run it again after changing the SVG:
 *
 *   node scripts/render-icons.mjs
 *
 * Uses the Chromium that Playwright installs (npx playwright install chromium).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from '@playwright/test'

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public')
const svg = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf-8')
const background = svg.match(/<rect[^>]*fill="([^"]+)"/)[1]
// The same drawing with square corners, for icons the system crops itself.
const square = svg.replace(/(<rect[^>]*?) rx="[^"]*"/, '$1')

/** scale = share of the canvas the drawing covers. */
const ICONS = [
  { file: 'icon-192.png', size: 192, source: svg, scale: 1, transparent: true },
  { file: 'icon-512.png', size: 512, source: svg, scale: 1, transparent: true },
  // Maskable: launchers may crop to a circle 80% wide, so the marks stay well inside it.
  { file: 'icon-512-maskable.png', size: 512, source: square, scale: 0.7, transparent: false },
  { file: 'apple-touch-icon.png', size: 180, source: square, scale: 1, transparent: false },
]

const browser = await chromium.launch()
for (const icon of ICONS) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } })
  const inner = Math.round(icon.size * icon.scale)
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${icon.size}px;height:${icon.size}px;display:grid;place-items:center;background:${icon.transparent ? 'transparent' : background}">
    <div style="width:${inner}px;height:${inner}px">${icon.source.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
  </body></html>`)
  await page.screenshot({ path: path.join(PUBLIC, icon.file), omitBackground: icon.transparent })
  await page.close()
  console.log(`wrote public/${icon.file}`)
}
await browser.close()
