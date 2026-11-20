/**
 * Roster export, BattleScribe `.ros` XML and plain JSON.
 *
 * The .ros output targets the BattleScribe 2.03 rosterSchema with the
 * real wh40k-10e gameSystemId from BSData (fetched 2026-07-14 from
 * github.com/BSData/wh40k-10e). Honest limitation: our units are free
 * text with no catalogue entry ids, so third-party apps (New Recruit,
 * BattleScribe) import them as CUSTOM entries, names, points, model
 * counts and crusade notes carry over, but they don't link to official
 * datasheet profiles. True linked export would require shipping GW
 * catalogue data, which we deliberately don't do.
 */

import type { CrusadeCard, PlayerRoster } from "@/types";

const GAME_SYSTEM_ID = "sys-352e-adc2-7639-d6a9";
const GAME_SYSTEM_NAME = "Warhammer 40,000 10th Edition";
const PTS_COST_TYPE_ID = "51b2-306e-1021-d207";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function crusadeNotes(u: CrusadeCard): string {
  const parts = [
    `Rank: ${u.rank} (${u.experiencePoints} XP)`,
    `Battles: ${u.battlesPlayed} played, ${u.battlesSurvived} survived`,
    `Enemies destroyed: ${u.enemiesDestroyed}`,
  ];
  if (u.battleHonours.length > 0) {
    parts.push(`Honours: ${u.battleHonours.map((h) => h.name).join(", ")}`);
  }
  if (u.battleScars.length > 0) {
    parts.push(`Scars: ${u.battleScars.map((s) => s.name).join(", ")}`);
  }
  if (u.equipment.length > 0) {
    parts.push(`Equipment: ${u.equipment.join(", ")}`);
  }
  return parts.join(" · ");
}

/** Serialise a roster as a best-effort BattleScribe .ros document. */
export function rosterToRos(roster: PlayerRoster): string {
  const totalPts = roster.units.reduce((sum, u) => sum + u.pointsCost, 0);

  const selections = roster.units
    .map((u) => {
      const nameAttr = esc(u.datasheetName || u.name);
      return [
        `      <selection id="${esc(u.id)}" name="${nameAttr}" ` +
          `entryId="opencrusade::${esc(u.id)}" number="1" type="unit" ` +
          `customName="${esc(u.name)}" customNotes="${esc(crusadeNotes(u))}">`,
        `        <costs><cost name="pts" typeId="${PTS_COST_TYPE_ID}" value="${u.pointsCost}.0"/></costs>`,
        `      </selection>`,
      ].join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<roster id="${esc(roster.id)}" name="${esc(roster.factionName)}" ` +
      `battleScribeVersion="2.03" gameSystemId="${GAME_SYSTEM_ID}" ` +
      `gameSystemName="${GAME_SYSTEM_NAME}" gameSystemRevision="119" ` +
      `xmlns="http://www.battlescribe.net/schema/rosterSchema">`,
    `  <costs><cost name="pts" typeId="${PTS_COST_TYPE_ID}" value="${totalPts}.0"/></costs>`,
    `  <forces>`,
    `    <force id="${esc(roster.id)}::force" name="Crusade Force" ` +
      `entryId="opencrusade::force" catalogueId="opencrusade" ` +
      `catalogueRevision="1" catalogueName="${esc(roster.factionName)}">`,
    `      <selections>`,
    selections,
    `      </selections>`,
    `    </force>`,
    `  </forces>`,
    `</roster>`,
    ``,
  ].join("\n");
}

/** Pretty-printed JSON of the full roster, doubles as a user backup. */
export function rosterToJson(roster: PlayerRoster): string {
  return JSON.stringify(roster, null, 2);
}

/** Trigger a browser download of a generated file. */
export function downloadFile(
  filename: string,
  mime: string,
  content: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Filesystem-safe filename stem from the roster's display name. */
export function exportStem(roster: PlayerRoster): string {
  return (
    roster.factionName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") ||
    roster.id
  );
}
