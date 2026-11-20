# Security

## Reporting a problem

Please report security problems privately, through GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**.

Do not open a public issue for a security problem, and do not put tokens, spreadsheet links or other people's details in a report.

Say what you found, how to reproduce it and what an attacker could do with it. You will get a reply in the advisory thread.

## What is in scope

OpenCrusade runs entirely in the browser. It has no server and no database of its own. Things worth reporting include:

- a way for one player to read or change data they should not be able to, beyond what Google Sheets sharing already allows
- a way for content in a spreadsheet, an imported army list or a tracker set to run script in another person's browser
- a leak of the Google access token the app holds while you are signed in
- the app requesting more Google permissions than the README describes

Problems in Google's own services, or in a deployment you do not control, should go to whoever runs them.

## Secrets

The repository contains no secrets. The OAuth client ID a deployment is built with is public by design. If you find a credential committed here by mistake, report it the same way.
