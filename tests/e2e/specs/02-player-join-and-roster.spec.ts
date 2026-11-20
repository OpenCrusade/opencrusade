/**
 * Spec 02, multi-player: the GM's only step is sharing the sheet and
 * sending the link. The player opens the link, joins (which creates
 * their own tab), builds a roster and attaches it.
 *
 * The fixture sheet is already shared with the player account, so the
 * player opens it from its link exactly as a real player would.
 */

import { test, expect } from "@playwright/test";
import {
  appReady,
  clickButton,
  fixtureUrl,
  newRunTag,
  playerContext,
  readShared,
  sheetValues,
  writeShared,
  PLAYER_EMAIL,
  waitForSynced, gotoCrusade } from "../helpers";

test.describe.configure({ mode: "serial" });

test("GM sees how to invite players", async ({ page }) => {
  const { crusadeId } = readShared();
  test.skip(!crusadeId, "spec 01 must run first");

  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);

  // No add-by-email step: the GM shares the sheet and sends the link.
  const invite = page.getByTestId("invite-players");
  await expect(invite).toBeVisible({ timeout: 60_000 });
  await expect(invite.getByRole("link", { name: /Open the Google Sheet/ })).toBeVisible();
  await expect(invite.getByRole("button", { name: /Copy crusade link/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add player/ })).toHaveCount(0);
});

test("player opens the crusade link and joins", async ({ browser }) => {
  const { crusadeId, crusadeName } = readShared();
  test.skip(!crusadeId, "spec 01 must run first");

  const ctx = await playerContext(browser);
  const page = await ctx.newPage();

  await page.goto("/crusades");
  await appReady(page);

  // New device: open the crusade from the link the GM sent.
  await clickButton(page, /Open a crusade/i);
  await page.getByPlaceholder(/docs\.google\.com\/spreadsheets/).fill(fixtureUrl());
  await clickButton(page, /^Open crusade$/);
  await page.waitForURL(`**/crusades/${crusadeId}`, { timeout: 60_000 });
  await expect(
    page.getByRole("heading", { name: new RegExp(crusadeName!) }),
  ).toBeVisible();

  // They can read it, but aren't a player until they join.
  const join = page.getByTestId("join-crusade");
  await expect(join).toBeVisible();
  await expect(page.getByRole("button", { name: /Attach a roster/i })).toHaveCount(0);
  await join.getByRole("textbox").fill("E2E Player");
  await clickButton(page, /^Join crusade$/);

  // Their own row appears, and the join panel goes away.
  const myRow = page.locator("tr", { hasText: "E2E Player" });
  await expect(myRow.getByText("Active", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(myRow.getByText("E2E Player")).toBeVisible();
  // The sheet itself is the GM's business: players get no link to it.
  await expect(page.getByRole("link", { name: /Open the Google Sheet/ })).toHaveCount(0);
  await expect(join).toHaveCount(0);

  await ctx.close();
});

test("player creates a roster inside the crusade from an imported list", async ({ browser }) => {
  const { crusadeId } = readShared();
  test.skip(!crusadeId, "spec 01 must run first");

  const TAG = newRunTag();
  const factionName = `E2E-${TAG} Blue Force`;
  const unitName = `E2E-${TAG} Heavy Team`;

  const ctx = await playerContext(browser);
  const page = await ctx.newPage();

  // Create the roster from inside the crusade, importing an army list
  // (the .ros format New Recruit and BattleScribe export).
  const ros = `<?xml version="1.0" encoding="UTF-8"?>
<roster id="r" name="E2E list" xmlns="http://www.battlescribe.net/schema/rosterSchema">
  <forces><force id="f" catalogueName="Group - Blue Force"><selections>
    <selection id="b" name="Battle Size" number="1" type="upgrade"/>
    <selection id="u" name="Heavy Team" customName="${unitName}" number="1" type="unit">
      <costs><cost name="pts" value="120.0"/></costs>
      <selections><selection id="m" name="Gunner" number="10" type="model"/></selections>
    </selection>
  </selections></force></forces>
</roster>`;

  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);
  await clickButton(page, /Create my roster/i);
  await page.getByTestId("roster-import-file").setInputFiles({
    name: "list.ros",
    mimeType: "application/xml",
    buffer: Buffer.from(ros),
  });
  await expect(page.getByTestId("roster-import-summary")).toHaveText(/1 unit, 120 pts/);
  // The faction is prefilled from the list; give it this run's name.
  await page.getByPlaceholder(/The Ashen Host/i).fill(factionName);
  await clickButton(page, /Create roster/i);

  // Lands on the new force, already in the crusade, with the unit.
  await page.waitForURL(/\/rosters\/[\w-]+$/, { timeout: 60_000 });
  const playerRosterId = page.url().split("/").pop()!;
  await expect(page.getByText(unitName).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "My force" })).toBeVisible({
    timeout: 60_000,
  });
  // The GM's campaign set arrives by itself; the faction set is a choice.
  // It asked for the wide space, so it sits in its own card named after the set.
  await expect(
    page.getByRole("region", { name: "E2E Campaign set" }).getByText("E2E Campaign tally", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("E2E Faction tally", { exact: true })).toHaveCount(0);
  // Choosing a set is set-up, so it sits behind "Edit trackers".
  const gmSets = page.getByTestId("gm-sets");
  await expect(gmSets).toHaveCount(0);
  await page.getByRole("button", { name: "Edit trackers" }).click();
  await gmSets.getByRole("combobox").selectOption({ label: "E2E Faction set" });
  await gmSets.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("E2E Faction tally", { exact: true })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Lock trackers" }).click();
  // Their campaign tally counts toward the crusade's total.
  // Locked by default: values change, but nothing can be removed or renamed.
  const set = page.getByRole("region", { name: "E2E Campaign set" });
  await expect(set.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  const tally = set.locator("li").filter({ hasText: /^E2E Campaign tally\d/ });
  // Gain 3, spend 1: 2 in hand, 3 over the campaign.
  for (let i = 0; i < 3; i++) await tally.getByRole("button", { name: /^Add 1 to/ }).click();
  await tally.getByRole("button", { name: /^Take 1 from/ }).click();
  await expect(tally.getByText("Lifetime 3")).toBeVisible({ timeout: 60_000 });

  // Unlock to reorder: the second tracker moves ahead of the first.
  // One switch for the whole page, in the "This force" card.
  await page.getByRole("button", { name: "Edit trackers" }).click();
  // A set every player has can't be removed by a player...
  await expect(set.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await expect(set.getByText("From your GM, so it can't be removed.").first()).toBeVisible();
  // ...but a faction set they chose can, and is then offered again.
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Remove E2E Faction tally", exact: true }).click();
  await expect(page.getByText("E2E Faction tally", { exact: true })).toHaveCount(0);
  await gmSets.getByRole("combobox").selectOption({ label: "E2E Faction set" });
  await gmSets.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("E2E Faction tally", { exact: true })).toBeVisible({ timeout: 60_000 });
  await set.getByRole("button", { name: "Move E2E Campaign tally two earlier" }).click();
  await expect(set.locator("li").first()).toContainText("E2E Campaign tally two");
  await page.getByRole("button", { name: "Lock trackers" }).click();
  await expect(set.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await waitForSynced(page);
  await page.getByRole("link", { name: "Campaign", exact: true }).click();
  const totals = page.getByRole("region", { name: "E2E Campaign tally", exact: true });
  // The force goes by its banner name, taken from the imported list.
  await expect(totals.getByText("E2E list")).toBeVisible({ timeout: 60_000 });
  await expect(totals.getByText("2 · 3 lifetime").first()).toBeVisible();
  await page.goBack();

  // A new force starts with the crusade's starting Requisition points.
  await expect(
    page.getByRole("img", { name: "5 of 10 Requisition points" }).first(),
  ).toBeVisible();

  // Re-import the same list after a points change: the unit is updated
  // in place, not duplicated.
  await page.getByTestId("roster-import-file").setInputFiles({
    name: "list.ros",
    mimeType: "application/xml",
    buffer: Buffer.from(ros.replace('value="120.0"', 'value="135.0"')),
  });
  const plan = page.getByTestId("import-plan");
  await expect(plan.getByText("Would update (1)")).toBeVisible();
  await expect(plan.getByText(/120 → 135 pts · same unit as last import/)).toBeVisible();
  await expect(plan.getByText("Would add as new (0)")).toBeVisible();
  await clickButton(page, /Update my units/);
  await expect(page.getByText("Updated 1 unit, added 0.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Heavy Team · 135 pts/)).toBeVisible();
  await expect(page.getByRole("link", { name: unitName, exact: true })).toHaveCount(1);

  writeShared({ playerRosterId, playerUnit: unitName });
  await waitForSynced(page);
  await ctx.close();
});

test("GM sees the player's roster, and the sheet's pages catch up", async ({
  page,
}) => {
  const { crusadeId, playerUnit } = readShared();
  test.skip(!playerUnit, "player attach must run first");

  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);

  // Two attached rosters now, GM's and player's.
  await expect(page.getByText("E2E Player").first()).toBeVisible({
    timeout: 60_000,
  });
  // Email addresses stay in the sheet; the app shows names only.
  await expect(page.getByText(PLAYER_EMAIL)).toHaveCount(0);

  // The player joined by themselves; the GM's app notices and redraws
  // the pages people see in Google Sheets (they're locked to the GM).
  await expect
    .poll(
      async () =>
        JSON.stringify(await sheetValues("gm", crusadeId!, "Crusade!B9:C14")),
      { timeout: 90_000 },
    )
    .toContain("E2E Player");
});

test("GM sees a player's trackers and can correct them", async ({ page, browser }) => {
  const { crusadeId, playerRosterId } = readShared();
  test.skip(!playerRosterId, "player attach must run first");

  // The GM opens the player's force and sees the trackers as the player has them.
  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);
  await expect(page.getByText("E2E Player").first()).toBeVisible({ timeout: 60_000 });
  await page.goto(`/rosters/${playerRosterId}`);
  await appReady(page);
  const set = page.getByRole("region", { name: "E2E Campaign set" });
  const tally = set.locator("li").filter({ hasText: /^E2E Campaign tally\d/ });
  await expect(tally.getByText("Lifetime 3")).toBeVisible({ timeout: 60_000 });
  // The values are the player's, not blanks.
  await expect(tally.getByText("2", { exact: true })).toBeVisible();
  // They can't touch the player's units.
  await expect(page.getByRole("button", { name: "Add unit" })).toHaveCount(0);
  // Nothing can be changed until the GM unlocks this force.
  await expect(page.getByRole("button", { name: "Add 1 Requisition point" })).toHaveCount(0);
  await expect(tally.getByRole("button", { name: /^Add 1 to/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Unlock to correct" }).click();
  // Then they can correct Requisition points: 5 to start, plus one.
  await page.getByRole("button", { name: "Add 1 Requisition point" }).click();
  await expect(
    page.getByRole("img", { name: "6 of 10 Requisition points" }).first(),
  ).toBeVisible({ timeout: 60_000 });

  // Correct the lifetime total, which the player would otherwise have to unlock to do.
  await tally.getByRole("button", { name: /^Correct lifetime .* up by 1$/ }).click();
  await expect(tally.getByText("Lifetime 4")).toBeVisible({ timeout: 60_000 });
  await waitForSynced(page);
  // It is written to the player's own tab in the sheet.
  await expect
    .poll(
      async () =>
        JSON.stringify(await sheetValues("gm", crusadeId!, "'data · E2E Player'!A1:Z60")),
      { timeout: 60_000 },
    )
    .toContain('\\"lifetime\\":4');
  // The unlock carries onto the player's units: fix a unit's XP.
  const playerTab = async () =>
    JSON.stringify(await sheetValues("gm", crusadeId!, "'data · E2E Player'!A1:Z60"));
  await page.getByRole("link", { name: /Heavy Team/ }).first().click();
  await page.waitForURL(/\/units\/[\w-]+$/);
  await expect(page.getByText("Correcting as GM")).toBeVisible();
  await page.getByRole("button", { name: "+1", exact: true }).click();
  await waitForSynced(page);
  await expect.poll(playerTab, { timeout: 60_000 }).toContain('\\"experiencePoints\\":1');
  // Put it back so later specs start from a clean unit.
  await page.getByRole("button", { name: "-1", exact: true }).click();
  await waitForSynced(page);
  await expect.poll(playerTab, { timeout: 60_000 }).not.toContain('\\"experiencePoints\\":1');
  await page.goBack();
  await expect(page.getByRole("button", { name: "Lock this force" })).toBeVisible();

  // Locking it again takes the controls away.
  await page.getByRole("button", { name: "Lock this force" }).click();
  await expect(page.getByRole("button", { name: "Add 1 Requisition point" })).toHaveCount(0);

  // The player's own app picks the correction up.
  const ctx = await playerContext(browser);
  const theirs = await ctx.newPage();
  await gotoCrusade(theirs, `/crusades/${crusadeId}`);
  await appReady(theirs);
  // A roster comes back from its crusade, so let the crusade load first.
  await expect(theirs.getByRole("region", { name: "Crusade summary" })).toBeVisible({
    timeout: 60_000,
  });
  await theirs.goto(`/rosters/${playerRosterId}`);
  await appReady(theirs);
  await expect(
    theirs.getByRole("region", { name: "E2E Campaign set" }).getByText("Lifetime 4"),
  ).toBeVisible({ timeout: 90_000 });
  // Their own count is untouched by the GM's edit, and the RP came through.
  await expect(
    theirs
      .getByRole("region", { name: "E2E Campaign set" })
      .locator("li")
      .filter({ hasText: /^E2E Campaign tally\d/ })
      .getByText("2", { exact: true }),
  ).toBeVisible();
  await expect(
    theirs.getByRole("img", { name: "6 of 10 Requisition points" }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await ctx.close();
});
