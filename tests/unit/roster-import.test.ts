import { describe, expect, it } from "vitest";
import { parseRosterJson, parseRosterXml } from "@/lib/import/roster-import";
import { rosterToRos } from "@/lib/export/roster-export";
import type { PlayerRoster } from "@/types";

const ROS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<roster id="r1" name="Crusade 1000" battleScribeVersion="2.03" xmlns="http://www.battlescribe.net/schema/rosterSchema">
  <costs><cost name="pts" typeId="x" value="290.0"/></costs>
  <forces>
    <force id="f1" name="Army Roster" catalogueName="Group - Red Force">
      <selections>
        <selection id="s0" name="Battle Size" number="1" type="upgrade">
          <selections><selection id="s00" name="Incursion (1000 Point limit)" number="1" type="upgrade"/></selections>
        </selection>
        <selection id="s1" name="Commander" customName="The Whisperer" number="1" type="model">
          <costs><cost name="pts" typeId="x" value="100.0"/></costs>
          <categories><category id="c1" name="Character" primary="true"/><category id="c2" name="Faction: Red Force"/></categories>
          <selections><selection id="s10" name="Signal horn" number="1" type="upgrade"/></selections>
        </selection>
        <selection id="s2" name="First Squad" number="1" type="unit">
          <costs><cost name="pts" typeId="x" value="70.0"/></costs>
          <categories><category id="c3" name="Infantry" primary="true"/></categories>
          <selections>
            <selection id="s20" name="Trooper" number="10" type="model">
              <selections><selection id="s200" name="Trooper blades" number="10" type="upgrade"/></selections>
            </selection>
          </selections>
        </selection>
        <selection id="s3" name="Heavy Team" number="1" type="unit">
          <costs><cost name="pts" typeId="x" value="60.0"/></costs>
          <selections>
            <selection id="s30" name="Gunner" number="19" type="model">
              <costs><cost name="pts" typeId="x" value="60.0"/></costs>
            </selection>
            <selection id="s31" name="Gunner w/ launcher" number="1" type="model"/>
          </selections>
        </selection>
      </selections>
    </force>
  </forces>
</roster>`;

describe("roster import", () => {
  it("reads units from a BattleScribe / New Recruit .ros", () => {
    const r = parseRosterXml(ROS);
    expect(r.name).toBe("Crusade 1000");
    expect(r.factionName).toBe("Red Force");
    expect(r.units.map((u) => u.datasheetName)).toEqual([
      "Commander",
      "First Squad",
      "Heavy Team",
    ]);
    const [commander, squad, heavy] = r.units;
    expect(commander).toMatchObject({
      name: "The Whisperer",
      pointsCost: 100,
      modelCount: 1,
      isCharacter: true,
      equipment: ["Signal horn"],
    });
    expect(squad).toMatchObject({ pointsCost: 70, modelCount: 10, isCharacter: false });
    expect(squad.equipment).toEqual(["10x Trooper blades"]);
    // Costs on nested selections add to the unit's own.
    expect(heavy).toMatchObject({ pointsCost: 120, modelCount: 20 });
    expect(r.points).toBe(290);
  });

  it("skips list settings such as battle size", () => {
    expect(parseRosterXml(ROS).units.some((u) => u.name === "Battle Size")).toBe(false);
  });

  it("reads the same tree from New Recruit's JSON export", () => {
    const json = JSON.stringify({
      roster: {
        name: "My list",
        forces: [
          {
            catalogueName: "Group - Blue Force",
            selections: [
              { name: "Detachment", type: "upgrade", number: 1 },
              {
                name: "Commander",
                type: "model",
                number: 1,
                costs: [{ name: "pts", value: 90 }],
                categories: [{ name: "Character" }],
              },
              {
                name: "First Squad",
                type: "unit",
                number: 1,
                costs: [{ name: "pts", value: 75 }],
                selections: [
                  { name: "Trooper", type: "model", number: 4 },
                  { name: "Squad Leader", type: "model", number: 1 },
                ],
              },
            ],
          },
        ],
      },
    });
    const r = parseRosterJson(json);
    expect(r.factionName).toBe("Blue Force");
    expect(r.units).toHaveLength(2);
    expect(r.units[0]).toMatchObject({ name: "Commander", isCharacter: true, pointsCost: 90 });
    expect(r.units[1]).toMatchObject({ modelCount: 5, pointsCost: 75 });
  });

  it("round-trips this app's own .ros export", () => {
    const roster = {
      id: "r",
      factionName: "Red Force",
      units: [
        { id: "u1", name: "Old Reliable", datasheetName: "Heavy Walker", pointsCost: 140, modelCount: 1,
          isCharacter: false, rank: "Battle-ready", experiencePoints: 0, battlesPlayed: 0,
          battlesSurvived: 0, enemiesDestroyed: 0, battleHonours: [], battleScars: [], equipment: [] },
      ],
    } as unknown as PlayerRoster;
    const r = parseRosterXml(rosterToRos(roster));
    expect(r.factionName).toBe("Red Force");
    expect(r.units[0]).toMatchObject({ name: "Old Reliable", datasheetName: "Heavy Walker", pointsCost: 140 });
  });

  it("rejects files that are not rosters", () => {
    expect(() => parseRosterXml("<html></html>")).toThrow(/isn't a roster/);
    expect(() => parseRosterJson("{}")).toThrow(/isn't a roster/);
    expect(() => parseRosterJson("not json")).toThrow(/couldn't be read/);
  });
});

// New Recruit's crusade export: Order of Battle, rank in the unit name,
// and Crusade entries (XP, tallies, honours, scars) on the unit.
const CRUSADE_ROS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<roster id="r2" name="Blue Host" xmlns="http://www.battlescribe.net/schema/rosterSchema">
  <forces>
    <force id="f1" name="Crusade Force" catalogueName="Group - Blue Force">
      <selections>
        <selection id="ob" name="Order of Battle" number="1" type="upgrade">
          <selections>
            <selection id="ob1" name="Invented Campaign" number="1" type="upgrade" group="Current Campaign"/>
            <selection id="ob2" name="Supply Limit" number="1250" type="upgrade"/>
            <selection id="ob3" name="Requisition Points" number="4" type="upgrade"/>
          </selections>
          <categories><category name="Order of Battle"/></categories>
        </selection>
        <selection id="u1" name="Commander (Blooded)" type="model" number="1">
          <costs><cost name="pts" value="90"/></costs>
          <categories><category name="Character"/></categories>
          <selections>
            <selection id="c1" name="Experience Points" number="7" type="upgrade" group="Crusade">
              <costs><cost name="Crusade: Experience" value="7"/></costs>
            </selection>
            <selection id="c2" name="Battles Played" number="3" type="upgrade" group="Crusade::Battle Tallies"/>
            <selection id="c3" name="Battles Survived" number="2" type="upgrade" group="Crusade::Battle Tallies"/>
            <selection id="c4" name="Enemy Units Destroyed" number="4" type="upgrade" group="Crusade::Battle Tallies"/>
            <selection id="c5" name="Steady Aim" number="1" type="upgrade" group="Crusade::Battle Honours::Battle Traits">
              <costs><cost name="Crusade Points" value="1"/></costs>
            </selection>
            <selection id="c6" name="Old Banner" number="1" type="upgrade" group="Crusade::Battle Honours::Crusade Relics::Antiquity Relics">
              <costs><cost name="Crusade Points" value="2"/></costs>
            </selection>
            <selection id="c7" name="Honed Blade" number="1" type="upgrade" group="Crusade::Battle Honours::Weapon Modifications">
              <costs><cost name="Crusade Points" value="1"/></costs>
            </selection>
            <selection id="c8" name="Limping" number="1" type="upgrade" group="Crusade::Battle Scars">
              <costs><cost name="Crusade Points" value="-1"/></costs>
            </selection>
            <selection id="w1" name="Long Rifle" number="1" type="upgrade" group="Wargear"/>
          </selections>
        </selection>
        <selection id="u2" name="First Squad (Battle-ready)" type="unit" number="1">
          <costs><cost name="pts" value="60"/></costs>
          <selections>
            <selection id="m1" name="Trooper" type="model" number="5"/>
          </selections>
        </selection>
      </selections>
    </force>
  </forces>
</roster>`;

describe("crusade progress in a New Recruit list", () => {
  const r = parseRosterXml(CRUSADE_ROS);

  it("reads the Order of Battle", () => {
    expect(r.orderOfBattle).toEqual({ supplyLimit: 1250, requisitionPoints: 4 });
  });

  it("takes the rank off unit names", () => {
    expect(r.units.map((u) => u.datasheetName)).toEqual(["Commander", "First Squad"]);
    expect(r.units.map((u) => u.name)).toEqual(["Commander", "First Squad"]);
  });

  it("reads XP, tallies, honours and scars, and keeps them out of wargear", () => {
    const [cmd, squad] = r.units;
    expect(cmd.equipment).toEqual(["Long Rifle"]);
    expect(cmd.crusade).toEqual({
      experiencePoints: 7,
      crusadePoints: 3,
      battlesPlayed: 3,
      battlesSurvived: 2,
      enemiesDestroyed: 4,
      honours: [
        { name: "Steady Aim", type: "battle-trait" },
        { name: "Old Banner", type: "crusade-relic", relicTier: "antiquity", relicCrusadePoints: 2 },
        { name: "Honed Blade", type: "weapon-modification" },
      ],
      scars: ["Limping"],
    });
    expect(squad.crusade).toBeUndefined();
  });
});
