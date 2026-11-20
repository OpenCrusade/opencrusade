/**
 * Spec 05, the campaign map: the GM uploads a picture, it is saved in
 * the crusade sheet as text, and the player sees it.
 */

import { test, expect } from "@playwright/test";
import { appReady, playerContext, readShared, sheetValues, waitForSynced, gotoCrusade } from "../helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe.configure({ mode: "serial" });

test("GM uploads a map and it is stored in the sheet", async ({ page }) => {
  const { crusadeId } = readShared();
  test.skip(!crusadeId, "earlier specs must run first");

  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);
  // With players in the campaign the GM sees the clean view first.
  const manage = page.getByRole("button", { name: "Manage campaign" });
  await expect(manage).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload a map" })).toHaveCount(0);
  await manage.click();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload a map" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId("map-file").setInputFiles({
    name: "map.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.getByRole("img", { name: "Campaign map" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: "Replace map" })).toBeVisible();
  await waitForSynced(page);

  const rows = await sheetValues("gm", crusadeId!, "'Crusade data'!A1:Z200");
  const mapRow = rows.find((r) => r[0] === "map");
  expect(mapRow, "a map row in the GM's data tab").toBeTruthy();
  expect(mapRow!.join("")).toContain("data:image/");
});

test("player sees the map but cannot change it", async ({ browser }) => {
  const { crusadeId } = readShared();
  test.skip(!crusadeId, "earlier specs must run first");

  const ctx = await playerContext(browser);
  const page = await ctx.newPage();
  await gotoCrusade(page, `/crusades/${crusadeId}`);
  await appReady(page);
  await expect(page.getByRole("img", { name: "Campaign map" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: /Replace map|Upload a map/ })).toHaveCount(0);
  await ctx.close();
});
