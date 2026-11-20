/**
 * Spec 04, the spreadsheet stands on its own. After the run, read the
 * fixture sheet straight from Google (no app) and check that a person
 * opening it would see a sensible front page and roster pages.
 *
 * Nothing is deleted: the app has no permission to delete files, and
 * the fixture sheet is wiped at the start of the next run instead.
 */

import { test, expect } from "@playwright/test";
import { GM_NAME, PLAYER_EMAIL, appReady, playerContext, readShared, sheetValues, gotoCrusade } from "../helpers";

test("the sheet is readable without the app", async () => {
  const { crusadeId, crusadeName, gmCharacterUnit, playerUnit } = readShared();
  test.skip(!crusadeId, "spec 01 must run first");

  // Front page (read as the player, everyone can view it).
  const front = await sheetValues("player", crusadeId!, "Crusade!B1:L40");
  expect(front[1][0]).toBe(crusadeName);
  const header = front.findIndex((r) => r[0] === "FORCE");
  expect(front[header].slice(0, 4)).toEqual(["FORCE", "COMMANDER", "TEAM", "UNITS"]);
  const standings = front
    .slice(header + 1)
    .filter((r) => typeof r[3] === "number")
    .slice(0, 2);
  expect(standings).toHaveLength(2);
  for (const row of standings) {
    expect(row[3]).toBeGreaterThan(0); // units
    expect(row[7]).toBe(1); // battles
  }
  const log = front.findIndex((r) => r[0] === "BATTLE");
  expect(String(front[log + 1][0])).toMatch(/E2E/);

  // Each player has a roster page with their Order of Battle.
  const gmPage = JSON.stringify(await sheetValues("player", crusadeId!, `'${GM_NAME}'!B1:J60`));
  expect(gmPage).toContain("ORDER OF BATTLE");
  expect(gmPage).toContain(gmCharacterUnit!);
  const playerPage = JSON.stringify(
    await sheetValues("gm", crusadeId!, "'E2E Player'!B1:J60"),
  );
  expect(playerPage).toContain(playerUnit!);

  // Membership lives in each player's own (hidden) data tab.
  const mine = await sheetValues("player", crusadeId!, "'data · E2E Player'!A1:D6");
  expect(mine.find((r) => r[0] === "profile")?.slice(2, 4)).toEqual([
    "E2E Player",
    PLAYER_EMAIL,
  ]);
});

test("a crusade link opens directly on a device that has never seen it", async ({
  browser,
}) => {
  const { crusadeId, crusadeName } = readShared();
  test.skip(!crusadeId, "spec 01 must run first");

  // Fresh browser profile = new device. No "Open a crusade" dialog:
  // the link itself is enough.
  const ctx = await playerContext(browser);
  const page = await ctx.newPage();
  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);
  await expect(
    page.getByRole("heading", { name: new RegExp(crusadeName!) }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("button", { name: /Copy crusade link/i }),
  ).toBeVisible();
  // Players get no link to the sheet; that is the GM's.
  await expect(page.getByRole("link", { name: /Open the Google Sheet/i })).toHaveCount(0);

  // The sheet's front page links back to the app.
  const front = await sheetValues("player", crusadeId!, "Crusade!B4:B4");
  expect(String(front[0][0])).toMatch(/Open this crusade in OpenCrusade/);
  await ctx.close();
});
