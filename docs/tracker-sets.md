# Tracker sets

A **tracker** is something you count or note down during a campaign: a number, a list, a set of stages, a checklist, a checkbox or a line of text. You name each tracker yourself.

A **tracker set** is a small file that describes a group of trackers, so that nobody has to set them up by hand. Anyone can write one and share it. The app ships with none.

A tracker set holds **names and numbers only**. It is a place to keep your own tallies. It must never contain rules text. See [What may go in a set](#what-may-go-in-a-set).

## Where trackers appear

- **Campaign tracker.** One panel on the campaign page. The GM edits it. Everyone can read it.
- **My trackers.** A panel on each player's force page. The player edits it.

A tracker set can be imported into either panel. A GM can also hand sets to players through the campaign.

## Add sets for your players (GM)

1. Open the campaign page and press **Manage campaign**.
2. Find the card **Tracker sets for players**.
3. Under **Who gets it**, choose one:
   - **Every player**: each player gets the set's trackers automatically. They cannot remove them.
   - **Players choose**: the set is offered on each player's force page, and each player decides whether to add it. Use this for sets that only suit some forces.
4. Add the set in one of two ways.

**From a file**

1. Press **Add from a file**.
2. Choose the `.json` file.

**From GitHub**

1. Paste a link into the box labelled **GitHub repository or file link**.
2. Press **Look up**.
3. If the link is to a public GitHub repository or folder, the app lists the sets it found there. It reads the folder you linked and the folders directly inside it. Tick the sets you want. For each ticked set, choose **Every player** or **Players choose**. Then press **Add … selected**.
4. If the link is a GitHub "Raw" link to one file, the set is added straight away, using the choice you made under **Who gets it**.

After adding, the app tells you what happens next:

- `Added "…". Each player gets it the next time they open their force.`
- `Added "…". Players can now choose it on their force page.`

Each set in the list shows **Every player** or **Players choose** and how many trackers it holds.

**Remove one tracker from a set.** Press **Edit** beside the set, then **Remove** beside the tracker you do not want. Press **Done** when you have finished.

- In an **Every player** set, the tracker disappears from every player's force the next time they open it, along with whatever they had recorded in it. It also leaves **Campaign totals**.
- In a **Players choose** set, players who already added it keep it. It is no longer offered to anyone else.

Removing the last tracker removes the set.

**Remove a whole set.** Press **Remove set** beside it.

- An **Every player** set: all of its trackers disappear from every player's force the next time they open it, along with whatever they had recorded.
- A **Players choose** set: players who already added its trackers keep them, and can remove them from their own force.

Removing from an **Every player** set cannot be undone. Adding the same file again gives everyone fresh, empty trackers.

**Download an example** on the same card gives you a sample file to copy from.

The app looks sets up on GitHub directly from your browser, without signing in to GitHub. It can only see public repositories. GitHub limits how many look-ups one network can make in an hour.

A campaign holds at most 40 sets.

### Campaign totals

When an **Every player** set contains a number tracker, the campaign page shows a **Campaign totals** card. It adds that number up across all forces, and across each team if you have set teams up. A force that has not received the tracker yet shows **Not set up**.

The card starts in the side column. To move it, press **Manage campaign** and use the menu in the card's heading: **Shown at the side**, **Shown at the top** or **Shown at the bottom**. At the top or bottom it is full width, with the trackers side by side. Everyone in the campaign sees it where you put it.

**Choose which numbers count.** Not every number is worth adding up across the campaign. In **Tracker sets for players**, press **Edit** beside the set and untick **In Campaign totals** beside any number to leave it out. A set file can do the same with `"totals": false`, and the tracker set builder has a **Campaign totals** switch on each number.

**Columns.** At the top or bottom, a second menu in the card's heading sets how many trackers sit side by side, from 1 to 4. Fewer fit on a narrow screen.

## Use a set as a player

**A set your GM gave to every player** appears in your trackers by itself the next time you open your force page. In set-up mode it is marked `From your GM, so it can't be removed.`

**A set your GM offers as a choice**

1. Open your force page.
2. Under **This force**, press **Edit trackers**. (If you have no trackers yet, the set-up controls are already showing.)
3. Under **Sets from your GM**, choose a set and press **Add**.

**A set from a file or a link**

1. Open your force page and press **Edit trackers**.
2. Open **Import or share a tracker set**.
3. Press **Import from a file** and choose the file. Or paste a GitHub "Raw" link into **GitHub link to a tracker set** and press **Import**.
4. Confirm. The new trackers are added to the ones you already have. Nothing is replaced.

On a force page this link box takes a link to one file only. Looking up a whole repository is on the GM's card.

**Share your own layout.** In the same section, press **Download this set** and give the set a name. The file keeps the tracker names, stages, list entries, option descriptions, where each tracker shows, the number of columns, running totals and notes. It leaves out your numbers and progress.

**Copy another player's layout.** If you have no trackers yet and another force in the campaign does, you are offered **Copy another player's layout**. It copies the tracker names and types, starting from zero. Their values and notes are not copied.

## Build a set

The easiest way to make a set is the **tracker set builder** at `/tracker-sets/new` on the app's site (for example `https://opencrusade.info/tracker-sets/new`). It is linked from the FAQ and from **Build a set** on the campaign page. You do not need to sign in, and nothing leaves your browser until you download the file.

1. Give the set a **Name**, and optionally say who a GM would usually give it to.
2. Under **Track something new**, add trackers. While adding you can choose where each one shows, how many tiles sit side by side, whether a number keeps a **Running total**, and a description for each checklist option.
3. Check the **Preview**: it shows the trackers at the side and full width.
4. Press **Download the file**, or **Copy as text** to paste into a gist.

You can also start from a file, a GitHub link, the trackers already on a force or campaign on this device, or a set pasted as text. Pasted text is checked as you type, and any problem is named with where it is.

Numbers, ticks and text you fill in become the set's starting values. Your work is kept in this browser as a draft until you press **Start again** or clear the browser's data.

## Links the app accepts

- A link to a public repository or folder on `github.com` (GM card only).
- A "Raw" file link on `raw.githubusercontent.com` or `gist.githubusercontent.com`.

Links to any other site are refused. For a set kept somewhere else, download the file and add it from the file.

## The file format

A tracker set is a JSON file. A small one looks like this:

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

The app serves a fuller example at `example-tracker-set.json` (the **Download an example** link).

### Top level

| Key | Required | Value |
| --- | --- | --- |
| `format` | Yes | Must be exactly `"crusade-ledger-tracker"`. |
| `version` | Yes | Must be the number `1`. |
| `trackers` | Yes | A list of trackers, 50 at most. See below. |
| `name` | No | The set's name, up to 200 characters. If it is missing, the GM's card uses the file name instead (or "Tracker set" for a "Raw" link). |
| `audience` | No | `"everyone"` or `"choice"`. A hint for the GM's GitHub look-up: it pre-selects **Every player** or **Players choose**. The GM can change it. |
| `placement` | No | `"side"`, `"above"` or `"below"`. Where the set's trackers show on a force page: in the side column, or full width above or below the squad list. Default `"side"`. |
| `columns` | No | A whole number from 1 to 4. How many tiles across the trackers aim for when shown above or below the squad. |
| `notes` | No | Free text shown under the trackers, up to 10,000 characters. |

### Each tracker

| Key | Required | Value |
| --- | --- | --- |
| `name` | Yes | The tracker's name, 1 to 200 characters. |
| `type` | Yes | One of `number`, `list`, `stages`, `checklist`, `checkbox`, `text`. |
| `stages` | No | For `stages`: the stage names in order. Up to 30, each 1 to 200 characters. |
| `entries` | No | For `list`: entries to start with. Up to 100. Each has a `name` (1 to 200 characters) and an optional `detail` (up to 2,000 characters). |
| `options` | No | For `checklist`: the options to tick. Up to 50. Each has a `name` (1 to 200 characters) and an optional `detail` (up to 2,000 characters). |
| `value` | No | A starting value. A whole number for `number`, `true` or `false` for `checkbox`, text (up to 2,000 characters) for `text`. Ignored for the other types. |
| `lifetime` | No | For `number` only. `true` also keeps a running total of everything ever added, shown as "Lifetime". |
| `totals` | No | For `number` only. `false` leaves the tracker out of the campaign page's **Campaign totals**, for numbers that only matter to each player. Leave it out to include the tracker. |
| `placement` | No | `"side"`, `"above"` or `"below"` for this one tracker. Overrides the set's `placement`. |

### The six types

| `type` | In the app | What it is for |
| --- | --- | --- |
| `number` | Number | Points and tallies, with − and + buttons. |
| `list` | List | Things you unlock or collect. Each entry has a name and an optional description. |
| `stages` | Stages | A track you move along. One stage is current. |
| `checklist` | Checklist | A group of options you tick. |
| `checkbox` | Checkbox | A single on or off. |
| `text` | Text | A current choice, written as a line of text. |

Starting values when nothing else is given: a number starts at 0, a checkbox starts unticked, text starts empty, a list starts with its `entries` (or empty), stages start on the first stage, and every checklist option starts unticked.

### Limits

- The file must be 300,000 bytes or smaller.
- A trackers panel holds 50 trackers at most. Importing into a panel that is nearly full adds only as many as fit.

### Messages when a file is refused

| Message | Meaning |
| --- | --- |
| `That file isn't valid JSON.` | The file has a syntax mistake, such as a missing comma or quote. |
| `That isn't a tracker set. It needs "format": "crusade-ledger-tracker".` | The `format` line is missing or different. |
| `That tracker set has a problem at …` | One key has a wrong value. The message names where, for example `trackers.2.type`. |
| `That file is too big to be a tracker set.` | The file is over the size limit. |
| `That tracker set has no trackers in it.` / `That tracker set is empty.` | The `trackers` list is empty. |

## What may go in a set

A set may contain:

- names of things to track, as your group uses them;
- numbers, stage names, option names and list entries;
- descriptions and notes **in your own words**.

A set must not contain rules text, points values, datasheets or any other text copied from a Games Workshop publication. A description must not reproduce a rule. If a tracker needs a rule to make sense, name it and leave the rule in the book.

This applies to every set, wherever it is hosted. Sets that break it are not accepted into this project.
