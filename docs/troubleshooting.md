# Troubleshooting

For players and GMs. Each entry gives what you see, why, and what to do. Messages are quoted as the app shows them.

In this guide, **crusade** and **campaign** mean the same thing, and so do **roster** and **force**. The **GM** is the person who created the campaign.

If something looks out of date, try **Refresh** at the bottom of the page first.

## Signing in

### The Google window does not open (pop-up blocked)

**You see** one of:

- `Your browser blocked Google's sign-in window. Allow pop-ups for this site and try again.`
- `Your browser blocked Google's window. Allow pop-ups for this site and try again.`

**Cause.** Google's sign-in and permission screens open in a small separate window. Your browser stopped it.

**Fix.**

1. Look for a blocked pop-up icon in or near the address bar. Choose to always allow pop-ups for this site.
2. Press the button again (**Continue with Google**, **Reconnect**, **Try again** or **Allow Google Sheets**).

### The Google window was closed

**You see** `The Google window was closed before sign-in finished. Try again when you're ready.` or `The Google window was closed before it finished. Try again when you're ready.`

**Cause.** The window was closed before Google finished.

**Fix.** Press the button again and complete Google's screens.

### "Sign-in was cancelled on Google's screen. Nothing was shared."

**Cause.** You pressed Cancel on Google's screen.

**Fix.** Press **Continue with Google** again when you are ready.

### "Google hasn't verified this app"

**You see** a warning page from Google with this wording before the permission screen.

**Cause.** The copy of the app you are using asks for the wider Google Sheets permission and has not been through Google's review. That is normal for a copy run for one gaming group. It is Google's warning, not an error in the app. Copies that ask for per-file access do not show it.

**Fix.** If you trust the person who runs this copy, continue past the warning. At the time of writing you choose **Advanced**, then the link to go on to the app. The wording is Google's and may change. You should only need to do this once. If you do not know who runs the copy, ask your GM before you continue.

### "Sign-in isn't set up on this copy of the app."

**Cause.** Whoever runs this copy has not finished setting it up. The **Continue with Google** button is switched off.

**Fix.** Tell the person who runs it. They need the [self-hosting guide](self-hosting.md).

### Google says you are not allowed to sign in, or access is blocked

**Cause.** This comes from Google, not the app. The copy of the app may be limited to a list of named testers, and your account is not on it.

**Fix.** Ask the person who runs this copy to add your Google email address. See [Google Cloud set-up](google-cloud-setup.md), section 5.

### You are asked for permission again every week

**Cause.** The copy of the app is in Google's "Testing" state, where permissions run out after 7 days.

**Fix.** Grant permission again. The person who runs the copy can avoid this; see [Google Cloud set-up](google-cloud-setup.md), section 5.

## Google Sheets permission

### The Sheets box was not ticked

**You see** a banner:

> **Google Sheets access wasn't granted.** Tick the box on Google's screen, then Continue.

or the message `Google didn't grant access to Google Sheets. Try again, and tick the Google Sheets box on Google's screen.`

The box reads "See, edit, create, and delete only the specific Google Drive files you use with this app". On copies of the app that ask for the wider permission it reads "See, edit, create, and delete all your Google Sheets spreadsheets". The fix is the same.

**Cause.** On Google's second permission screen the box starts unticked. You pressed Continue without ticking it.

**Fix.**

1. Press **Try again** on the banner.
2. On Google's screen, tick that box.
3. Press **Continue**.

### "This app hasn't been given permission to use Google Sheets."

**You see** `This app hasn't been given permission to use Google Sheets. Sign out and back in, and tick the Google Sheets checkbox on Google's permission screen.`

**Cause.** The same as above: the app is signed in but was never given Google Sheets.

**Fix.** Press **Sign out**, sign in again, and tick the box when Google asks.

### Which permission has the app been given?

Open the **About** page while signed in. The line **Connected right now with:** says one of:

- "access only to the sheets you create or choose in this app."
- "access to all your Google Sheets."
- "sign-in only; no access to any sheet yet."

To withdraw whatever you have given, press **Sign out and disconnect from Google** on the same page. Signing in again asks afresh.

## Access to a campaign

### "This app can't open that sheet yet"

**You see** `This app can't open that sheet yet. Choose it from Google Drive once and it will open from then on. If it isn't listed there, ask the GM to share it with the Google account you're signed in with (as Editor).`

**Cause.** You opened a campaign's link, but you have not chosen its sheet yet. With per-file access a link alone does not let the app open a sheet.

**Fix.** Press **Choose the sheet**, or **Choose from Google Drive**, and select the campaign's sheet. See the entry ["Choose this crusade's sheet, once."](#choose-this-crusades-sheet-once) below.

### "You don't have access to this crusade's Google Sheet"

**You see** `You don't have access to this crusade's Google Sheet. Ask the GM to share it with the Google account you're signed in with (as Editor).`

Under it the page says which account you are signed in as. This wording appears on copies of the app that ask for the wider Google Sheets permission.

**Cause.** One of:

- The GM has not shared the sheet with you yet.
- The GM shared it with a different email address from the one you signed in with.
- The sheet has been deleted.

**Fix.**

1. Read the "You're signed in as" line. Send that exact address to your GM.
2. The GM opens the sheet in Google Sheets, clicks **Share** and adds that address as **Editor**.
3. Press **Try again**.

If you signed in with the wrong account, see the next entry.

### "Choose this crusade's sheet, once."

**You see** this with a **Choose the sheet** button when you open a campaign.

**Cause.** The app asks Google for per-file access. It can only open a sheet someone else created after you have chosen it once. This is expected, not a fault. You do it once for each campaign.

**Fix.** Press **Choose the sheet** and select the campaign's sheet in Google's window.

- `No sheet was selected.` You closed Google's window without choosing. Press **Choose the sheet** again.
- **Google's window does not list the sheet.** The sheet has not been shared with the account you are signed in with. Ask your GM to share it with you as an Editor. Then check which account you are signed in with.
- **Google's window is blank, or never appears.** Use an ordinary browser window, not a private one, and allow third-party cookies for the app's site. Google's window needs them. A content blocker can also stop it.
- `Couldn't load Google's file chooser. Check your connection and try again.` Check your connection. A content blocker in the browser can also cause this.
- **Google's window says "The API developer key is invalid."** This is for the person who runs the copy. The key is new or was just changed (wait several minutes), or its restrictions are wrong. See [Google Cloud set-up](google-cloud-setup.md), section 8.
- `This copy of the app isn't set up to choose files (its API key or project number is missing). Whoever runs it needs to finish the set-up in the README.` Tell the person who runs the copy. They need [Google Cloud set-up](google-cloud-setup.md), section 8.

A GM can see this too, for a campaign that was created while the copy of the app used a different permission or a different Google Cloud project. Open the campaign once from **Open a crusade** and choose the sheet.

### You are signed in with the wrong Google account

**You see** the access message above, or your campaigns and forces are missing.

**Cause.** You have more than one Google account and signed in with a different one from the one the sheet is shared with.

**Fix.**

1. Press **Sign out** at the top of the page.
2. Press **Continue with Google** and choose the right account.

If a different person had been using the app on this device, their copy is removed when you sign in.

### "That was a different Google account."

**You see** a banner:

> **That was a different Google account.** Reconnect with the one you signed in with.

**Cause.** When reconnecting, you picked a different Google account from the one you are signed in with here.

**Fix.** Press **Choose account** and pick the account you signed in with. Or press **Sign out** and sign in as the other account.

### A player cannot join

Work through these in order.

| Check | Fix |
| --- | --- |
| Is the sheet shared with the player's Google email address? | GM: open the sheet, click **Share**, add the address. |
| Is the player an **Editor**? A Viewer or Commenter cannot join. | GM: change them to Editor in **Share**. |
| Is the player signed in with that same account? | Player: check the email shown on the page, or hover over **Sign out**. Sign out and back in if it is wrong. |
| Did the player tick the box on Google's permission screen? | See [The Sheets box was not ticked](#the-sheets-box-was-not-ticked). |
| Has the player chosen the campaign's sheet? | See ["Choose this crusade's sheet, once."](#choose-this-crusades-sheet-once) |
| Is the link right? | GM: send the link from **Copy crusade link** again. |
| Was the player removed before? | See below. |

Messages you may see while joining:

- `That doesn't look like a crusade link. Paste the link your GM sent you: either this app's crusade link or the Google Sheets link.` Paste the whole link.
- `That spreadsheet isn't an OpenCrusade crusade. Check the link with your GM. It should be the crusade's own Google Sheet.` The link is to some other spreadsheet.
- `Google wouldn't lock a tab to …. Check it's the address of a Google account.` Google could not protect the new tab for that email address. Check that the player signed in with an ordinary Google account, then try again.
- `The GM has removed you from this crusade. Ask them if you think that's a mistake.` The app has no way to undo a removal. Talk to your GM.
- `There's nothing at this address` The link is mistyped or cut short. Ask for it again.

After a player joins, the GM should open the campaign in the app once. The GM's copy of the app records the new player and draws their page in the sheet.

### A player has joined but others cannot see them

**Cause.** The app checks for new players only every few minutes.

**Fix.** Press **Refresh** at the bottom of the page.

### "Log battle" is missing

**Cause.** One of: fewer than two players have a force in the campaign; you have no force in it yet; or the GM has switched off **Players can record battles**.

**Fix.** Create your force, wait for a second player to create theirs, or ask your GM.

## Saving

### "Google session expired" and the Reconnect button

**You see** a banner:

> **Google session expired.** Reconnect to keep saving.

or `Your Google session has expired. Press Reconnect at the top of the page, then try again.`

**Cause.** Google's permission lasts about an hour at a time. The app tries to renew it quietly. When the browser will not allow that, it asks you.

**Fix.** Press **Reconnect**. A Google window opens briefly. You stay signed in throughout, and changes to your force made in the meantime are kept and saved afterwards.

If nothing happens when you press it, your browser may be blocking the window. See [pop-up blocked](#the-google-window-does-not-open-pop-up-blocked).

### "Some changes aren't saved to Google Sheets yet"

**You see** this in the footer, with a **Try now** link.

**Cause.** A save to the sheet failed, or changes are still waiting. Common reasons: a dropped connection, an expired Google session, or Google being busy.

**Fix.**

1. If a **Reconnect** banner is showing, press it.
2. Press **Try now**.
3. If it stays, check your connection and try again in a minute.

Your changes are still on the device. Do not clear the browser's data or use **Remove my data from this device** until the footer says **All changes saved**.

### "Offline. Changes to your forces are kept on this device"

**Cause.** The device has no connection.

**Fix.** None needed. Changes to your own force are saved when you are back online. Battles and campaign settings need a connection.

### "A force was changed in two places"

**You see** `A force was changed in two places. Open it to choose a version` in the footer, and on the force page: **This force was changed in two places.**

**Cause.** You have unsaved changes on this device, and the copy in the sheet was changed too: on another device of yours, or by your GM.

**Fix.** Open the force and choose **Use the campaign sheet's version** or **Keep this device's version**. The other version is discarded. See the [player guide](player-guide.md#notices-on-your-force).

### "Can't save to a campaign's sheet"

**You see** `Can't save to a campaign's sheet. Open your force for details` in the footer, and on the force page: **Changes to this force aren't reaching its campaign.**

**Cause.** The campaign's sheet cannot be opened. It may have been deleted, or it is no longer shared with you as an Editor.

**Fix.** Ask your GM to check the sheet's sharing, then press **Try again**. If the campaign is over, press **Stop saving to that campaign…** and confirm. See the [player guide](player-guide.md#notices-on-your-force).

### "Google Sheets refused that change"

**You see** `Google Sheets refused that change: it touches a tab that is locked to someone else. You can edit your own tab; the GM controls the rest.`

**Cause.** Google's protection on a tab stopped the change. This can happen if you have been removed from the campaign, or if someone changed the tab protections by hand in Google Sheets.

**Fix.** Ask your GM. A GM who sees this on their own campaign should check that they are signed in with the account that owns the sheet.

### "That couldn't be saved because something in it isn't valid."

**Cause.** Something you entered is not accepted. Very long names or notes are the usual cause.

**Fix.** Shorten it and try again.

## Seeing other people's changes

### Changes are not appearing

**Cause.** The app reads the campaign's sheet about once a minute while the page is showing, and not at all while its browser tab is hidden. Google limits how often a sheet can be read.

**Fix.**

1. Press **Refresh** in the footer. It reads the sheet now.
2. Check that the other person's footer says **All changes saved**. If not, their change has not reached the sheet yet.

### "This page may be out of date."

**You see** a banner starting with this, followed by a reason. Until it is sorted you are seeing the copy saved on this device.

**Cause.** The app could not read the campaign's sheet just now. The reason in the banner says why. Often it is lost access to the sheet.

**Fix.** Follow the reason given. For lost access, see ["You don't have access"](#you-dont-have-access-to-this-crusades-google-sheet).

## Google limits

### "Google Sheets is busy with too many requests right now."

**You see** `Google Sheets is busy with too many requests right now. Wait a minute and try again.`

**Cause.** Google allows each person a limited number of reads and saves per minute. The app waits and retries by itself several times before it shows this.

**Fix.**

1. Wait a minute, then try again.
2. Close extra browser tabs that have the app open. Each open tab reads the sheet.
3. Avoid pressing **Refresh** repeatedly.

### "Google Sheets is having a problem at the moment. Try again shortly."

**Cause.** A fault on Google's side.

**Fix.** Wait and try again. Changes to your force are kept on the device meanwhile.

### "GitHub is limiting lookups from your network right now. Try again in a while."

**Cause.** You are looking up tracker sets, and GitHub limits how many look-ups one network can make in an hour.

**Fix.** Wait, or download the tracker set file and add it from the file. See [tracker sets](tracker-sets.md).

## Forces and devices

### Your force is missing on a new device

**Cause.** A device only knows the campaigns that have been opened on it. Your force comes back from the campaign's sheet when you open the campaign.

**Fix.**

1. Sign in with the same Google account you used before.
2. Open the campaign from its link. Or on the **Crusades** page press **Open a crusade**, then **Choose from Google Drive**.
3. If the force still does not show, open **My rosters** and press **Restore from my crusades**.

If you see `That roster isn't on this device. Open the crusade it belongs to so it can be restored from the crusade's sheet, then retry.`, do exactly that.

**A force that was never added to a campaign cannot be restored.** It existed only on the device where you made it. Its page says **Only on this device.**

### "This roster already belongs to another crusade."

**Cause.** A force tracks one campaign.

**Fix.** Create a new force for the other campaign.

### "You already have a roster in this crusade."

**Cause.** A player has one force per campaign.

**Fix.** Detach the one you have first if you want to replace it. **Detach** is beside your force in the **Forces** card on the campaign page.

### An army list will not import

| Message | Fix |
| --- | --- |
| `That isn't a roster file. Export the list as .ros, .rosz or JSON.` | Export the list again from your list builder in one of those formats. |
| `That file has no units in it.` | The list is empty. Add units in your list builder and export again. |
| `That .rosz file is damaged.` or `That .rosz file uses a compression this app can't read.` | Export as `.ros` instead. |
| `That JSON file couldn't be read.` | The file is not valid JSON. Export it again. |
| `A roster holds at most 200 units.` | Remove units you no longer need. |

## Battles

### "Apply results" is switched off

**Cause.** One of: your edits are still saving (the button reads **Saving…**); you have already applied (it reads **Applied**); or you have not fielded any units.

**Fix.** Wait for **Saved.**, or add your units first.

### "This battle is voided. Restore it before applying results."

**Cause.** The battle has been voided.

**Fix.** Ask your GM or the player who recorded it. They can press **Restore battle**.

### "Only the GM can record battles in this crusade (crusade setting)."

**Cause.** The GM has switched off **Players can record battles**.

**Fix.** Ask your GM to record the battle, or to switch the setting on.

## The app itself

### "This page hit a problem"

**Cause.** Something went wrong showing the page. Your campaigns are safe in their Google Sheets.

**Fix.**

1. Press **Reload**. That usually fixes it.
2. If it keeps happening, the page offers **Clear this device's copy**. This makes the app read everything fresh from your campaign sheets. Changes not yet saved to a sheet, and forces you have not added to a campaign, exist only on the device and would be lost.

### "This campaign was saved by a newer version of OpenCrusade."

**You see** `This campaign was saved by a newer version of OpenCrusade. Reload the page to update, then open it again.`

**Fix.** Reload the page. If you see "A new version of OpenCrusade is ready.", press **Reload** on that message.

### "This campaign's sheet holds settings this version of the app can't read."

**Cause.** Either your copy of the app is out of date, or the hidden settings tab in the sheet was edited by hand.

**Fix.** Reload the page. If that does not help, the GM should check whether anyone edited the sheet's hidden tabs. Google Sheets keeps a version history (File, Version history) that the GM can use to go back.

### "This device is out of storage space for the app."

**Fix.** Free some space on the device and try again.

### Still stuck

Open **About** in the footer. If the person who runs this copy has set up a place to report problems, a link to it is shown there.
