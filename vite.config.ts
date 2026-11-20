import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'path'

/**
 * Build and dev-server settings come from the environment (shell or
 * .env.local). All of them are optional:
 *
 *   VITE_BASE_PATH  Path the app is served from. Default "/". For a
 *                   GitHub Pages project site set e.g. "/your-repo/".
 *   DEV_PORT        Dev server port. Default 8471.
 *   DEV_HOST        Public hostname of the dev machine. When set, the
 *                   server listens on every interface, accepts only this
 *                   hostname, and points hot reload at it.
 *   DEV_TLS_CERT    Paths to a certificate and its key. When both are
 *   DEV_TLS_KEY     set and readable, the dev server uses HTTPS.
 */

const THEME_COLOR = '#0e1116'

function readTls(certPath?: string, keyPath?: string): { cert: Buffer; key: Buffer } | null {
  if (!certPath || !keyPath) return null
  try {
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }
  } catch (err) {
    console.warn(
      '[vite] DEV_TLS_CERT / DEV_TLS_KEY are set but the files could not be read. ' +
        'Falling back to HTTP.',
    )
    console.warn(err)
    return null
  }
}

/**
 * Production builds carry a Content-Security-Policy: the page may run
 * only its own scripts and Google's sign-in script, and may talk only
 * to Google (sign-in, Sheets) and GitHub (tracker set lookup). If a
 * script were ever injected into the page, it could not load from, or
 * send anything to, anywhere else. Not applied in development, where
 * Vite needs inline scripts and a websocket.
 *
 * A <meta> policy cannot forbid framing; where the host allows custom
 * headers, also send `Content-Security-Policy: frame-ancestors 'none'`
 * (see public/_headers).
 */
function csp(fileAccess: boolean): string {
  // "File" access mode also loads Google's file chooser.
  const pickerScript = fileAccess ? ' https://apis.google.com' : ''
  const pickerFrame = fileAccess ? ' https://docs.google.com https://drive.google.com' : ''
  return [
  "default-src 'none'",
  `script-src 'self' https://accounts.google.com/gsi/client${pickerScript}`,
  // The hash is the one small <style> block Google's sign-in script
  // adds to the page. If Google changes it the browser just logs a
  // warning; sign-in does not depend on it.
  "style-src 'self' https://accounts.google.com/gsi/style 'sha256-88QphsXJQwxKP9xXR175ZSMzpaq6Swzj9u3QQ+G2Wig='",
  // Inline style ATTRIBUTES only (React's style prop is unaffected, but
  // Google's sign-in script sets some); inline scripts stay forbidden.
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://sheets.googleapis.com https://www.googleapis.com/oauth2/v3/userinfo https://accounts.google.com/gsi/ https://oauth2.googleapis.com/revoke https://api.github.com/repos/ https://raw.githubusercontent.com https://gist.githubusercontent.com",
  `frame-src https://accounts.google.com/gsi/${pickerFrame}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "upgrade-insecure-requests",
  ].join('; ')
}

function contentSecurityPolicy(fileAccess: boolean): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: csp(fileAccess) },
        injectTo: 'head-prepend',
      },
      // Google checks the file chooser's API key against the site it is
      // used from, so in "file" mode the site name (never the page
      // address) has to be sent along.
      {
        tag: 'meta',
        attrs: { name: 'referrer', content: fileAccess ? 'strict-origin' : 'no-referrer' },
        injectTo: 'head-prepend',
      },
    ],
  }
}

export default defineConfig(({ mode }) => {
  // Empty prefix: read every variable, not only VITE_*. Values already
  // in the shell environment win over the .env files.
  const env = loadEnv(mode, __dirname, '')

  const base = env.VITE_BASE_PATH || '/'
  const port = Number(env.DEV_PORT) || 8471
  const devHost = env.DEV_HOST || undefined
  const tls = readTls(env.DEV_TLS_CERT, env.DEV_TLS_KEY)

  const devServer = {
    port,
    host: devHost ? '0.0.0.0' : 'localhost',
    // Test output is not part of the app; don't reload pages when it changes.
    watch: { ignored: ['**/playwright-report/**', '**/test-results/**', '**/tests/**', '**/docs/**'] },
    ...(devHost && {
      allowedHosts: [devHost],
      // Point the hot-reload websocket at the public hostname.
      // Otherwise the client falls back to `localhost`, which fails
      // for any browser that is not on the dev machine.
      hmr: {
        host: devHost,
        protocol: tls ? 'wss' : 'ws',
        clientPort: port,
      },
    }),
    ...(tls && { https: tls }),
    headers: {
      // Google Identity Services uses window.postMessage from a popup
      // and probes `popup.closed` on the opener. Without this header
      // the browser logs noisy "Cross-Origin-Opener-Policy policy
      // would block the window.closed call" warnings on every
      // sign-in. `same-origin-allow-popups` is Google's recommended
      // value for GIS popup flows.
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  }

  return {
    base,
    server: devServer,
    // `vite preview` serves the production build the same way, so the
    // built app (with its Content-Security-Policy) can be tried locally.
    preview: {
      port,
      host: devHost ? '0.0.0.0' : 'localhost',
      ...(devHost && { allowedHosts: [devHost] }),
      ...(tls && { https: tls }),
      headers: devServer.headers,
    },
    plugins: [
      react(),
      tailwindcss(),
      contentSecurityPolicy(env.VITE_GOOGLE_ACCESS !== 'sheets'),
      VitePWA({
        // The new version waits until the user accepts it in the app.
        registerType: 'prompt',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        },
        manifest: {
          name: 'OpenCrusade',
          short_name: 'OpenCrusade',
          description: 'Campaign tracker for sci-fi wargaming crusades. Free and unofficial.',
          theme_color: THEME_COLOR,
          background_color: THEME_COLOR,
          display: 'standalone',
          // Relative, so the app also works under VITE_BASE_PATH.
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
