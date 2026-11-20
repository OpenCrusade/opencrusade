# Run your own copy

This guide is for someone who wants to run their own copy of OpenCrusade, for their own group or for the public. It assumes you can use a command line and a static web host.

OpenCrusade is a client-only web app. The build is a folder of static files. There is no server to run, no database and no secret to keep. Each campaign lives in a Google Sheet owned by its GM, and the app talks to Google straight from each person's browser.

The project is open source under the MIT licence.

## What you need

- **Node.js 20 or newer**, with npm.
- **git**.
- **A Google account**, to own a Google Cloud project. The app signs people in through it.
- **Somewhere to host static files over HTTPS.** A custom domain or sub-domain is recommended (see [Why a custom domain](#why-a-custom-domain)).

## 1. Get the code

```sh
git clone <your fork or this repository>
cd opencrusade
npm install
```

## 2. Set up Google Cloud

The app needs a client ID from a Google Cloud project of your own. Follow [Google Cloud set-up](google-cloud-setup.md). It covers the project, which Google permission to ask for, the APIs to enable, the permission screen, who may sign in, the client, and the API key for Google's file chooser.

Two things from that guide matter throughout this one:

- Every address the app is served from must be listed under the client's **Authorised JavaScript origins**. An origin is scheme, host and port, with no path: `http://localhost:8471`, `https://ledger.example.com`.
- Use one client for development and another for the deployed app.

You come away with a **client ID** and, for per-file access (the default), an **API key** and the **project number**. All three are public by design. You do not need the client secret to run the app.

## 3. Create `.env.local`

```sh
cp .env.example .env.local
```

Open `.env.local` and set the values from the Google Cloud set-up:

```sh
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-api-key
VITE_GOOGLE_APP_ID=123456789012
```

The last two are for per-file access, the default. To use Google Sheets access instead, leave them out and add `VITE_GOOGLE_ACCESS=sheets`.

`.env.local` is ignored by git. Never commit it. `.env.example` lists every setting with a comment.

Settings the app reads:

| Variable | Required | What it does |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Yes | The client ID. Built into the app. |
| `VITE_CONTACT_URL` | No | Where people report problems. See [Set a contact link](#set-a-contact-link). |
| `VITE_REPO_URL` | No | The source repository. Linked from the FAQ page. |
| `VITE_BASE_PATH` | No | The path the built app is served from. Default `/`. Needed for a GitHub Pages project site. |
| `VITE_GOOGLE_ACCESS` | No | Which Google permission the app asks for to store campaigns. Leave unset for per-file access. Set to `sheets` for Google Sheets access. See [Google Cloud set-up, section 2](google-cloud-setup.md#2-choose-which-permission-the-app-asks-for). |
| `VITE_GOOGLE_API_KEY` | With per-file access | The API key for Google's file chooser. |
| `VITE_GOOGLE_APP_ID` | With per-file access | The Google Cloud project number. |
| `DEV_PORT`, `DEV_HOST`, `DEV_TLS_CERT`, `DEV_TLS_KEY` | No | Development server settings. See the README. |

All `VITE_` values are **built into the app**. They are read when you build, not when you serve. If you change one, build again.

The other variables in `.env.example` are for the automated tests only. The app never reads them.

## 4. Run it locally

```sh
npm run dev
```

Open <http://localhost:8471>.

- Make sure `http://localhost:8471` is an authorised origin on your development client. With per-file access, also add `http://localhost:8471/*` to the API key's website restrictions.
- If the sign-in card says "Sign-in isn't set up on this copy of the app.", the client ID is missing or still the placeholder. Fix `.env.local` and restart.
- While your Google Cloud project is in **Testing**, only the test users you listed can sign in.
- Google sign-in needs HTTPS on every origin except `localhost`. To use another machine's hostname in development, set `DEV_HOST`, `DEV_TLS_CERT` and `DEV_TLS_KEY`.

## 5. Build

```sh
npm run build
```

This type-checks the code and writes the static site to `dist/`.

To try the built site locally, exactly as it will be served:

```sh
npm run preview
```

It uses the same port as the dev server. The production build carries a Content-Security-Policy that the dev server does not, so this is the better test before you deploy.

## 6. Deploy

Put the contents of `dist/` on any static host that serves over HTTPS. Then add the host's origin to your production client's **Authorised JavaScript origins** and, with per-file access, add `https://your-domain/*` to the API key's website restrictions.

Whatever host you use, three things must be true:

1. **HTTPS.** Google sign-in will not work without it.
2. **Single-page fallback.** The app uses ordinary paths such as `/crusades/…`. The campaign link a GM sends is one of these. The host must answer any path it has no file for with `index.html`.
3. **Build-time settings.** Set `VITE_GOOGLE_CLIENT_ID` (and any other `VITE_` value) in the environment where the build runs.

### Why a custom domain

Give the app an origin of its own: a domain or sub-domain used for nothing else.

- The app keeps a short-lived Google access token and a copy of each person's campaigns in the browser's storage for its origin. Every site on the same origin can read that storage.
- Google ties sign-in, the permission screen and verification to the app's domain. The privacy and terms links you give Google must be on it.
- The origin is part of every campaign link. If you move the app later, old links stop working and each device starts with an empty copy.

### Cloudflare Pages or Netlify

These hosts read two files that the build copies into `dist/`:

- `public/_redirects` sets the single-page fallback (`/*  /index.html  200`).
- `public/_headers` sets response headers that cannot be set from inside a page: it forbids other sites from framing the app, sets the opener policy Google's sign-in window prefers, and stops `index.html` and `sw.js` from being cached so that updates arrive promptly.

To deploy:

1. Connect the repository, or upload `dist/`.
2. Build command: `npm run build`. Output directory: `dist`.
3. Set `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` as build environment variables, plus `VITE_CONTACT_URL` and `VITE_REPO_URL` if you use them. Use Node 20; the repository's `.nvmrc` says so.
4. Attach your custom domain.
5. Add `https://your-domain` to the client's authorised origins, and `https://your-domain/*` to the API key's website restrictions.

Leave `VITE_BASE_PATH` unset.

### GitHub Pages

The repository includes a workflow, `.github/workflows/deploy.yml`, that builds the app and publishes it with GitHub Pages on every push to `main`.

1. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**. Add your custom domain there and follow GitHub's DNS instructions.
2. Open **Settings > Secrets and variables > Actions > Variables** and add `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID`. Add `VITE_CONTACT_URL` and `VITE_REPO_URL` if you use them.
3. Push to `main`, or run the workflow by hand from the **Actions** tab.

Add these as **variables**, not secrets. Every one of them is built into the public site, so there is nothing to hide, and the app has no secret of its own. Your `.env.local` stays on your machine and is never pushed: it is for local development and holds the test accounts' real secrets.

Until `VITE_GOOGLE_CLIENT_ID` is set, the workflow does nothing, so a fresh fork does not publish a broken site.

With a custom domain, leave `VITE_BASE_PATH` unset. Without one, a project site is served from `https://name.github.io/your-repo/`: set `VITE_BASE_PATH` to `/your-repo/`, with a slash at each end. The authorised origin for that is `https://name.github.io`, with no path.

GitHub Pages has limits you should know about:

- **Pages ignores `_headers` and `_redirects`.** The response headers in `public/_headers` are not sent. The app's Content-Security-Policy still applies, because it is built into the page, and the app refuses to run inside another site's frame.
- **Campaign links are answered with a "not found" status.** Pages has no single-page fallback, so the workflow copies the app to `404.html`. Browsers show the app normally, but link previews and some tools treat a campaign's address as missing. The workflow gives `/privacy`, `/terms`, `/about` and `/faq` real files, so those answer normally; Google checks the privacy and terms addresses.
- **Without a custom domain, a project site shares its origin.** `name.github.io/your-repo/` has the same origin as every other Pages site of that account, so those sites could read the app's storage. Use a custom domain.

### Any other static host

Configure the fallback yourself: rewrite every path that is not a file to `/index.html` with status 200. If the host lets you set response headers, copy the ones in `public/_headers`.

## Set a contact link

Set `VITE_CONTACT_URL` to the place people should report problems, normally your repository's issues page:

```sh
VITE_CONTACT_URL=https://github.com/your-name/your-repo/issues
```

When it is set, the **About**, **Privacy** and **Terms** pages show "Found a problem? Report it on the project's issues page." When it is not set, they show nothing. The app never sends email or messages itself.

## Check your deployment

Use a browser profile, and a Google account, that have never used your copy.

- [ ] The start page loads over HTTPS with no sign-in needed.
- [ ] `/privacy`, `/terms` and `/about` load when typed straight into the address bar. This proves the single-page fallback works.
- [ ] **Continue with Google** is enabled. If it is greyed out with "Sign-in isn't set up on this copy of the app.", the client ID was not set at build time.
- [ ] Signing in asks only for your email address.
- [ ] **New crusade** asks for per-file access ("…only the specific Google Drive files you use with this app"), or for Google Sheets if you chose that. After you tick the box, a campaign is created and a spreadsheet named "OpenCrusade - …" appears in your Google account.
- [ ] **Copy crusade link** gives a link on your domain. Opened in a second browser profile with a second account, after sharing the sheet with that account as Editor, it shows **Open this crusade?** and then lets that account join. With per-file access the second account is asked to **Choose the sheet** first, and Google's window lists it.
- [ ] With per-file access, the About page says "Connected right now with: access only to the sheets you create or choose in this app."
- [ ] Reloading a campaign page works. This checks the fallback again, on a deep link.
- [ ] The browser console shows no Content-Security-Policy errors while you sign in and open a campaign.
- [ ] On hosts that read `_headers`: the response for `/` carries `X-Frame-Options: DENY` and `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
- [ ] After a first visit, the app still opens with the network switched off, and shows the "Offline." banner.
- [ ] The contact link appears on the About page, if you set one.
- [ ] The Google Cloud checks in [Google Cloud set-up, section 10](google-cloud-setup.md#10-check-the-result) pass.

Delete the test spreadsheet from Google Drive afterwards. The app cannot delete it.

## Update to a new version

```sh
git pull
npm install
npm run build
```

Then deploy `dist/` as before. Run the tests first if you have changed anything yourself.

What people see:

- The app is saved in each browser so that it opens without a connection. When a browser notices the new files, the app shows "A new version of OpenCrusade is ready." with a **Reload** button. It keeps running the old version until the person presses it or closes every tab of the app.
- Nobody is signed out. Campaigns and forces are not touched.
- If a newer version has saved a campaign in a way an older one cannot read, a person still on the old version sees "This campaign was saved by a newer version of OpenCrusade. Reload the page to update, then open it again."

Things that make people sign in or grant permission again:

- changing the client ID or the Google Cloud project (to Google it is a different app);
- changing `VITE_GOOGLE_ACCESS`;
- moving the app to a different origin. This also leaves each device with an empty copy until its campaigns are opened again from their links. Forces that were never added to a campaign do not move.

Make sure your host does not cache `index.html` or `sw.js` for long, or the update will be slow to arrive. `public/_headers` handles this on hosts that read it.

## Review the privacy and terms pages

The app serves three pages from `src/pages/LegalPage.tsx`: `/about`, `/privacy` and `/terms`. The footer links to them, and Google asks for the privacy and terms addresses when you set up the permission screen.

**You are the one publishing them. Read them and make sure every statement is true for your copy before you go live.** In particular:

- The privacy page says there is no server, no analytics, no adverts and no tracking cookies. If you add any of these, for example analytics from your host, change the page.
- It says the hosting site "may keep ordinary access logs". Check what your host keeps.
- It says the app's use of Google data follows the Google API Services User Data Policy, including the Limited Use requirements. That must stay true of any changes you make.
- The terms page is a short, general notice. It is not legal advice. Adapt it to where you are and who you serve.
- The paragraph about Google Sheets access changes its wording with `VITE_GOOGLE_ACCESS`. Read the page as built.

To change the wording, edit `src/pages/LegalPage.tsx` and build again.

Keep the "unofficial" notices. The content rule also applies to your copy: no Games Workshop rules text, points values, datasheets or artwork. See `CONTRIBUTING.md`.

## Run the tests

```sh
npm run lint     # ESLint
npx tsc -b       # type check
npm test         # unit tests
npm run build    # production build
```

The unit tests are offline and need no Google account. These four checks are what the repository's CI runs.

There are also end-to-end tests, run with `npm run test:e2e`. They drive the real app against two real Google test accounts, use real Google quota and wipe a test spreadsheet on every run. They are not run in CI, and you do not need them to host a copy. The README explains how to set them up.
