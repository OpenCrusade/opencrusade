/**
 * Spec 06, voiding a battle takes its applied results back off the
 * force of whoever's app sees the void. Runs last: it undoes spec 03.
 */

import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });
import { GM_NAME, appReady, clickButton, readShared, sheetValues, waitForSynced, gotoCrusade } from "../helpers";

test("voiding a battle takes its results back off the GM's force", async ({ page }) => {
  const { crusadeId, battleId } = readShared();
  test.skip(!battleId, "battle must exist");

  const gmTab = async () =>
    JSON.stringify(await sheetValues("gm", crusadeId!, `'data · ${GM_NAME}'!A1:Z200`));
  // Spec 03 applied this battle to the GM's units.
  expect(await gmTab()).toContain(`appliedBattleIds\\":[\\"${battleId}`);

  await gotoCrusade(page, `/crusades/${crusadeId}/battles/${battleId}`);
  await appReady(page);
  page.once("dialog", (d) => void d.accept());
  await clickButton(page, /Void battle/i);
  await expect(page.getByRole("button", { name: "Restore battle" })).toBeVisible({
    timeout: 60_000,
  });
  await waitForSynced(page);

  // The GM's units no longer carry the battle.
  await expect
    .poll(gmTab, { timeout: 90_000, intervals: [5_000] })
    .not.toContain(`appliedBattleIds\\":[\\"${battleId}`);
});

test("a unit's name, models and points can be changed", async ({ page }) => {
  const { crusadeId, gmRosterId, gmSquadUnit } = readShared();
  test.skip(!gmRosterId || !gmSquadUnit, "GM roster must exist");

  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);
  // A roster comes back from its crusade, so let the crusade load first.
  await expect(page.getByRole("region", { name: "Crusade summary" })).toBeVisible({
    timeout: 60_000,
  });
  await page.goto(`/rosters/${gmRosterId}`);
  await appReady(page);
  await page.getByRole("link", { name: gmSquadUnit!, exact: true }).first().click();
  await page.waitForURL(/\/units\/[\w-]+$/);

  // The honour tally is worked out, with a manual count for mission rewards.
  const tally = page.getByTestId("honour-tally");
  await expect(tally).toContainText("No honours waiting to be picked.");
  await tally.getByRole("button", { name: "One more honour from mission rewards" }).click();
  await expect(tally).toContainText("1 honour to pick.");
  await expect(tally).toContainText("1 from mission rewards");

  await clickButton(page, /Edit unit details/i);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Unit name").fill(`${gmSquadUnit} II`);
  await dialog.getByLabel("Models").fill("20");
  await dialog.getByLabel("Points").fill("321");
  await dialog.getByRole("button", { name: "Save unit" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: `${gmSquadUnit} II` })).toBeVisible();
  await expect(page.getByText(/20 models, 321 pts/)).toBeVisible();
  await waitForSynced(page);

  // It reaches the sheet, and the squad list shows the honour to pick.
  await expect
    .poll(
      async () => JSON.stringify(await sheetValues("gm", crusadeId!, `'data · ${GM_NAME}'!A1:Z200`)),
      { timeout: 90_000, intervals: [5_000] },
    )
    .toContain(`${gmSquadUnit} II`);
  await page.goto(`/rosters/${gmRosterId}`);
  await appReady(page);
  await expect(page.getByText(/321 pts/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Honour to choose")).toBeVisible();

  // A spent requisition can be taken back: the RP returns.
  const rp = async () =>
    Number(
      (await page.getByRole("img", { name: /of 10 Requisition points/ }).first().getAttribute("aria-label"))!.split(" ")[0],
    );
  const before = await rp();
  await clickButton(page, /Spend requisition/i);
  await page.getByRole("button", { name: /Legendary Veterans/ }).click();
  await page.getByLabel("Target unit").selectOption({ index: 1 });
  await clickButton(page, /Spend 3 RP/);
  await expect.poll(rp, { timeout: 60_000 }).toBe(before - 3);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Undo Legendary Veterans" }).click();
  await expect.poll(rp, { timeout: 60_000 }).toBe(before);
  await expect(page.getByRole("button", { name: "Undo Legendary Veterans" })).toHaveCount(0);
});
