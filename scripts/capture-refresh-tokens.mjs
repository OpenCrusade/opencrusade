#!/usr/bin/env node
/**
 * Capture Google OAuth refresh tokens for the two E2E test accounts.
 *
 * The script starts a small web server, prints one sign-in link per
 * account, and waits for Google to send the browser back to it. The
 * refresh tokens are written to .env.local. They are only used by the
 * tests; the app itself never holds a refresh token.
 *
 * SETTINGS (shell environment or .env.local):
 *   VITE_GOOGLE_CLIENT_ID      the app's OAuth web client
 *   GOOGLE_WEB_CLIENT_SECRET   that client's secret
 *   E2E_GM_EMAIL               test account that owns the crusade
 *   E2E_PLAYER_EMAIL           test account that joins it
 *   CAPTURE_HOST               hostname the browser reaches this machine on
 *                              (default localhost)
 *   CAPTURE_PORT               port to listen on (default 9997)
 *   CAPTURE_REDIRECT_URI       full callback URL, if it differs from
 *                              http(s)://CAPTURE_HOST:CAPTURE_PORT/callback
 *   DEV_TLS_CERT, DEV_TLS_KEY  certificate and key files. When both are
 *                              set the server uses HTTPS. Google requires
 *                              HTTPS for every host except localhost.
 *
 * ONE-TIME SET-UP (Google Cloud Console, Credentials, the web client):
 *   add the callback URL to "Authorised redirect URIs". This is needed
 *   for the tests only. Remove it again if you do not run them.
 *
 * RUN:
 *   node scripts/capture-refresh-tokens.mjs            both accounts
 *   node scripts/capture-refresh-tokens.mjs gm         one account
 *
 * Open each printed link in a browser signed in to the matching
 * account.
 *
 * SCOPES: exactly what the app requests: `spreadsheets openid email`.
 */

import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// ── Env ─────────────────────────────────────────────────────────────
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.+)$/)
      if (m) process.env[m[1]] ??= m[2].trim()
    }
  }
}
loadEnv()

const clientId = process.env.VITE_GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_WEB_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error(`
ERROR: Missing credentials.
  VITE_GOOGLE_CLIENT_ID     ${clientId ? 'OK' : 'MISSING'}
  GOOGLE_WEB_CLIENT_SECRET  ${clientSecret ? 'OK' : 'MISSING (add to .env.local, see script header)'}
`)
  process.exit(1)
}

// ── Where Google sends the browser back to ─────────────────────────
function readTls() {
  const certPath = process.env.DEV_TLS_CERT
  const keyPath = process.env.DEV_TLS_KEY
  if (!certPath || !keyPath) return null
  return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }
}
const tls = readTls()
const HOSTNAME = process.env.CAPTURE_HOST || 'localhost'
const PORT = Number(process.env.CAPTURE_PORT) || 9997
const ORIGIN = `${tls ? 'https' : 'http'}://${HOSTNAME}:${PORT}`
const REDIRECT_URI = process.env.CAPTURE_REDIRECT_URI || `${ORIGIN}/callback`

if (!tls && HOSTNAME !== 'localhost' && HOSTNAME !== '127.0.0.1') {
  console.error(`ERROR: ${HOSTNAME} needs HTTPS. Set DEV_TLS_CERT and DEV_TLS_KEY.`)
  process.exit(1)
}

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'openid',
  'email',
].join(' ')

const ACCOUNTS = [
  { label: 'GM',     email: process.env.E2E_GM_EMAIL,     emailKey: 'E2E_GM_EMAIL',     envKey: 'GOOGLE_GM_REFRESH_TOKEN' },
  { label: 'Player', email: process.env.E2E_PLAYER_EMAIL, emailKey: 'E2E_PLAYER_EMAIL', envKey: 'GOOGLE_PLAYER_REFRESH_TOKEN' },
]

// Optional: `node ... gm` or `node ... player` to redo just one account.
const only = process.argv[2]?.toLowerCase()
if (only) {
  const keep = ACCOUNTS.filter((a) => a.label.toLowerCase() === only)
  if (!keep.length) { console.error(`Unknown account "${only}" (gm | player)`); process.exit(1) }
  ACCOUNTS.splice(0, ACCOUNTS.length, ...keep)
}

function authUrl(email, state) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent select_account',
    login_hint: email,
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString(),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  return res.json()
}

async function whoAmI(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return res.json()
}

/** Wait for one OAuth callback carrying the expected state. */
function captureCode(expectedState) {
  return new Promise((resolve, reject) => {
    const handler = (req, res) => {
      const url = new URL(req.url, ORIGIN)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      const state = url.searchParams.get('state')
      const ok = !error && code && state === expectedState
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<html><body style="font-family:sans-serif;padding:40px;background:#0e1116;color:#f2f4f7">
        <h2>${ok ? '✅ Authorized, return to the terminal.' : `❌ ${error ?? 'state mismatch'}`}</h2>
      </body></html>`)
      server.close()
      if (ok) resolve(code)
      else reject(new Error(error ?? 'state mismatch'))
    }
    const server = tls ? https.createServer(tls, handler) : http.createServer(handler)
    server.on('error', reject)
    server.listen(PORT, HOSTNAME === 'localhost' ? 'localhost' : '0.0.0.0')
  })
}

function upsertEnvLocal(key, value) {
  const p = path.join(ROOT, '.env.local')
  let content = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
  const line = `${key}=${value}`
  if (new RegExp(`^${key}=`, 'm').test(content)) {
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), line)
  } else {
    content = content.trimEnd() + '\n' + line + '\n'
  }
  fs.writeFileSync(p, content)
}

for (const account of ACCOUNTS) {
  if (!account.email) {
    console.error(`ERROR: ${account.emailKey} is not set (add it to .env.local).`)
    process.exit(1)
  }
}

// ── Main, strictly sequential so the port is reused cleanly ───────
// Print every link up front (open them IN ORDER, one at a time).
for (const account of ACCOUNTS) {
  account.state = crypto.randomBytes(16).toString('hex')
  console.log(`\n[${account.label}] Open this URL in a browser signed in as ${account.email}:`)
  console.log(`\n  ${authUrl(account.email, account.state)}\n`)
}
for (const account of ACCOUNTS) {
  const state = account.state
  console.log(`[${account.label}] Waiting for authorization at ${REDIRECT_URI} ...`)
  try {
    const code = await captureCode(state)
    const tokens = await exchangeCode(code)
    if (!tokens.refresh_token) {
      console.error(`[${account.label}] No refresh_token in response, re-run (prompt=consent should force one).`)
      continue
    }
    const user = await whoAmI(tokens.access_token)
    if (user?.email?.toLowerCase() !== account.email.toLowerCase()) {
      console.error(`[${account.label}] WRONG ACCOUNT: authorized as ${user?.email}. Expected ${account.email}. Skipping save, re-run.`)
      continue
    }
    if (!tokens.scope.split(' ').includes('https://www.googleapis.com/auth/spreadsheets')) {
      console.error(`[${account.label}] Signed in, but the Google Sheets permission was NOT granted (its checkbox was left unticked). Skipping save, re-run.`)
      continue
    }
    upsertEnvLocal(account.envKey, tokens.refresh_token)
    console.log(`[${account.label}] ✅ Saved refresh token for ${user.email} (scopes: ${tokens.scope})`)
  } catch (err) {
    console.error(`[${account.label}] Failed: ${err.message}`)
  }
}
console.log('\nDone. Verify with: node scripts/verify-refresh-tokens.mjs')
