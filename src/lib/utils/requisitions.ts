/**
 * Core requisition catalogue.
 *
 * Descriptions are paraphrased summaries (no rules text reproduced,
 * players own the books). Each entry declares how the app applies it:
 *
 *   - "auto":        deterministic mutation, no further input
 *   - "pick-unit":   needs a unit choice, then deterministic
 *   - "pick-scar":   needs a unit + one of its scars
 *   - "log-only":    bookkeeping happens on the tabletop; we record
 *                    the spend and the player's note
 */

export type RequisitionEffect =
  | { kind: "auto"; apply: "increase-supply"; amount: number }
  | { kind: "pick-unit"; apply: "raise-honour-cap" }
  | { kind: "pick-unit"; apply: "grant-honour-pick" }
  | { kind: "pick-scar"; apply: "remove-scar" }
  | { kind: "log-only" };

export interface RequisitionDef {
  id: string;
  name: string;
  /** RP cost. Some table entries scale, we charge the base and let
   *  players adjust via the manual RP controls when their book says
   *  otherwise. */
  cost: number;
  summary: string;
  effect: RequisitionEffect;
}

export const CORE_REQUISITIONS: RequisitionDef[] = [
  {
    id: "increase-supply-limit",
    name: "Increase Supply Limit",
    cost: 1,
    summary: "Raise your Order of Battle's supply limit by 200 points.",
    effect: { kind: "auto", apply: "increase-supply", amount: 200 },
  },
  {
    id: "renowned-heroes",
    name: "Renowned Heroes",
    cost: 1,
    summary:
      "Single out a CHARACTER for greatness: they immediately gain a battle honour of your choice.",
    effect: { kind: "pick-unit", apply: "grant-honour-pick" },
  },
  {
    id: "legendary-veterans",
    name: "Legendary Veterans",
    cost: 3,
    summary:
      "A non-CHARACTER unit becomes a legend of your army: its battle honour cap rises from 3 to 6.",
    effect: { kind: "pick-unit", apply: "raise-honour-cap" },
  },
  {
    id: "repair-and-recuperate",
    name: "Repair and Recuperate",
    cost: 1,
    summary: "Remove one battle scar from a unit.",
    effect: { kind: "pick-scar", apply: "remove-scar" },
  },
  {
    id: "rearm-and-resupply",
    name: "Rearm and Resupply",
    cost: 1,
    summary:
      "Swap a unit's wargear between battles. Edit the unit's equipment list to reflect the change.",
    effect: { kind: "log-only" },
  },
  {
    id: "fresh-recruits",
    name: "Fresh Recruits",
    cost: 1,
    summary:
      "Replenish a depleted unit's ranks. Update the unit's model count / points to match.",
    effect: { kind: "log-only" },
  },
  {
    id: "custom",
    name: "Custom / pack-specific requisition",
    cost: 1,
    summary:
      "Anything from your crusade pack or agreed at the table. Describe it; the cost defaults to 1 RP; adjust RP manually if your book differs.",
    effect: { kind: "log-only" },
  },
];

/** Rules cap: a player can never bank more than 10 RP. */
export const RP_CAP = 10;
