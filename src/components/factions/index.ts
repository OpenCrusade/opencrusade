import type { FactionModule } from "./types";
import { GenericFactionPanel } from "./_generic/GenericFactionPanel";

/**
 * Every faction gets the same tracker, which the player shapes
 * themselves: the app ships no faction-specific names or rules.
 */
const GENERIC: FactionModule = {
  id: "generic",
  label: "My trackers",
  match: [],
  Component: GenericFactionPanel,
};

export function resolveFactionModule(_factionName: string): FactionModule {
  void _factionName;
  return GENERIC;
}

export type { FactionMechanicProps, FactionModule } from "./types";
