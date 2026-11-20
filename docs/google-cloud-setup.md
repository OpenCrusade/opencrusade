# Setting up Google Cloud for OpenCrusade

This is the full checklist for the Google Cloud project that the app signs in through. Follow it for any copy other people will use.

Google renames console pages from time to time. The names below are the ones under **Google Auth Platform** at the time of writing; if a page has moved, look for the same setting by its label. Google's rules on verification and user limits also change, so check its current help pages before you rely on the summaries here.

You need: a Google account to own the project, and the address the app will be served from (for example `https://ledger.example.com`).

## 1. Create a project used for nothing else

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
2. Keep it dedicated to this app. The limits and reviews Google applies are per project, so sharing it with other apps tangles them together.

## 2. Choose which permission the app asks for

The app stores each campaign in a Google Sheet, and there are two Google permissions that allow that. You choose one when you build the app.

| | **Per-file access** (the default) | **Google Sheets access** |
| --- | --- | --- |
| Build setting | none needed | `VITE_GOOGLE_ACCESS=sheets` |
| Google scope | `drive.file` | `spreadsheets` |
| Google's wording | "See, edit, create, and delete only the specific Google Drive files you use with this app" | "See, edit, create, and delete all your Google Sheets spreadsheets" |
| What the app can reach | Only sheets it created, or that the person chose once in Google's file chooser | Every spreadsheet the person can open |
| Google's class | Non-sensitive | Sensitive |
| "Google hasn't verified this app" warning | No | Yes, until Google has reviewed the app |
| 100-user limit before review | No | Yes |
| Extra step for players | Each player chooses the campaign's sheet once | None |
| Extra set-up | Google Picker API, an API key, the project number | None |

This guide follows **per-file access**. It asks for the least, and it avoids Google's review of sensitive permissions. Section 13 lists what differs if you choose Google Sheets access instead.

Google Sheets access needs only a client ID, so it is the quicker way to try the app on your own machine. The automated browser tests also run with it, because a test cannot operate Google's file chooser.

## 3. Enable two APIs

Under **APIs & Services > Library**, enable:

- **Google Sheets API**: every read and save of a campaign, and creating its spreadsheet, goes through this.
- **Google Picker API**: Google's file chooser, where a player selects the campaign's sheet.

Both are needed. The chooser only gives the app permission to open a sheet; the Sheets API is what then reads and writes it. The API key in section 8 is a separate matter: that key is restricted to the Picker API alone.

Google's instructions for the chooser ask only for the Picker API; the Drive API is needed only by apps that call Drive directly, which this app does not. The app's own trial ran in a project that also had the Drive API enabled. If the chooser misbehaves in a project without it, enabling the **Google Drive API** is the first thing to try.

Enable nothing else. Under **APIs & Services > Enabled APIs & services**, disable anything a new project switched on that you do not need.

## 4. Branding (what people see on Google's permission screen)

Under **Google Auth Platform > Branding**:

| Field | What to enter |
| --- | --- |
| App name | The name people will see, for example "OpenCrusade". |
| User support email | Required by Google and shown on its permission screen. This is the only place an email address appears; the app itself shows none and sends none. A Google Group address works if you would rather not use a personal one. |
| App logo | Optional. Leave it out until you need it. |
| Application home page | The app's address, for example `https://ledger.example.com/`. |
| Privacy policy link | `https://ledger.example.com/privacy` |
| Terms of service link | `https://ledger.example.com/terms` |
| Authorised domains | The domain the app is served from, for example `example.com`. |
| Developer contact email | Where Google writes to you about the project. Not shown to users. |

The app serves the home, privacy and terms pages itself. Read the privacy and terms pages as built, and make sure they are true for your copy, before you point Google at them.

Until Google has verified your branding (section 11), its permission screen shows only your app's domain, not the app name or logo.

## 5. Audience (who may sign in)

Under **Google Auth Platform > Audience**:

1. Set the user type to **External**.
2. Choose a publishing status:

| Status | Who can sign in | Catch |
| --- | --- | --- |
| **Testing** | Only the test users you list (up to 100) | Every permission expires 7 days after it was given, so everyone has to grant access again each week. |
| **In production** | Anyone with a Google account | With per-file access: none. With Google Sheets access: an "unverified app" warning and a 100-user limit until Google has reviewed the app (section 13). |

Use **Testing** only while you are setting up. Move to **In production** before real players use the app, or they will be asked for permission again every week.

## 6. Data access (the permissions the app may ask for)

Under **Google Auth Platform > Data Access**, add exactly these scopes and no others:

| Scope | Google's class | Why |
| --- | --- | --- |
| `openid` | Non-sensitive | Identifies the signed-in account. |
| `.../auth/userinfo.email` | Non-sensitive | The email address a player's tab is locked to. |
| `.../auth/drive.file` | Non-sensitive | Reading and writing the campaign sheets the person created or chose in this app. |

The list here must match what the app requests. Do not add `.../auth/spreadsheets` or any of the wider Drive scopes (`.../auth/drive`, `.../auth/drive.readonly`); an extra sensitive scope brings back the warning and the review.

## 7. The client the app uses

Under **Google Auth Platform > Clients**, create a client of type **Web application**.

- **Authorised JavaScript origins**: the address the app is served from and nothing else, for example `https://ledger.example.com`. An origin is scheme, host and port, with no path and no trailing slash. Use HTTPS; no wildcards.
- **Authorised redirect URIs**: leave empty. The app signs in with a pop-up and never uses a redirect.

Copy the **client ID**. It is public by design.

Google also shows a **client secret** for this client. The app never uses it. Do not put it in the app, the repository or the build settings.

Do not create service accounts.

### A second client for development

Create a separate Web application client **in the same project** for development, with origins such as `http://localhost:8471` (and your dev machine's HTTPS address if you use one). Use its client ID in `.env.local`. Keeping development origins off the production client means a mistake on a dev machine cannot affect the live app.

It has to be the same project. A sheet chosen in Google's chooser is opened up to the project named by the project number (section 8), so the client ID and the project number must belong together.

### A client for the automated tests (only if you run them)

The end-to-end tests sign in as two test accounts without a browser, which needs a client secret and long-lived tokens. Keep that away from production:

1. Create another Web application client, ideally in a **separate project**, with the redirect address `scripts/capture-refresh-tokens.mjs` listens on (by default `http://localhost:9997/callback`) under **Authorised redirect URIs**.
2. Put its client secret in `.env.local` as `GOOGLE_WEB_CLIENT_SECRET`, run `node scripts/capture-refresh-tokens.mjs` once per test account, and store the tokens it prints in `.env.local`.
3. Never commit `.env.local`.

The tests run the app with Google Sheets access, so that project needs the `.../auth/spreadsheets` scope and only the Google Sheets API.

## 8. The API key and project number (for Google's file chooser)

Google's file chooser needs two more values.

**An API key.** Under **APIs & Services > Credentials**, create an API key and restrict it:

- **Application restrictions**: Websites. Add your app's address (for example `https://ledger.example.com/*`) **and** `https://docs.google.com/*`. Google's chooser runs in a frame on docs.google.com; without that entry it reports "The API developer key is invalid."
- **API restrictions**: Google Picker API only.

Add your development address as another website entry (for example `http://localhost:8471/*`), or create a second key for development.

The API key is built into the app and is public, like the client ID. Anyone can read it from the site. The two restrictions are what protect it: it only works from your site, and only for the file chooser. It gives no access to anyone's files.

A new key, or a change to its restrictions, can take several minutes to start working. Until then the chooser says "The API developer key is invalid."

**The project number.** Find it on the project's dashboard (**Cloud overview > Dashboard**, "Project number"). It is a number, not the project ID. It is also the first part of the client ID, before the hyphen.

## 9. Build settings

The app needs three values from the steps above. They are read when the app is built, so they go wherever the build runs.

| Setting | Value |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | The client ID from section 7. |
| `VITE_GOOGLE_API_KEY` | The API key from section 8. |
| `VITE_GOOGLE_APP_ID` | The project number from section 8. |

All three are public by design: anyone can read them from the deployed site. None of them is a secret.

### On your own machine

Put them in `.env.local`, one per line:

```
VITE_GOOGLE_CLIENT_ID=<the client ID>
VITE_GOOGLE_API_KEY=<the API key>
VITE_GOOGLE_APP_ID=<the project number>
```

Use the development client's ID here (section 7). `.env.local` is ignored by git and is never pushed.

### On GitHub Pages

The repository's deploy workflow reads them from repository **variables**:

1. Open the repository on GitHub and go to **Settings > Secrets and variables > Actions**.
2. Choose the **Variables** tab, not Secrets.
3. Press **New repository variable** and add each of the three, with the name exactly as in the table and the value from your production client and key.
4. Re-run the deploy: push to `main`, or open the **Actions** tab, choose **Deploy to GitHub Pages** and press **Run workflow**.

They are variables and not secrets because the workflow reads them as variables, and because nothing here needs hiding. A value stored as a secret would not be picked up.

The workflow skips itself while `VITE_GOOGLE_CLIENT_ID` is missing, so the site is first published after you add it. [Self-hosting](self-hosting.md#github-pages) covers the rest of the GitHub Pages set-up.

### On another host

Add the same three names as build environment variables in the host's settings. See [Self-hosting](self-hosting.md#6-deploy).

If you change a value anywhere, build and deploy again.

## 10. Check the result

- **Enabled APIs**: Google Sheets API and Google Picker API.
- **Credentials**: Web application clients and one restricted API key; no service accounts.
- **API key**: restricted to your site plus `https://docs.google.com/*`, and to the Google Picker API.
- **Production client**: one origin, no redirect URIs.
- **Data access**: the three scopes in section 6.
- **Audience**: In production.

Then test with two Google accounts that have never used your copy, in ordinary browser windows. Private windows often block the cookies Google's chooser depends on.

1. As the first account, sign in. You should be asked only for your email address.
2. Press **New crusade**. Google's screen should offer "See, edit, create, and delete only the specific Google Drive files you use with this app". Tick it and continue. Create the campaign.
3. In Google Sheets, share the new spreadsheet with the second account as an Editor. Copy the campaign link from the app.
4. As the second account, open the link, press **Open this crusade**, then **Choose the sheet**. Google's chooser should show the sheet. Select it. The campaign opens and offers **Join this crusade**.
5. On the **About** page, each account should show "Connected right now with: access only to the sheets you create or choose in this app."

## 11. Google's verification

With per-file access the app requests only non-sensitive scopes, so Google does not require a review of its permissions, shows no "unverified app" warning, and applies no user limit once the app is In production.

What remains is **brand verification**. Until you complete it, Google's permission screen shows your app's domain in place of its name and logo. To have the name shown, Google expects:

- the domain to be verified in [Google Search Console](https://search.google.com/search-console) by an owner or editor of the Cloud project;
- a home page on that domain that is public, and that describes the app rather than being only a sign-in page (the app's start page does this);
- a privacy policy on the same domain, linked from the home page and matching the link in the Branding settings (the app's footer links to `/privacy`);
- the authorised domains in Branding to cover the client's JavaScript origins.

Submit it from the Branding page once the app is deployed at its final address.

## 12. What per-file access means for the people using the app

- **Creating a campaign** needs no extra step. The app can always open sheets it created for that person. The option to use an existing spreadsheet is hidden, because the app cannot open a sheet it did not create.
- **Opening a campaign someone else created**: a link by itself gives the app nothing. The player opens the link, sees "Choose this crusade's sheet, once" and presses **Choose the sheet**. Google's chooser shows that sheet; the player selects it, and the campaign opens.
- **Google remembers the choice.** It is tied to the player's Google account and your Cloud project, so the same campaign opens directly afterwards, on any device.
- **Without a link**, **Open a crusade** on the Crusades page has a **Choose from Google Drive** button. Google's chooser lists the person's spreadsheets, including ones shared with them.
- **If the chooser does not list the sheet**, it has not been shared with the account the player signed in with.
- **Campaigns created under Google Sheets access, or through a different Cloud project**, count as someone else's to Google, even for their GM. Open them once from **Open a crusade** and choose the sheet.
- **People who used your copy under Google Sheets access** keep that older, wider permission in their Google account until they remove it. The app does not use it, but they can clear it with **Sign out and disconnect from Google** on the About page and then sign in again.

## 13. If you choose Google Sheets access instead

Build the app with `VITE_GOOGLE_ACCESS=sheets`. Campaign links then open straight away with no chooser. The differences from the steps above:

- **Section 3**: enable the Google Sheets API only.
- **Section 6**: register `.../auth/spreadsheets` (Sensitive) in place of `.../auth/drive.file`.
- **Section 8**: skip it. No API key and no project number.
- **Section 9**: set `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_ACCESS=sheets`.
- **Audience**: In production without Google's review, people see a "Google hasn't verified this app" warning that they must click past once, and the project is limited to 100 users in total. For one gaming group that can be acceptable; tell your players to expect the warning.

To remove the warning and the limit, Google must verify the sensitive scope. As well as the brand verification in section 11, expect to provide a written reason for the scope, including why a narrower one would not do, and a short video showing sign-in, Google's permission screen and the feature that uses the permission.

## 14. Retiring an older project

If you are replacing an earlier project:

1. Build and deploy the app with the new client ID, API key and project number, and confirm sign-in works.
2. Capture new test tokens against the new test client, if you run the tests.
3. In each account that used the old project, remove the old app under Google Account > Security > "Your connections to third-party apps and services".
4. Delete the old project. That removes its API keys, clients and secrets in one go.

Everyone is asked for permission again the first time they sign in after the switch, because to Google it is a different app. With per-file access, everyone also chooses each campaign's sheet once more, GMs included: sheets created through the old project do not belong to the new one.
