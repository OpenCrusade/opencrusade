# Player guide

This guide is for anyone playing in a campaign that is tracked with OpenCrusade.

A few words first:

- The app says **crusade** and **campaign** for the same thing.
- It says **roster** and **force** for the same thing: your list of units.
- The **GM** (Game Master) is the person who created the campaign.
- **XP** is experience points. **RP** is Requisition points.

The app contains no rules. You name your units, honours, scars and agendas from your own books.

## How your data is kept

The campaign is one Google Sheet that your GM owns. When you join, you get your own **tab** (a page inside the sheet). Only you and the GM can change it. Everyone the sheet is shared with can read it.

The app also keeps a working copy in the browser on your device, so pages open quickly. There is no OpenCrusade server.

## Before you start

You need:

- a Google account;
- the campaign link from your GM;
- your GM to have shared the campaign's sheet with your Google email address, as an Editor.

## Sign in

1. Open the campaign link your GM sent you. (Or open the app's start page.)
2. Press **Continue with Google**.
3. A Google window opens. Choose your account. Use the one your GM shared the sheet with.

Google asks for permission twice, at two different moments.

### First permission screen: your email address

This appears when you sign in. The app asks only for your email address. Your tab in the sheet is locked to it, and it is how your GM recognises you.

### Second permission screen: the campaign's sheet

This appears the first time you create or open a campaign. The app needs it to read and save the campaign.

**On this screen the box is unticked by default.** Google words it as "See, edit, create, and delete only the specific Google Drive files you use with this app". Tick it, then press **Continue**. If you leave it unticked, nothing can be saved.

With this permission the app can open only the campaign sheets it creates for you, and the ones you choose yourself. It cannot see anything else in your Google account. That is why you choose a campaign's sheet once before the app can open it. See [Choose the campaign's sheet](#choose-the-campaigns-sheet).

**Some copies of the app ask for a wider permission instead.** Whoever runs the copy decides. On those copies the box reads "See, edit, create, and delete all your Google Sheets spreadsheets". It is also unticked by default, so tick it. Those copies open a campaign straight from its link, with no sheet to choose. The app still only opens campaign sheets you create or join in it.

To see which permission you have given, open the **About** page. The line **Connected right now with:** says.

### "Google hasn't verified this app"

On a copy that asks for the wider permission, you may see this warning from Google before the permission screens. It appears when that copy has not been through Google's review. It does not mean something has gone wrong.

If you trust the person who runs the app, continue past it. At the time of writing you do this by choosing **Advanced** and then the link to go on to the app. The wording is Google's and may change. You only need to do this once.

If you are unsure, ask your GM who runs the copy of the app you were sent to.

### If the Google window does not open

Your browser may have blocked it. Allow pop-ups for the app's site and try again. See [troubleshooting](troubleshooting.md).

## Open the campaign and join

1. Open the campaign link while signed in. The **Crusades** page opens with **Choose the crusade's sheet**, the same window as pressing **Open a crusade**.
2. If you have not given the second permission yet, the app explains it first. Press **Continue to Google**. On Google's screen, tick the box and press **Continue**.
3. Press **Choose from Google Drive** and select the campaign's sheet (see below).
4. The campaign page opens with a **Join this crusade** box. Check **Your name in this crusade**. This is the name the others see.
5. Press **Join crusade**.

Joining adds your tab to the sheet. It writes your name, your email address and your Google account ID into the sheet. The GM and the other players can read them.

### Choose the campaign's sheet

A link alone does not let the app open the sheet; choosing it in Google's window does. Google's window lists your spreadsheets, including ones shared with you. Select the campaign's sheet. Its name starts with "OpenCrusade".

Google remembers the choice for your account, so once a campaign is on a device it opens directly from then on.

If Google's window does not list the sheet, it has not been shared with the account you are signed in with. Ask your GM to share it with you as an Editor.

Use an ordinary browser window for this step. Google's window can fail to load in a private window, or when the browser blocks third-party cookies.

Copies of the app that ask for the wider Google Sheets permission show a **Crusade link** box instead, already filled in from the link. Press **Open crusade**.

### Open a campaign without clicking its link

1. On the **Crusades** page, press **Open a crusade**.
2. Press **Choose from Google Drive**. Google's window lists your spreadsheets, including ones shared with you. Select the campaign's sheet. Its name starts with "OpenCrusade".

On copies that ask for the wider permission there is a **Crusade link** box instead. Paste the app's campaign link or the Google Sheets link and press **Open crusade**.

## Create your force

After joining you see **Add your force**.

1. Press **Create my roster**.
2. Type your **Faction**. This is required.
3. Optionally type a **Banner name**: a name for this force.
4. Optionally import an army list (see below).
5. Press **Create roster**.

Your force opens. It starts with the campaign's supply limit and starting RP.

You have one force per campaign, and a force belongs to one campaign.

### Import an army list

You can start from a list you built in New Recruit or BattleScribe.

The app reads these files:

- `.ros`
- `.rosz`
- JSON (a `.json` export)

In the **Build a new force** dialog, press **Choose a list file** and pick the file. The app shows how many units and points it found. Unit names, points, model counts and wargear come across. No rules are read or kept.

You can also import later:

1. On your force page, under **This force**, press **Import a list**.
2. Choose the file.
3. If your force already has units, the app shows what the list would do: three groups headed **Would update**, **Would add as new** and **Not in the list, left as they are**.
4. Press **Update my units** to update the matches and add the rest. Or press **Add all … as new**.

Updating changes points, models, datasheet and wargear. It keeps XP, rank, honours, scars and battle history. An import never removes a unit.

Units are matched by name and datasheet. Give your units names in your list builder and they will match next time.

### Take a copy out

Under **This force**:

- **.ros file** downloads your force for BattleScribe-compatible apps.
- **JSON backup** downloads a backup. You can import it again with **Import a list**.

### Faction and colour

Under **This force**, press **Edit faction** to change the faction name and pick a **Force colour**.

## Units

### Add a unit by hand

1. In the **Squad** card, press **Add unit**.
2. Fill in:
   - **Unit name**: the name you have given this unit.
   - **Datasheet**: the kind of unit, as named in your army list.
   - **Points cost** and **Model count**.
   - **CHARACTER?**: tick it if the unit is a Character.
   - **Notes**: optional.
3. Press **Enroll unit**.

The banner at the top shows your **Supply**: points used, your limit, and how many are free or over. It also shows where your force stands in the campaign and its record, for example "Won 3, drawn 1, lost 2", counted from battles every player has confirmed. You never need a tracker for wins.

### Read the squad list

Each row shows the unit's rank and these columns: **P** (battles played), **K** (units destroyed), **H** (Battle Honours), **S** (Battle Scars) and **XP**. Use **Sort by** to order by XP, Kills or Points.

Press the arrow at the end of a row for a summary. From there:

- **Open unit card** opens the unit's own page.
- **Remove** takes the unit out of your force.

### Edit a unit

On the unit's page, press **Edit unit details** to change its name, datasheet, models, points, or whether it is a Character. XP, honours, scars and battle tallies stay as they are.

The unit page also has **Notes** (saved as you type), **Equipment** (type an item and press **+ Add**) and **History**.

## Experience and ranks

Units earn XP when you apply a battle's results. You do not normally type XP in.

The unit page shows the unit's XP, its rank and how far it is from the next rank. The **About ranks** note on the same page lists the ranks.

**Adjust XP** (−1, +1, +3, +5) is for manual corrections only.

## Battle honours and "honours to pick"

The app keeps a tally of how many Battle Honours a unit has earned and how many it still has to pick.

- It counts one for each rank the unit has gained.
- It adds any you say came from mission rewards.
- It takes off any lost to an Out of Action result.

The **Battle honours** section on the unit page shows the tally, for example "1 honour to pick." You also see it in the squad list as **+1** beside the **H** number, and as an **Honour to choose** card at the top of your force page.

**Pick an honour**

1. On the unit page, press **+ Award honour**. (After a promotion, a **Promotion earned** card offers **Pick honour**.)
2. Choose the **Type**: **Battle Trait**, **Weapon Mod** or **Crusade Relic**.
3. Type its **Name**. For a weapon mod you can name the **Target weapon**. For a relic, choose the **Relic tier**.
4. The box labelled **Reminder, in your own words** is optional. Write a short reminder in your own words. Do not copy text from a book.
5. Press **Award**.

**Honours from mission rewards.** The app cannot know about these. Use **−** and **+** beside **From mission rewards** to say how many the unit has been given. The tally goes up to match.

**Remove an honour** with the **✕** beside it.

A unit can only hold so many honours. When it is full, **+ Award honour** is switched off. The app may also refuse a relic tier for a unit whose rank is too low. The message says why.

## Battle scars

1. On the unit page, press **+ Apply scar**.
2. Type the **Scar name**. The box labelled **Reminder, in your own words** is optional. Use your own words.
3. Press **Apply scar**.

Remove a scar with the **✕** beside it, or by spending a requisition.

## Requisitions

The **Requisition** card on your force page shows your RP. You gain 1 RP each time you apply a battle's results, up to 10.

**Spend RP**

1. Press **Spend requisition**.
2. Choose a requisition from the list. Ones you cannot afford are greyed out.
3. Fill in what it asks for: a **Target unit**, a **Scar to remove**, or **What happened**.
4. Press **Spend … RP**.

What the app does for you depends on the requisition:

- **Increase Supply Limit** raises your supply limit.
- **Renowned Heroes** takes you to the unit so you can pick its honour.
- **Legendary Veterans** raises the unit's honour limit.
- **Repair and Recuperate** removes the scar you chose.
- **Rearm and Resupply**, **Fresh Recruits** and **Custom / pack-specific requisition** are written to your log. Make the change to the unit yourself.

If your book gives a different cost, correct your RP with the **−** and **+** buttons on the card.

### Undo a requisition

Each line in the requisition log has an **Undo** button.

1. Press **Undo** beside the line.
2. Confirm.

The RP comes back. A supply increase or Legendary Veterans is reversed. A removed scar or a picked honour is **not** changed, so fix those by hand.

## Trackers and tracker sets

A **tracker** is something you count or note down: a number, a list, stages, a checklist, a checkbox or a line of text. You name it yourself. Your trackers are in the **My trackers** card on your force page.

**Add a tracker**

1. If you already have trackers, press **Edit trackers** under **This force**.
2. Under **Track something new**, type a name and choose a type.
3. Press **+ Track**.

**Everyday use.** While locked, you can change values: press **−** or **+**, tick a box, pick a stage, add to a list.

**Set-up.** Press **Edit trackers** to rename, remove, reorder and add trackers. While editing you can also:

- choose where each tracker shows: at the side, above the squad or below the squad;
- choose how many tiles sit side by side above or below the squad, under **Track something new**;
- switch a number's **Running total** on, to also keep a total of everything ever added;
- give a checklist option a description, with **Describe**, or when you add the option.

Press **Lock trackers** when you are done.

**Tracker sets** are ready-made groups of trackers.

- A set your GM gave to every player appears by itself. You cannot remove it.
- A set your GM offers as a choice is under **Sets from your GM** in set-up mode. Choose it and press **Add**.
- You can import a set from a file or a link under **Import or share a tracker set**.

See [tracker sets](tracker-sets.md) for more.

## House rules

If your GM has written house rules, the campaign has a **House rules** tab. Read it before your first battle; the GM keeps it up to date and the page shows when it last changed.

## Record a battle

You can record a battle once at least two players have forces in the campaign. Your GM can limit recording to themselves.

1. Press **Log battle**. If your GM planned this battle in a phase, you can instead press **Record this battle** under it in the phase's box.
2. Fill in:
   - **Planned battle**: if the GM planned this battle, pick it. Its players and mission are filled in, and it shows as played in the phase.
   - **Mission**: pick from your GM's list if there is one, or type anything.
   - **Date**.
   - **Points level**.
   - **Size**: Incursion, Strike Force, Onslaught or Custom.
   - **Participants**: you are already ticked. Tick who you played.
3. Press **Record battle**.

The battle page opens. Whoever recorded the battle now enters the result.

### Enter the result

1. In **1. Result**, choose each player's **Outcome**: Victory, Defeat or Draw. In a two-player battle the other side follows by itself.
2. Type each player's **Victory points**.
3. Press **Save result**.

If you change a result later and press **Save changed result**, the other players have to confirm again.

## Confirm a result

When someone else records a battle you played in, a strip appears at the top of the campaign's pages, for example "You have 1 result to confirm."

1. Open the battle.
2. Check the outcome and the victory points.
3. Press **Confirm result**.

You are confirming who won and the points. You are not checking anyone's unit details.

A battle counts in the table once every player in it has confirmed.

If the result is wrong, do not confirm. Ask the player who recorded it, or your GM, to change it.

## Fill in your units and agendas

Each player fills in their own side. Your section is marked **Your side**. You can do this before the result is entered or confirmed.

**Units fielded**

1. Press **Field all** to add every unit, or **+ Field a unit** to add them one at a time.
2. For each unit, fill in:
   - **Kills**: enemy units it destroyed.
   - **Bonus XP**: any extra XP, for example from an agenda.
   - **Survived**: untick it if the unit was destroyed.
   - **Mark for Greatness**: tick it for one unit. Ticking another moves the mark.
3. Press **✕** on a row to take a unit out again.

**Agendas**

- If your GM has listed agendas, tap the ones you chose.
- Otherwise type each one and press **Add agenda**.
- Tick an agenda when you achieve it. XP from agendas goes in the unit's **Bonus XP** column.

**Battle notes** is free text.

Your edits save by themselves a moment after you stop typing. The section shows **Saving…**, then **Saved.** If it shows **Unsaved edits**, the save is still waiting, for example because you are offline.

**Battle logs.** In the **Status** card you can paste a link to your own write-up of the battle and press **Save link**.

## Apply results

When your units are filled in:

1. Wait until your edits have saved.
2. Press **Apply results**.

The app works out each unit's XP from what you entered, adds it, updates the unit's battle and kill tallies and its rank, and gives your force 1 RP. It lists what each unit gained. A unit that was promoted now has an honour to pick.

You do not need to wait for the result to be confirmed. You can apply once per battle; the button then reads **Applied**.

Check your entries before you press it. To fix a mistake afterwards, correct the unit by hand on its own page.

## The rewards box

The **Rewards** card on a battle page is one text box for what the winner and loser get. Any player in the battle can fill it in or change it. Type and press **Save rewards**. It shows who wrote it last.

It is a note only. The app does not act on it.

## Out of Action

After you apply results, each unit you marked as not surviving gets an **Out of Action test** in your section of the battle page.

1. Roll your dice and press the number you rolled under **Enter your d6**. Or press **Roll for me**.
2. If the roll has no effect, the app records it and you are done.
3. Otherwise choose **Gain scar** or **Lose honour**.
   - **Gain scar**: type the scar's name and press **Apply scar**.
   - **Lose honour**: choose which honour and press **Remove honour**.

The result is written to the unit and shown in its history. An honour lost this way also lowers the unit's tally of honours earned.

## When a battle is voided

The GM, or the player who recorded a battle, can **void** it. That is for a battle recorded by mistake or a game that was abandoned.

- The battle stops counting in the table.
- If you had applied its results, the app takes them back off your force: the XP, the battle and kill tallies, the rank change and the 1 RP. This happens the next time your copy of the app reads the campaign.
- Honours you already picked and Out of Action results stay. Change those by hand if you need to.

Your section of the battle page tells you which applies:

- "This battle is voided. Its XP, tallies and Requisition point are being taken back off your force."
- "This battle is voided, so nothing from it counts on your force. Results can be applied again if it is restored."

If the battle is restored, you can press **Apply results** again.

## Use a second device

Your force is saved in the campaign's sheet, so you can pick it up anywhere.

1. On the new device, open the campaign link and sign in with the same Google account.
2. Allow Google Sheets if asked, then press **Choose from Google Drive** and select the campaign's sheet.

Your force is brought back from the sheet. If it does not show, go to **All crusades**, then **My rosters**, and press **Restore from my crusades**.

Things to know:

- A device takes the newer copy from the sheet by itself, as long as it has no unsaved changes of its own.
- Let one device finish saving ("All changes saved") before you edit on another. If you change the same force on two devices before either has saved, you will be asked which version to keep. See [the notices](#notices-on-your-force).
- A force that has not been added to a campaign exists only on the device where you made it. The force page says **Only on this device.**
- If a different person signs in to the app on a device, the previous person's copy is removed from that device first.

## Work offline

Once you have opened the app on a device, it opens without a connection. A banner says:

> **Offline.** Changes to your own force are saved when you're back online.

You are viewing the copy saved on this device. Battles and campaign settings need a connection.

So, offline:

- **You can** edit your own force: units, XP, honours, scars, trackers, requisitions. The changes are kept on the device and saved when you are back online.
- **You cannot** record a battle, enter or confirm a result, apply results, join a campaign or change campaign settings. Do those when you have a connection.

Do not clear the browser's data or use **Remove my data from this device** while changes are waiting. They would be lost.

## The save status in the footer

The bottom of every page shows whether your work has reached Google Sheets.

| Message | What it means | What to do |
| --- | --- | --- |
| **All changes saved** | Everything is in the campaign's sheet. | Nothing. |
| **Saving to Google Sheets…** | A save is in progress. | Wait a moment. |
| **Offline. Changes to your forces are kept on this device** | No connection. | Carry on. They are saved when you are back online. |
| **Some changes aren't saved to Google Sheets yet** | A save failed or is still waiting. | Press **Try now** beside the message. If a **Reconnect** banner is showing, press that first. |
| **A force was changed in two places. Open it to choose a version** | Your device and the sheet both have new changes to the same force. | Open the force and choose. See below. |
| **Can't save to a campaign's sheet. Open your force for details** | The campaign's sheet cannot be opened. | Open the force. See below. |

## Refresh, and seeing other people's changes

The app reads the campaign's sheet about once a minute while the page is showing. So another player's change can take up to a minute to appear. A newly joined player can take a few minutes.

The app reads again at once when you come back to its browser tab.

To read straight away, press **Refresh** in the footer.

The app reads slowly on purpose. Google limits how often a sheet can be read.

Your own changes show on your own screen immediately.

## Notices on your force

These appear at the top of your force page. The app never drops a campaign or a version without asking you.

### "This force was changed in two places."

You have changes on this device that were not saved, and the copy in the campaign's sheet has since been changed too. That happens if you edited on another device, or if your GM corrected your force.

Choose one. The other is discarded.

| Button | What it does |
| --- | --- |
| **Use the campaign sheet's version** | Replaces this device's copy with the one in the sheet. The unsaved changes on this device are lost. |
| **Keep this device's version** | Saves this device's copy to the sheet, over the one there. The changes made elsewhere are lost. |

If you are not sure, ask your GM whether they corrected something before you choose.

### "Changes to this force aren't reaching its campaign."

The campaign's Google Sheet cannot be opened. It may have been deleted, or it is no longer shared with you as an Editor. Your changes are safe on this device.

| Button | What it does |
| --- | --- |
| **Try again** | Tries to save again. Use it after your GM has checked the sheet's sharing. |
| **Stop saving to that campaign…** | Asks you to confirm with **Yes, keep it on this device only**. The force then stops being linked to that campaign and exists only on this device. **Cancel** backs out. |

Only stop saving if the campaign is really over or you have left it.

## Other messages you may see

- **Google session expired.** Google's permission lasts about an hour at a time. Press **Reconnect**. No new permissions are requested.
- **A new version of OpenCrusade is ready.** Press **Reload** to switch to it.
- **The GM has removed you from this crusade.** You can still read it, but you can't make changes.

More are covered in [troubleshooting](troubleshooting.md).

## Remove your data and disconnect from Google

Open **About** in the footer. Under **Your data on this device** there are two buttons.

### Remove my data from this device…

1. Press **Remove my data from this device…**
2. Read the warning, then press **Remove my data from this device** to confirm. **Cancel** backs out.

This removes the app's copy of your campaigns and forces from this device, signs you out and withdraws the permission you gave the app in your Google account. Campaign sheets in Google are not touched. You can open a campaign again from its link; Google will ask for permission afresh.

Two things exist only on the device and **will be lost**: changes not yet saved to a sheet, and any force you have not added to a campaign.

### Sign out and disconnect from Google

This signs you out and withdraws the permission you gave the app. The next time you sign in, Google asks for permission afresh.

You can also withdraw the permission in your Google account, under Security, "Your connections to third-party apps and services".

**Sign out** at the top of the page only signs you out. It keeps the permission and the device's copy.

### Remove your data from a campaign

Ask your GM to remove you. Your rows stay in their sheet until the GM deletes your tab or the sheet, because the sheet belongs to them.
