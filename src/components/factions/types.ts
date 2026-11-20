import type { PlayerRoster } from "@/types";

/**
 * Shared contract every faction module implements (spec US10 /
 * data-model § Faction Module Contract).
 *
 * Modules render inside the roster page and own the shape of
 * `roster.factionState`. All rules text is player-entered free text,
 * no GW content ships with the app.
 */
export interface FactionMechanicProps {
  roster: PlayerRoster;
  isOwner: boolean;
  /** Replace the roster-level factionState. Owner only. */
  onUpdateState: (state: Record<string, unknown>) => void;
  isSaving: boolean;
}

export interface FactionModule {
  id: string;
  /** Display name of the mechanic . */
  label: string;
  /** Case-insensitive substrings of factionName that select this module. */
  match: string[];
  Component: React.ComponentType<FactionMechanicProps>;
}
