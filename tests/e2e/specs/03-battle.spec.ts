/**
 * Spec 03, the battle loop, end to end:
 *   GM records a battle → fields units → sets kills / a casualty →
 *   applies results (XP + promotion) → resolves the Out of Action
 *   test → picks the promotion honour. Player fills in their side and
 *   applies. GM marks the battle verified.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  appReady,
  clickButton,
  playerContext,
  readShared,
  writeShared,
  waitForSynced,
  GM_NAME,
  escapeRegExp, gotoCrusade } from "../helpers";

test.describe.configure({ mode: "serial" });

/** Wait until the participant section's autosave has settled: the
 *  "Unsaved edits" / "Saving…" markers are gone and the action button
 *  has left its "Saving…" state. */
async function waitForSaved(page: Page) {
  await expect(page.getByText("Unsaved edits")).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(page.getByText("Saving…", { exact: true })).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("button", { name: /Apply results/i }),
  ).toBeVisible({ timeout: 60_000 });
}

test("GM records a battle with both participants", async ({ page }) => {
  const { crusadeId } = readShared();
  test.skip(!crusadeId, "earlier specs must run first");

  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);

  // "Log battle" sits in the header on every crusade page.
  await page.getByRole("link", { name: "Log battle" }).first().click();
  await page.getByPlaceholder(/relay station/i).fill("E2E Test Engagement");
  // The recorder is picked already; they tick who they played.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox").first()).toBeChecked();
  const opponent = dialog.getByTestId("battle-opponents").getByRole("checkbox");
  await expect(opponent).not.toBeChecked();
  await opponent.check();
  // Exact arrow-suffixed label, the page CTA "+ Record battle" also
  // matches a loose /Record battle/ regex.
  await clickButton(page, /^Record battle$/);

  await page.waitForURL(/\/battles\/[\w-]+$/, { timeout: 60_000 });
  const battleId = page.url().split("/").pop()!;
  writeShared({ battleId });

  // Both participant sections render.
  await expect(page.getByText(/Your side/i)).toBeVisible();
  await expect(page.getByText(/Read-only/i).first()).toBeVisible();
});

test("GM enters the result and fields their units", async ({ page }) => {
  const { crusadeId, battleId, gmCharacterUnit, gmSquadUnit } = readShared();
  test.skip(!battleId, "battle must exist");

  await gotoCrusade(page, `/crusades/${crusadeId}/battles/${battleId}`);
  await appReady(page);

  // Field everything in one click.
  await clickButton(page, /Field all/i);

  // Character racks up 15 kills → +1 base +5 kills = 6 XP → Blooded.
  const charRow = page.locator("tr", { hasText: gmCharacterUnit! });
  // First spinbutton = Kills (second is Bonus XP).
  await charRow.getByRole("spinbutton").first().fill("15");

  // The squad dies, uncheck Survived (first checkbox in its row).
  const squadRow = page.locator("tr", { hasText: gmSquadUnit! });
  await squadRow.getByRole("checkbox").first().uncheck();
  await waitForSaved(page);

  // The GM recorded the battle, so the GM enters who won and the points.
  const result = page.getByTestId("battle-result");
  await result.getByLabel(new RegExp(`Outcome for ${escapeRegExp(GM_NAME)}`)).selectOption("victory");
  // Two-player battle: the opponent's outcome follows automatically.
  await expect(result.getByLabel(/Outcome for E2E Player/)).toHaveValue("defeat");
  await result.getByLabel(new RegExp(`Victory points for ${escapeRegExp(GM_NAME)}`)).fill("80");
  await result.getByLabel(/Victory points for E2E Player/).fill("45");
  await clickButton(page, /^Save result$/);
  await expect(result.getByText("Awaiting confirmation")).toBeVisible({
    timeout: 60_000,
  });
  await expect(result.getByText("Not yet confirmed")).toBeVisible();

  // Link a log of the battle kept somewhere else.
  const logs = page.getByTestId("battle-logs");
  await logs.getByLabel("Link to your battle log").fill("https://example.org/battle/123");
  await logs.getByRole("button", { name: "Save link" }).click();
  await expect(logs.getByRole("link", { name: "Your battle log" })).toHaveAttribute(
    "href",
    "https://example.org/battle/123",
    { timeout: 60_000 },
  );

  // What was at stake: a text box either player can fill in.
  const rewards = page.getByTestId("battle-rewards");
  await rewards.getByLabel("Rewards for this battle").fill("Winner gets a relic, loser gets nothing.");
  await rewards.getByRole("button", { name: "Save rewards" }).click();
  await expect(rewards.getByText(/Last written by you/)).toBeVisible({ timeout: 60_000 });

  // Agendas: typing one and moving on adds it; no hidden extra click.
  await page.getByPlaceholder("e.g. Hold the line").fill("E2E agenda");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("checkbox", { name: /E2E agenda/ })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /E2E agenda/ }).check();
  await expect(page.getByText("Achieved", { exact: true })).toBeVisible();

  // Their own XP doesn't wait for the other player to confirm.
  await expect(page.getByRole("button", { name: "Apply results" })).toBeEnabled({
    timeout: 60_000,
  });
});

test("player fills in their side, applies, then confirms the result", async ({
  browser,
}) => {
  const { crusadeId, battleId, playerUnit } = readShared();
  test.skip(!battleId, "battle must exist");

  const ctx = await playerContext(browser);
  const page = await ctx.newPage();

  // The crusade tells the player a result is waiting on them.
  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);
  const todos = page.getByTestId("battle-todos");
  await expect(todos).toContainText("You have 1 result to confirm", { timeout: 60_000 });
  await todos.getByRole("link").click();
  await page.waitForURL(new RegExp(`/battles/${battleId}$`));

  // The player sees the declared result read-only and confirms it.
  const result = page.getByTestId("battle-result");
  await expect(result.getByText("Defeat", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(result.getByRole("combobox")).toHaveCount(0);
  // The other player's log link is there to follow.
  await expect(
    page.getByTestId("battle-logs").getByRole("link", { name: `${GM_NAME}'s battle log` }),
  ).toBeVisible({ timeout: 60_000 });
  // The rewards the GM wrote are there, and the player can change them.
  const rewards = page.getByTestId("battle-rewards");
  await expect(rewards.getByLabel("Rewards for this battle")).toHaveValue(
    "Winner gets a relic, loser gets nothing.",
    { timeout: 60_000 },
  );
  await expect(rewards.getByText(new RegExp(`Last written by ${escapeRegExp(GM_NAME)}`))).toBeVisible();

  // Their own units first: different numbers from the GM's, nobody
  // checks, and applying them doesn't wait on the result.
  await clickButton(page, /Field all/i);
  const row = page.locator("tr", { hasText: playerUnit! });
  await row.getByRole("spinbutton").first().fill("3");

  await waitForSaved(page);
  await clickButton(page, /Apply results/i);

  // 3 kills → +1 base +1 = 2 XP.
  await expect(page.getByText(/\+2 XP/)).toBeVisible({ timeout: 60_000 });

  await clickButton(page, /Confirm result/i);
  await expect(result.getByText("Confirmed by everyone")).toBeVisible({
    timeout: 60_000,
  });

  await waitForSynced(page);
  await ctx.close();
});

test("GM applies results once the result is confirmed", async ({ page }) => {
  const { crusadeId, battleId } = readShared();
  test.skip(!battleId, "battle must exist");

  await gotoCrusade(page, `/crusades/${crusadeId}/battles/${battleId}`);
  await appReady(page);
  await clickButton(page, /Apply results/i);

  // Character got 6 XP and promoted.
  await expect(page.getByText(/\+6 XP/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/promoted to Blooded/i)).toBeVisible({
    timeout: 60_000,
  });
  await waitForSynced(page);
});

test("GM resolves the Out of Action test for the dead squad", async ({
  page,
}) => {
  const { crusadeId, battleId, gmSquadUnit } = readShared();
  test.skip(!battleId, "battle must exist");

  await gotoCrusade(page, `/crusades/${crusadeId}/battles/${battleId}`);
  await appReady(page);

  // OoA widget pending for the squad.
  await expect(
    page.getByText(/Out of Action test pending/i),
  ).toBeVisible({ timeout: 60_000 });

  // Roll a deliberate 1 → choose Gain scar.
  await page.getByRole("button", { name: "1", exact: true }).click();
  await clickButton(page, /Gain scar/i);
  await page.getByPlaceholder(/Walking wounded/i).fill("E2E Shaken");
  await clickButton(page, /Apply scar/i);

  // Resolved line replaces the widget.
  await expect(page.getByText(/gained a battle scar/i)).toBeVisible({
    timeout: 60_000,
  });

  // The scar shows on the unit's detail page.
  const { gmRosterId } = readShared();
  await page.goto(`/rosters/${gmRosterId}`);
  await page.getByRole("link", { name: gmSquadUnit!, exact: true }).click();
  // .first(), the scar renders in both the scars section and the
  // history timeline.
  await expect(page.getByText("E2E Shaken").first()).toBeVisible({
    timeout: 60_000,
  });
  await waitForSynced(page);
});

test("GM claims the promotion honour on the character", async ({ page }) => {
  const { crusadeId, crusadeName, gmRosterId, gmCharacterUnit } = readShared();
  test.skip(!gmRosterId, "roster must exist");

  // Each test is a fresh browser profile, a new device. A roster is
  // restored from the crusade it's attached to, so open that first.
  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);
  await expect(
    page.getByRole("heading", { name: new RegExp(crusadeName!) }),
  ).toBeVisible({ timeout: 60_000 });

  await page.goto(`/rosters/${gmRosterId}`);
  await appReady(page);
  await page.getByRole("link", { name: gmCharacterUnit!, exact: true }).click();

  // Promotion banner is up.
  await expect(page.getByText(/Promotion earned/i)).toBeVisible({
    timeout: 60_000,
  });
  await clickButton(page, /Pick honour/i);

  // Award a battle trait.
  await page
    .getByPlaceholder(/Steady aim/i)
    .fill("E2E Steady Aim");
  await clickButton(page, /^Award/);

  // Banner clears; honour listed.
  await expect(page.getByText(/Promotion earned/i)).not.toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("E2E Steady Aim").first()).toBeVisible();
  await waitForSynced(page);
});

test("battle is verified once everyone has confirmed the result", async ({
  page,
}) => {
  const { crusadeId, battleId } = readShared();
  test.skip(!battleId, "battle must exist");

  await gotoCrusade(page, `/crusades/${crusadeId}/battles/${battleId}`);
  await appReady(page);

  // No GM click required, the player's confirmation verified it.
  await expect(page.getByText("verified", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  // The force-close button is gone once verified.
  await expect(
    page.getByRole("button", { name: /Mark verified/i }),
  ).not.toBeVisible();

  // Standings on the crusade page count the confirmed result.
  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);
  await expect(page.getByText("E2E Test Engagement").first()).toBeVisible({
    timeout: 60_000,
  });
});
