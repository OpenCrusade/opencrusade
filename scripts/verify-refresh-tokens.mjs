#!/usr/bin/env node
/**
 * Verify the E2E refresh tokens in .env.local still mint access
 * tokens, and report identity + scopes for each.
 *
 *   node scripts/verify-refresh-tokens.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

for (const f of ['.env.local', '.env']) {
  const p = path.join(ROOT, f)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/)
    if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const clientId = process.env.VITE_GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_WEB_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error('Missing VITE_GOOGLE_CLIENT_ID or GOOGLE_WEB_CLIENT_SECRET in .env.local')
  process.exit(1)
}

async function check(label, refreshToken) {
  if (!refreshToken) {
    console.log(`${label}: NO REFRESH TOKEN`)
    return false
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    console.log(`${label}: EXCHANGE FAILED, ${body.error}: ${body.error_description ?? ''}`)
    return false
  }
  const ui = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${body.access_token}` },
  })
  const u = await ui.json()
  console.log(`${label}: OK, ${u.email}, scopes: ${body.scope}`)
  return true
}

const gm = await check('GM    ', process.env.GOOGLE_GM_REFRESH_TOKEN)
const pl = await check('PLAYER', process.env.GOOGLE_PLAYER_REFRESH_TOKEN)
process.exit(gm && pl ? 0 : 1)
