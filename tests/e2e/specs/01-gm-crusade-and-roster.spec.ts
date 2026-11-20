/**
 * Spec 01, GM: create crusade, build a roster, attach it.
 *
 * One test with steps (not separate tests) so the browser context,
 * and therefore Dexie, persists across the flow like a real session.
 * Cold-cache behaviour is exercised deliberately in specs 02/03,
 * which DO open fresh contexts.
 */

import { test, expect } from "@playwright/test";
import {
  appReady,
  clickButton,
  newRunTag,
  writeShared,
  fixtureUrl,
  readShared,
  sheetValues,
  waitForSynced,
  GM_NAME, gotoCrusade } from "../helpers";

const TAG = newRunTag();
const CRUSADE_NAME = `E2E-${TAG} Border Campaign`;
const FACTION_NAME = `E2E-${TAG} Red Force`;
const CHARACTER_NAME = `E2E-${TAG} Commander`;
const SQUAD_NAME = `E2E-${TAG} First Squad`;

test("GM creates a crusade, builds a roster, and attaches it", async ({
  page,
}) => {
  await test.step("signed-in landing redirects to dashboard", async () => {
    await page.goto("/");
    await page.waitForURL("**/crusades", { timeout: 30_000 });
    await appReady(page);
    await expect(page.getByRole("heading", { name: "Crusades" })).toBeVisible();
  });

  let crusadeId = "";
  await test.step("create the crusade", async () => {
    await clickButton(page, /New crusade/i);

    // No consent explainer, seeded session already has the Sheets scope.
    // Run in the standing fixture sheet (already shared with the player)
    // instead of creating a new spreadsheet every run.
    const nameInput = page.getByPlaceholder(/Varn Reach/i);
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill(CRUSADE_NAME);
    await page.getByTestId("existing-sheet").fill(fixtureUrl());

    await clickButton(page, /Begin crusade/i);
    await page.waitForURL(/\/crusades\/[\w-]+$/, { timeout: 60_000 });
    await expect(
      page.getByRole("heading", { name: new RegExp(CRUSADE_NAME) }),
    ).toBeVisible();

    crusadeId = page.url().split("/").pop()!;
    writeShared({ crusadeName: CRUSADE_NAME, crusadeId });
    expect(crusadeId).toBe(readShared().fixtureId);

    // The sheet itself: a config row in the data tab and a front page.
    const config = await sheetValues("gm", crusadeId, "'Crusade data'!A2:C2");
    expect(config[0]).toEqual(["crusade", "config", CRUSADE_NAME]);
    await expect
      .poll(async () => (await sheetValues("gm", crusadeId, "Crusade!B2:B2"))[0]?.[0], {
        timeout: 30_000,
      })
      .toBe(CRUSADE_NAME);
  });

  let gmRosterId = "";
  await test.step("create a roster with two units", async () => {
    await page.goto("/rosters");
    await appReady(page);

    await clickButton(page, /New roster/i);
    await page.getByPlaceholder(/The Ashen Host/i).fill(FACTION_NAME);
    await clickButton(page, /Create roster/i);

    await page.getByRole("link", { name: FACTION_NAME }).first().click();
    await page.waitForURL(/\/rosters\/[\w-]+$/, { timeout: 30_000 });
    gmRosterId = page.url().split("/").pop()!;
    writeShared({ gmRosterId });

    // Character.
    await clickButton(page, /Add unit/i);
    await page.getByTestId("unit-name").fill(CHARACTER_NAME);
    await page.getByTestId("unit-datasheet").fill("Field Commander");
    await page.getByTestId("unit-points").fill("60");
    await page.getByTestId("unit-models").fill("1");
    await page.getByLabel(/CHARACTER/i).check();
    await clickButton(page, /Enroll unit/i);
    await expect(page.getByText(CHARACTER_NAME).first()).toBeVisible({
      timeout: 30_000,
    });

    // Squad.
    await clickButton(page, /Add unit/i);
    await page.getByTestId("unit-name").fill(SQUAD_NAME);
    await page.getByTestId("unit-datasheet").fill("Line Infantry");
    await page.getByTestId("unit-points").fill("150");
    await page.getByTestId("unit-models").fill("20");
    await clickButton(page, /Enroll unit/i);
    await expect(page.getByText(SQUAD_NAME).first()).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(/210/).first()).toBeVisible();
    writeShared({ gmCharacterUnit: CHARACTER_NAME, gmSquadUnit: SQUAD_NAME });
  });

  await test.step("attach the roster to the crusade", async () => {
    await gotoCrusade(page, `/crusades/${crusadeId}`);
    await appReady(page);

    await clickButton(page, /Attach a roster/i);
    await page
      .getByRole("listitem")
      .filter({ hasText: FACTION_NAME })
      .getByRole("button", { name: /^Attach/ })
      .click();

    await expect(
      page.getByRole("link", { name: FACTION_NAME }).first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("link", { name: /Open my roster/i }),
    ).toBeVisible();
  });

  await test.step("configure pack content and a team in settings", async () => {
    await clickButton(page, /^Settings$/);

    // Pack content lists, one name per line.
    const dialog = page.getByRole("dialog");
    await dialog
      .getByPlaceholder(/Hold the line/)
      .fill("E2E Purge the Foe\nE2E Hold the Line");
    await dialog.getByPlaceholder(/Night raid/).fill("E2E Vital Ground");

    // A team.
    await dialog.getByPlaceholder(/Defenders/).fill("E2E Team Alpha");
    await clickButton(page, /\+ Team/);
    await expect(dialog.getByText("E2E Team Alpha")).toBeVisible();

    await clickButton(page, /Save settings/);
    await expect(dialog).not.toBeVisible({ timeout: 60_000 });

    // Team column appears; GM assigns themself.
    const gmRow = page.locator("tr", { hasText: GM_NAME }).filter({ has: page.getByRole("combobox") });
    await gmRow.getByRole("combobox").selectOption({ label: "E2E Team Alpha" });
    // Team standings live on the full table page.
    await page.getByRole("link", { name: "Full table" }).click();
    await expect(page.getByText(/Team standings/i)).toBeVisible({
      timeout: 60_000,
    });
    await page.goBack();
  });

  await test.step("track a campaign counter on the pack panel", async () => {
    await page
      .getByPlaceholder(/Track something/i)
      .fill("E2E Territory held");
    await clickButton(page, /\+ Track/);
    const counterRow = page.locator("li", { hasText: "E2E Territory held" });
    await expect(counterRow).toBeVisible({ timeout: 60_000 });
    await counterRow.getByRole("button", { name: /^Add 1 to/ }).click();
    await expect(counterRow.getByText("1", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
  });

  await test.step("write a campaign phase", async () => {
    await clickButton(page, /Add a phase/);
    const dialog = page.getByRole("dialog", { name: "Phase" });
    await dialog.getByLabel("Title").fill("E2E First landings");
    await dialog.getByLabel("Narrative").fill("The fleets arrive.");
    await dialog.getByLabel("Begins").fill("2020-01-01");
    await dialog.getByLabel("Ends").fill("2099-12-31");
    await clickButton(page, /Save phase/);
    const phases = page.getByRole("region", { name: "Phases" });
    await expect(phases.getByText("E2E First landings")).toBeVisible({ timeout: 60_000 });
    await expect(phases.getByText("The fleets arrive.")).toBeVisible();
    await expect(phases.getByText("Active", { exact: true })).toBeVisible();
    await expect(phases.getByText("31 Dec 2099")).toBeVisible();
  });

  await test.step("give players a campaign set and a faction set", async () => {
    const card = page.getByRole("region", { name: "Tracker sets for players" });
    const list = page.getByTestId("tracker-set-list");
    const file = (name: string, tracker: string) => ({
      name: `${name}.json`,
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "crusade-ledger-tracker",
          version: 1,
          name,
          // The campaign set asks for the wide space above the squad.
          ...(name.includes("Campaign") ? { placement: "above" } : {}),
          trackers: [{ name: tracker, type: "number", lifetime: true }, { name: `${tracker} two`, type: "number" }],
        }),
      ),
    });
    await page.getByTestId("crusade-set-file").setInputFiles(file("E2E Campaign set", "E2E Campaign tally"));
    await expect(list.getByText("E2E Campaign set")).toBeVisible({ timeout: 60_000 });
    await card.getByRole("button", { name: "Players choose" }).click();
    await page.getByTestId("crusade-set-file").setInputFiles(file("E2E Faction set", "E2E Faction tally"));
    await expect(list.getByText("E2E Faction set")).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText(/Every player · 2 trackers/)).toBeVisible();
    await expect(card.getByText(/Players choose · 2 trackers/)).toBeVisible();
  });

  await test.step("import a tracker set from a file", async () => {
    const set = {
      format: "crusade-ledger-tracker",
      version: 1,
      name: "E2E set",
      trackers: [
        { name: "E2E Stage", type: "stages", stages: ["Scouting", "Assault"] },
        { name: "E2E Upgrades", type: "list", entries: [{ name: "E2E Entry", detail: "Does a thing" }] },
      ],
    };
    await page.getByText("Import or share a tracker set").click();
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("tracker-set-file").setInputFiles({
      name: "set.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(set)),
    });
    await expect(page.getByText("Added 2 trackers.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "1. Scouting" })).toBeVisible();
    await expect(page.getByText("E2E Entry")).toBeVisible();
    // The counter added earlier is still there.
    await expect(page.locator("li", { hasText: "E2E Territory held" })).toBeVisible();
  });

  await waitForSynced(page);
});
