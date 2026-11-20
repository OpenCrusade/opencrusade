# GM guide

This guide is for the Game Master (GM): the person who sets up a campaign and looks after it. You do not need any technical knowledge.

You are also a player in your own campaign. For everything to do with your own force and your own battles, see the [player guide](player-guide.md).

A few words first:

- The app says **crusade** and **campaign** for the same thing.
- It says **roster** and **force** for the same thing: one player's list of units.
- A **tab** is one page inside a Google Sheet.

## How a campaign is stored

Each campaign is one Google Sheet in **your** Google account. You own it. The app has no server of its own, so the campaign is not kept anywhere else online.

Each player gets a tab of their own in that sheet. Google locks each tab so that only that player and you can change it. Campaign settings sit in a tab that only you can change.

The app cannot share, find or delete files in your Google account. You do those things yourself in Google Sheets and Google Drive. This guide tells you when.

## Create a campaign

1. Open the app and press **Continue with Google**. Sign in with the Google account that should own the campaign.
2. On the **Crusades** page, press **New crusade**.
3. The first time, the app explains the permission it needs to keep the campaign in a Google Sheet. Press **Continue to Google**.
4. On Google's screen, **tick the box**. It is unticked by default. Google words it as "See, edit, create, and delete only the specific Google Drive files you use with this app". Then press **Continue**.
5. Back in the app, press **New crusade** again.
6. Fill in the form (see below) and press **Begin crusade**.

The app creates the sheet and takes you to the campaign page.

If Google shows a "Google hasn't verified this app" warning, or the box causes trouble, see the [player guide](player-guide.md#sign-in) and [troubleshooting](troubleshooting.md).

### The fields on the form

| Field | What to enter |
| --- | --- |
| **Crusade name** | The campaign's name. Every player sees it. At least 2 characters. |
| **Your name in this crusade** | What your players see you as, in the app and in the sheet. It starts as the first part of your email address. Change it if you prefer. |
| **Campaign pack or setting (optional)** | The mission pack or book your group is playing, if any. It is only a label. |
| **Supply limit** | The points limit for each player's force. A whole number from 500 to 5000. The form starts at 1000. |
| **Starting RP** | How many Requisition points (RP) each player starts with. A whole number up to 20. The form starts at 5. A force never holds more than 10 RP in the app, so a higher number has no extra effect. |

The app always creates a new sheet for the campaign.

The supply limit and starting RP cannot be changed in the app after the campaign is created, so check them before you press **Begin crusade**.

**A note on permissions.** With this permission the app can open only sheets it created for you, or that a person has chosen in Google's window. So each player is asked to **Choose the sheet** once, the first time they open your campaign. This is expected; tell your players. See the [player guide](player-guide.md#choose-the-campaigns-sheet).

Whoever runs your copy of the app chooses which Google permission it asks for. Some copies ask for a wider one, which Google words as "See, edit, create, and delete all your Google Sheets spreadsheets". On those copies:

- players open your campaign straight from its link, with nothing to choose;
- the form has one more field, **Existing Google Sheet (optional)**. Leave it empty and the app creates a new sheet, or paste the link of a **blank** sheet you own. If you paste a sheet that already holds a campaign, the app refuses and says `That spreadsheet already holds a crusade. Use Open a crusade instead, or pick a blank spreadsheet.`

## What appears in your Google account

One spreadsheet, named **OpenCrusade -** followed by the campaign's name. You will find it in Google Drive and in Google Sheets like any other sheet.

Nothing else is created. The app does not touch your other spreadsheets, your Drive files, your email or your calendar.

## Share the campaign with your players

There are two steps. Both are needed.

1. **Share the sheet in Google Sheets.**
   1. On the campaign page, press **Open the Google Sheet**. (If you cannot see the button, press **Manage campaign** first.)
   2. In Google Sheets, click **Share**.
   3. Add each player's Google email address as **Editor**.
2. **Send the campaign link.**
   1. Back in the app, press **Copy crusade link**. The button changes to **Link copied**.
   2. Send that link to your players any way you like.

Players must be Editors. A player who can only view the sheet cannot join.

Use the email address of the Google account each player will sign in with. If a player has more than one Google account, ask which one.

The same two steps are shown on the campaign page, under **Invite players** in the **Players** card, while you are managing the campaign.

## What your players do

Each player:

1. Opens the campaign link and signs in with Google.
2. Presses **Open this crusade**.
3. Presses **Join crusade**. This adds their own tab to the sheet.
4. Presses **Create my roster** to make their force.

The full steps are in the [player guide](player-guide.md).

Joining writes the player's name, email address and Google account ID into the sheet. Everyone the sheet is shared with can read them. Those details are in your care.

**Open the campaign yourself after players join.** A player's readable page in the sheet, and their line on the sheet's front page, are drawn by your copy of the app, because those pages are locked to you. They appear the next time you have the campaign open in the app.

A newly joined player can take a few minutes to appear for everyone else. Press **Refresh** at the bottom of the page to look straight away.

## Manage the campaign

On the campaign page you normally see what a player sees. This keeps the everyday view clean.

Press **Manage campaign** to show the GM controls. Press **Done managing** to hide them again.

- While you are the only player, the page starts in managing mode, because you are still setting up.
- The choice is remembered only on that device and only while the app stays open.
- Recording battles does not need managing mode.

Managing mode reveals everything in the sections below.

### Settings

Press **Settings**. A dialog titled **Tune the campaign** opens.

- **Players can record battles.** Ticked: any player can record a battle. Unticked: only you can.
- **Pack content · one name per line.** Three lists: **Agendas**, **Missions** and **Relics**. Type one name per line, from your campaign pack or your own house rules. Mission names are offered as suggestions when someone records a battle. Agenda names are offered as buttons when a player fills in a battle. Players can always type something else. Only names go here. Rules text stays in your books. Each list keeps the first 50 lines.
- **Teams.** For alliance or team play. Type a team name and press **+ Team**. Press **Remove** beside a team to delete it. Players in a deleted team go back to having no team.

Press **Save settings** to keep your changes.

### Put players in teams

Once at least one team exists, the **Players** card gains a **Team** column.

1. Press **Manage campaign**.
2. In the **Players** card, choose a team for each player. Choose **No team** to take a player out.

The **Table** page then shows a **Team standings** card.

### Phases

Phases tell the campaign's story in parts. Each has a title, some narrative and the dates it runs. Players see them at the top of the campaign page.

1. Beside **Phases**, press **Add a phase**.
2. Fill in **Title**, **Narrative**, **Begins** and **Ends**. Only the title is required.
3. Press **Save phase**.

Under each phase you have **Edit**, **Move earlier** and **Remove**.

When a phase has dates, the app labels it **Upcoming**, **Active** or **Ended** by itself.

### Map

One picture that every player sees on the campaign page.

1. In the **Map** card, press **Upload a map**.
2. Choose a picture.

The app shrinks the picture to fit and saves it in the sheet. Press **Replace map** when the map changes, or **Remove** to take it away. Anyone can click the map to see it full size.

### Campaign tracker

The **Campaign tracker** card holds trackers for the whole campaign: things you count or note down, named by you. Everyone can read it. Only you can change it.

1. If the card already has trackers, press **Edit trackers**.
2. Under **Track something new**, type a name.
3. Choose a type: **Number**, **List**, **Stages**, **Checklist**, **Checkbox** or **Text**.
4. Press **+ Track**.

Once it has trackers, the card has two states.

- **Locked** ("Locked: only the values change."). You can change values, such as pressing + on a number. This is the everyday state.
- **Editing.** Press **Edit trackers** to rename, remove, move and add trackers. Press **Lock trackers** when you are done.

**Campaign notes** at the bottom is free text. Use your own words.

Under **Import or share a tracker set** you can load ready-made trackers from a file. See [tracker sets](tracker-sets.md).

### Tracker sets for players

The **Tracker sets for players** card gives your players ready-made trackers on their own forces.

- A set marked **Every player** goes to each player automatically.
- A set marked **Players choose** is offered for each player to pick.

You can add a set with **Add from a file**, or paste a link to a public GitHub repository, folder or file and press **Look up**. The full steps are in [tracker sets](tracker-sets.md#add-sets-for-your-players-gm).

When every player has a set with a number tracker in it, a **Campaign totals** card adds that number up across forces and teams.

### Forces: rename, bless, detach

In the **Forces** card, managing mode adds controls on other players' forces:

- **Rename** changes the name the force goes by in this campaign.
- **Bless** gives one of the force's units a blessing or a burden. Choose the type, the unit and a name. **Effect** is optional; write it in your own words. Press **Assign**. The player sees "From your GM" on their force page and presses **Accept all** to take it.
- **Detach** takes the force out of the campaign. The app asks you to confirm first, and tells you the roster itself is untouched.

### Remove a player

1. Press **Manage campaign**.
2. In the **Players** card, press **Remove** beside the player.
3. Confirm.

The app marks the player as **Removed**, takes their force out of the campaign and locks their tab so that only you can change it. Their tab and battle history stay in the sheet.

**Then remove them from the sheet's sharing as well.** The app cannot do this for you.

1. Press **Open the Google Sheet**.
2. Click **Share**.
3. Remove the player.

This matters. Until you do it, the removed player is still an Editor of the sheet. They can still read the whole campaign, and they could still add things to the sheet by hand.

You cannot remove yourself, and there is no button to bring a removed player back.

## Battles

Any player with a force can record a battle, unless you have switched **Players can record battles** off. A battle needs at least two players with forces. The steps for recording, confirming and applying results are in the [player guide](player-guide.md#record-a-battle).

As GM you can do a little more on every battle page, whether or not you played in it. These controls do not need managing mode.

### Enter or change a result

On any battle, you can set each player's **Outcome** and **Victory points** and press **Save result** (or **Save changed result**). If you change a result that players had already confirmed, they have to confirm again.

### Mark a battle verified

A battle counts in the table once every player in it has confirmed the result. If a player cannot confirm, press **Mark verified** in the **Status** card. The app asks you to confirm if not everyone has agreed yet. Use this only when a player can't confirm.

### Void a battle

Use this for a battle recorded by mistake, or a game that was abandoned.

1. Open the battle.
2. In the **Status** card, press **Void battle**.
3. Confirm.

A voided battle stops counting in the table. Any XP, tallies and Requisition point that players had already applied from it are taken back off their forces. Each player's own copy of the app does this for their own force the next time it reads the campaign, so it is not instant for everyone. Honours already picked and Out of Action results stay as they are.

The player who recorded a battle can also void it.

### Restore a battle

Open the voided battle and press **Restore battle**. The battle is live again, and players can apply its results again. Whether it counts in the table depends, as before, on whether everyone has confirmed the result. If you had used **Mark verified** on it, check the **Status** card and press it again if needed.

## Correct a player's force

You can read every player's force. To change one, you unlock it first. This is so that you never change someone's force by a stray click.

1. Open the player's force, for example from the **Forces** card or the table.
2. In the strip under the banner, press **Unlock to correct**.
3. Make your corrections. The strip now says you are correcting that player's force.
4. Press **Lock this force** when you are done. The force also locks again when you leave its pages.

While a force is unlocked you can:

- add, edit and remove units;
- change a unit's XP, honours, scars, notes and equipment;
- change tracker values and set-up;
- add or take away Requisition points with **−** and **+**;
- undo a requisition.

Your corrections are saved to the player's tab in the sheet. The player's copy of the app picks them up the next time it reads the campaign. If the player has changes of their own that had not been saved yet, they are shown a notice and asked which version to keep.

## Read the campaign in Google Sheets

Press **Open the Google Sheet**. You can read the campaign there without the app.

- **Crusade** is the front page. It shows headline numbers, the standings, the campaign tracker and the battle log. It has a link back to the app.
- **One page per player**, named after the player. It shows the force's summary, its last battles and its Order of Battle.

These pages update by themselves from the data.

The sheet also has hidden tabs: one called **Crusade data**, and one per player whose name starts with **data ·**. The app keeps its records there.

Some advice:

- **Treat the sheet as read-only.** Make changes in the app.
- Do not rename, delete or edit the hidden tabs. If the settings tab is edited by hand, the app may stop being able to open the campaign.
- Do not rename or delete the readable pages either. Your copy of the app redraws them, so changes you make there are lost.

## Delete a campaign

The app cannot delete files. To delete a campaign:

1. Open Google Drive.
2. Find the spreadsheet named **OpenCrusade -** followed by the campaign's name.
3. Delete it.

The note at the bottom of the campaign page reminds you of the sheet's name while you are managing.

After that, players' forces stay on their own devices but can no longer be saved to the campaign. Each player sees a notice on their force and can choose to keep it on their device only.

To clear the campaign from your own device as well, use **Remove my data from this device…** on the **About** page. This removes the app's copy of everything on that device, not only this campaign.

## What you can and cannot see or change

**You can see**

- Everything in the campaign: every player's force, units, trackers, notes and battles.
- Every player's name and email address, in the sheet.

Every player can see the same. Everyone the sheet is shared with can read all of it.

**You can change**

- Campaign settings, teams, phases, the map, the campaign tracker and tracker sets.
- Any player's force, after pressing **Unlock to correct**.
- Any battle's result, and whether it is verified or voided.
- Who is in the campaign.

**You cannot**

- Change the supply limit or starting RP after creating the campaign.
- Fill in another player's side of a battle: their units, agendas and battle notes. You also cannot confirm a result or apply results for them. Use **Mark verified** if a player cannot confirm.
- See a force that a player has not added to the campaign. It exists only on their device.
- Share the sheet, remove someone from its sharing, or delete it from inside the app. You do those in Google.

**Players cannot**

- Change another player's tab or the campaign settings. Google enforces this, not the app.
