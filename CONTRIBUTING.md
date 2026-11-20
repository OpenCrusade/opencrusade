# Contributing

Thanks for wanting to help. Bug reports, fixes and small improvements are welcome. For anything larger, open an issue first so the approach can be agreed before you write it.

## Content rule

OpenCrusade is an unofficial fan-made tool. It ships no Games Workshop rules.

**Contributions containing Games Workshop rules text or data are not accepted.** That covers rules wording, datasheets, points values, faction or campaign rules, lore text, artwork and logos, wherever they would sit: code, tests, fixtures, comments, example files or documentation.

- In tests and examples use invented names: "First Squad", "Heavy Team", "Commander", "Red Force".
- Tracker sets hold names and numbers only. A description must be your own words, and must not reproduce a rule.

Pull requests that break this rule will be closed.

## Getting set up

See `README.md` for the Google Cloud set-up and environment variables. Then:

```sh
npm install
npm run dev
```

## Before you open a pull request

```sh
npm run lint
npx tsc -b
npm test
npm run build
```

All four must pass. CI runs the same checks.

- Add or update a unit test in `tests/unit/` when you change behaviour.
- The end-to-end tests need two real Google test accounts and are not run in CI. You do not have to run them, but say in the pull request if your change touches sign-in, sharing or how data is written to the sheet.
- Never commit `.env.local`, anything under `tests/e2e/.auth/`, real email addresses, hostnames or tokens.
- Do not add Google permissions, an API key or a server component without discussing it in an issue first.

## Security problems

Do not report these in a public issue. See `SECURITY.md`.
