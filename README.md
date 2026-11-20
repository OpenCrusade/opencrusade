# OpenCrusade

A campaign tracker for Warhammer 40,000 Crusade. It is an unofficial, fan-made tool (see [Unofficial](#unofficial)).

A games master (GM) sets up a campaign and invites players. Each player keeps a roster: units with experience, ranks, battle honours and scars, requisition points and supply. Battles are logged once and each player applies their own results. The GM can add campaign trackers, teams, phases and a map.

OpenCrusade is a web app that installs like a phone or desktop app (a PWA). It runs entirely in the browser. **There is no server.**

## Documentation

Guides for GMs, players and people running their own copy are in [docs/](docs/README.md): the [GM guide](docs/gm-guide.md), the [player guide](docs/player-guide.md), [troubleshooting](docs/troubleshooting.md), [tracker sets](docs/tracker-sets.md) and [self-hosting](docs/self-hosting.md).

## How your data is stored

- **One Google Sheet per campaign.** The GM's Google account creates the spreadsheet and owns it. Nothing is stored anywhere else online.
- **The GM shares the sheet in Google Sheets**, the usual way, with each player as an editor. The app cannot share, list or delete files for you.
- **Each player writes their own tab.** When a player joins, the app adds a tab for them and protects it so that only that player and the GM can edit it. Campaign settings sit in a tab only the GM can edit. Google enforces these protections, not the app.
- **Readable pages.** The spreadsheet also has pages made for people: a front page with standings and the battle log, and a roster page per player. You can read the campaign in Google Sheets without the app.
- **A local copy in the browser.** The app keeps a working copy in the browser's storage (IndexedDB), so pages open quickly and rosters can be edited before they are attached to a campaign. A roster that is not attached to any campaign exists only on that device.

To open a campaign on a new device, sign in and open its link, or use **Open a crusade** on the Crusades page.

To delete a campaign, the GM deletes its spreadsheet in Google Drive; the app cannot delete files. "Remove my data from this device" on the About page clears the browser's copy and withdraws the app's Google permission.

Other people's changes appear within about a minute while the page is showing, at once when you come back to the tab, or when you press Refresh in the footer. The app reads slowly on purpose, because Google limits how often a sheet can be read.

## Google permissions

The app asks for as little as it can, and asks in two steps:

| When | Permission | Why |
| --- | --- | --- |
| Sign-in | `openid`, `email` | To know who you are. Your email address is how the GM recognises you and how tabs are protected. |
| When you create or open a campaign | One storage permission (below) | To read and write the campaign's spreadsheet. |

Which storage permission is a build setting, `VITE_GOOGLE_ACCESS`:

- **Per-file access** (`file`, the default): `https://www.googleapis.com/auth/drive.file`. The app can reach only sheets it created, or that the person chose once in Google's file chooser. Each player chooses a campaign's sheet once; Google remembers it. Google classes this permission as non-sensitive, so there is no "unverified app" warning. It needs the Google Picker API, an API key and the project number.
- **Google Sheets access** (`sheets`): `https://www.googleapis.com/auth/spreadsheets`. Google words this as all your spreadsheets. Campaign links open with no extra step, and a client ID is all you need, which makes it the quickest way to try the app locally. The app only ever touches spreadsheets you create with it or open from their link.

[docs/google-cloud-setup.md](docs/google-cloud-setup.md#2-choose-which-permission-the-app-asks-for) compares the two.

The app does not request access to Drive, Gmail, Calendar, contacts or your profile. It talks directly from your browser to Google. Your access token stays in your browser and lasts about an hour, after which Google is asked to renew it. "Sign out and disconnect from Google" on the About page withdraws the permission altogether.

The only other outside service is GitHub's public API, and only if you choose to import tracker sets from a GitHub link.

## Run your own copy

You need Node.js 20 or newer and a Google account.

### 1. Google Cloud set-up

The app needs an OAuth client ID from a Google Cloud project of your own. These steps are the quickest way to try it on your own machine, and use Google Sheets access (`VITE_GOOGLE_ACCESS=sheets`). For a copy other people will use, follow [docs/google-cloud-setup.md](docs/google-cloud-setup.md) instead, which sets up per-file access and also covers the permission screen, who may sign in, separate clients for development and tests, and Google's verification.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. Under **APIs & Services > Library**, enable the **Google Sheets API**. Enable nothing else.
3. Under **APIs & Services > OAuth consent screen**, set the app up as **External**. Add the scopes `openid`, `email` and `.../auth/spreadsheets`. While the app is in testing, add each person who will sign in as a test user.
4. Under **APIs & Services > Credentials**, create an **OAuth client ID** of type **Web application**.
   - **Authorised JavaScript origins**: every origin the app is served from, for example `http://localhost:8471` for development and `https://your-name.github.io` for a deployment. An origin is scheme, host and port, with no path.
   - **Authorised redirect URIs**: leave empty. The app signs in with a pop-up and does not use redirects.
5. Copy the client ID. You do not need the client secret to run the app, and with Google Sheets access you do not need an API key.

### 2. Configure and start

```sh
git clone <your fork or this repository>
cd opencrusade
npm install
cp .env.example .env.local    # set your client ID; for this quick start also set VITE_GOOGLE_ACCESS=sheets
npm run dev
```

Open <http://localhost:8471>.

### Environment variables

Put these in `.env.local`, which is ignored by git. `.env.example` lists them all.

| Variable | Required | What it does |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Yes | The OAuth client ID. It is built into the app and is public by design. |
| `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID` | With per-file access | API key for Google's file chooser and the Cloud project number. Both are built in and public by design. |
| `VITE_GOOGLE_ACCESS` | No | `file` (default) or `sheets`. Which Google permission stores campaigns; see "Google permissions" above. |
| `VITE_CONTACT_URL` | No | Where people report problems, normally the repository's issues page. Linked from the About, Privacy, Terms and FAQ pages. The app never sends email or messages. |
| `VITE_REPO_URL` | No | The source repository. Linked from the FAQ page. |
| `VITE_BASE_PATH` | No | Path the built app is served from. Default `/`. For a GitHub Pages project site, set it to the repository name with slashes, for example `/your-repo/`. |
| `DEV_PORT` | No | Dev server port. Default `8471`. |
| `DEV_HOST` | No | Public hostname of the dev machine. When set, the dev server listens on every network interface, accepts only this hostname and points hot reload at it. When unset, it listens on `localhost` only. |
| `DEV_TLS_CERT`, `DEV_TLS_KEY` | No | Paths to a certificate and key. When both are set, the dev server uses HTTPS. Google sign-in needs HTTPS on every origin except `localhost`. |

Test-only variables. The app never reads these, and you need them only to run the end-to-end or live integration tests:

| Variable | What it does |
| --- | --- |
| `GOOGLE_WEB_CLIENT_SECRET` | Client secret of the same OAuth client. The tests use it to turn refresh tokens into access tokens. |
| `E2E_GM_EMAIL`, `E2E_PLAYER_EMAIL` | Two Google test accounts: one runs the campaign, one joins it. |
| `GOOGLE_GM_REFRESH_TOKEN`, `GOOGLE_PLAYER_REFRESH_TOKEN` | Refresh tokens for those accounts, written by `scripts/capture-refresh-tokens.mjs`. |
| `SHEETS_FIXTURE_ID` | ID of a spreadsheet owned by the GM test account and shared as editor with the player test account. The tests wipe it on every run. |
| `E2E_BASE_URL` | Where the tests find the app. Default `http://localhost:8471`. |
| `CAPTURE_HOST`, `CAPTURE_PORT` | Where `scripts/capture-refresh-tokens.mjs` listens for Google's redirect. Default `localhost` and `9997`. |
| `LIVE_SHEETS` | Set to `1` to run the live Sheets integration test. |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run build` | Type-check, then build the static site into `dist/`. |
| `npm run preview` | Serve the built site locally. |
| `npm test` | Run the unit tests. They are offline and need no Google account. |
| `npm run lint` | Run ESLint. |
| `npx tsc -b` | Type-check only. |
| `npm run test:e2e` | Run the Playwright end-to-end tests (see below). |

### End-to-end tests

The end-to-end tests drive the real app against real Google accounts, so they use real API quota and are not run in CI. To set them up:

1. Create two Google test accounts and add both as test users of your OAuth client.
2. As the GM test account, create an empty spreadsheet and share it as editor with the player test account. Put its ID in `SHEETS_FIXTURE_ID`.
3. Fill in the test-only variables above, except the refresh tokens.
4. Add `http://localhost:9997/callback` to the OAuth client's authorised redirect URIs. This is for the token script only.
5. Run `node scripts/capture-refresh-tokens.mjs` and follow the two links it prints. Check the result with `node scripts/verify-refresh-tokens.mjs`.
6. Run `npx playwright install chromium`, then `npm run test:e2e`.

The report is written to `playwright-report/`. Session files are written to `tests/e2e/.auth/`. They contain live Google tokens and must never be committed.

## Deployment

`npm run build` produces static files in `dist/`. Put them on any static host that serves over HTTPS. Add the host's origin to the OAuth client's authorised JavaScript origins.

The client ID is built in, so set `VITE_GOOGLE_CLIENT_ID` (and `VITE_BASE_PATH` if needed) when you build, not when you serve.

**Single-page app fallback.** The app uses ordinary paths such as `/crusades/...`. The host must answer any path it has no file for with `index.html`. Most hosts have a setting for this (often called "SPA fallback" or a rewrite of `/*` to `/index.html`).

**GitHub Pages.** The repository includes a workflow, `.github/workflows/deploy.yml`, that builds and publishes the app. Set the `VITE_` values as repository **variables** (they are public, not secrets) and choose "GitHub Actions" as the Pages source. [docs/self-hosting.md](docs/self-hosting.md#github-pages) has the steps and the limits.

The app installs a service worker so that it loads without a connection. After you deploy a new version, people who have the app open are told a new version is ready and can switch to it with one press.

**Give it its own origin.** The app keeps a short-lived Google access token in the browser's storage for its origin, and every site on the same origin can read that storage. A GitHub Pages project site (`name.github.io/repo/`) shares its origin with every other Pages site of that account, so prefer a custom domain or sub-domain used for nothing else.

**Security headers.** The built page carries a Content-Security-Policy that lets it run only its own scripts and Google's sign-in script, and talk only to Google and GitHub. Two things cannot be set from inside a page and need response headers: forbidding other sites from framing the app, and the opener policy Google's sign-in window prefers. `public/_headers` sets these, and `public/_redirects` sets the single-page fallback, on hosts that read those files (Cloudflare Pages, Netlify). GitHub Pages ignores both; there the app falls back to refusing to run inside a frame.

**Privacy policy and terms.** The app serves `/privacy`, `/terms` and `/about`. Read them and make sure they are true for your copy before you publish it; Google asks for the privacy page's address when you configure the OAuth consent screen.

## How players are kept apart

Everyone in a campaign is an editor of the same spreadsheet, so the app treats everything it reads from the sheet as something another person may have typed.

- **Tabs are locked by Google.** A player's tab can be edited only by that player and the GM. The app never relies on its own checks for this.
- **The GM's app admits players.** A player joins by adding their own tab. The GM's app then records, in the GM-only tab, which Google account owns which tab. From then on no other tab can speak for that player, whatever it claims. A force or battle only counts in its owner's own tab.
- **A force follows one campaign.** A device only accepts changes to a force from the campaign it was attached to. If a force was changed in two places, the app asks its owner which version to keep instead of picking one.
- **Bad rows are skipped, not fatal.** Each record is checked on its own; one that fails is ignored and left untouched in the sheet.
- **Text is never a formula.** Names and notes written to the sheet's readable pages are stored as plain text.

A campaign is still a shared spreadsheet among people who play together. An editor acting in bad faith can add clutter to it or slow it down, and a removed player keeps access until the GM also removes them from the sheet's sharing in Google Sheets.

## Tracker sets

Campaigns and factions often need their own things to count. A tracker set is a small JSON file that describes a panel of trackers. Anyone can write one, host it and share it. The app ships none. GMs import them from a file, a GitHub "Raw" link, or by looking up a public GitHub repository or folder; players import from a file or a "Raw" link.

```json
{
  "format": "crusade-ledger-tracker",
  "version": 1,
  "name": "Example tracker set",
  "trackers": [
    { "name": "Campaign points", "type": "number" },
    { "name": "Campaign stage", "type": "stages", "stages": ["Scouting", "Assault", "Occupation"] },
    { "name": "Leader chosen", "type": "checkbox" }
  ]
}
```

Tracker types are `number`, `stages`, `list`, `checklist`, `checkbox` and `text`. See [`public/example-tracker-set.json`](public/example-tracker-set.json) for a complete example, and the comment at the top of `src/lib/import/tracker-layout.ts` for every field.

A tracker set holds **names and numbers only**. It is a place to write down your own tallies, not a copy of the rules.

## Content policy

OpenCrusade ships no rules text: no datasheets, points values, faction rules, campaign rules or artwork. You type in your own units, or import an army list you made in a list-building tool.

Contributions containing Games Workshop rules text or data are not accepted. This includes tests, examples and tracker sets in this repository. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## Unofficial

OpenCrusade is an unofficial, fan-made tool. It is not affiliated with or endorsed by Games Workshop.

Warhammer 40,000 and related names are trademarks of Games Workshop Limited.

The app does not contain the rules of the game. You need the relevant books to play.
