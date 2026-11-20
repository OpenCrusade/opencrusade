import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getCrusade, listCrusades } from "@/lib/db/crusades";
import {
  joinCrusade,
  createCrusade,
  openCrusadeFromLink,
  revalidateCrusade,
  setPlayerGroup,
  updateCrusadeConfig,
  setCrusadeMap,
  setTrackerSets,
  setPhases,
  updatePackState,
} from "@/lib/sync/crusade-ops";
import { useDexieQuery } from "./dexieQuery";
import { useAuth } from "./useAuth";
import type {
  CreateCrusadeInput,
  CrusadeConfigPatch,
} from "@/lib/sync/crusade-ops";
import type { Crusade, PackState } from "@/types";

/**
 * Read a single crusade by id, Dexie-first.
 *
 * `refetchInterval` re-runs the queryFn every 15 s while the page is
 * mounted; each run schedules a Drive revalidation, so other players'
 * changes (battle edits, new attachments) surface without a manual
 * refresh. The Dexie read itself is ~free; only the background
 * revalidation hits the network.
 */
export const POLL_MS = 60_000;

export function useCrusade(crusadeId: string | undefined) {
  return useDexieQuery({
    queryKey: ["crusade", crusadeId],
    fromDexie: async () =>
      crusadeId ? await getCrusade(crusadeId) : undefined,
    // Return the promise so the dexieQuery microtask waits for it
    // before re-reading Dexie + pushing fresh into the TQ cache.
    revalidate: () =>
      crusadeId ? revalidateCrusade(crusadeId) : undefined,
    options: {
      enabled: !!crusadeId,
      // Other people's changes arrive by re-reading the sheet. Once a
      // minute while the tab is showing, straight away when you come
      // back to it, never while it is hidden; "Refresh" in the footer
      // reads at once. Google limits reads per minute, so this stays slow.
      refetchInterval: POLL_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
}

/** Join a crusade the GM has shared with the signed-in player. */
export function useJoinCrusade(crusadeId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (displayName: string) => {
      if (!user) throw new Error("Not signed in");
      return joinCrusade(crusadeId, user, displayName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}

/** Read all crusades the local mirror knows about, Dexie-first. */
export function useCrusadeList() {
  return useDexieQuery({
    queryKey: ["crusade-list"],
    fromDexie: () => listCrusades(),
  });
}

/**
 * Create-crusade mutation. Calls Drive (folder + crusade.json) and
 * writes the resulting row to Dexie, then invalidates the list query.
 *
 * On error, leaves any orphan Drive folder behind, see
 * crusade-ops.ts for the rationale.
 */
export function useCreateCrusade() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCrusadeInput) => {
      if (!user) throw new Error("Not signed in");
      return createCrusade(input, user);
    },
    onSuccess: (crusade) => {
      queryClient.invalidateQueries({ queryKey: ["crusade-list"] });
      queryClient.invalidateQueries({ queryKey: ["crusade", crusade.id] });
    },
  });
}

/**
 * Open a crusade from the link (or spreadsheet id) the GM sent. No
 * picker: any sheet shared with the signed-in account opens directly.
 */
export function useJoinExistingCrusade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (link: string) => openCrusadeFromLink(link),
    onSuccess: (crusade) => {
      queryClient.invalidateQueries({ queryKey: ["crusade-list"] });
      queryClient.invalidateQueries({ queryKey: ["crusade", crusade.id] });
      queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
    },
  });
}

/**
 * GM saves settings + pack content + teams in one Drive write
 * (crusade settings dialog).
 */
export function useUpdateCrusadeConfig(crusadeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: CrusadeConfigPatch) =>
      updateCrusadeConfig(crusadeId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}

/** GM replaces the campaign's phases. */
export function useSetPhases(crusadeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (phases: Crusade["phases"]) => setPhases(crusadeId, phases),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}

/** GM replaces the crusade's tracker sets for players. */
export function useSetTrackerSets(crusadeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sets: Crusade["trackerSets"]) => setTrackerSets(crusadeId, sets),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}

/** GM sets, replaces or removes the campaign map. */
export function useSetCrusadeMap(crusadeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (map: Crusade["map"] | null) => setCrusadeMap(crusadeId, map),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}

/** GM assigns (or clears) a player's team. */
export function useSetPlayerGroup(crusadeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      playerGoogleId,
      groupId,
    }: {
      playerGoogleId: string;
      groupId: string | undefined;
    }) => setPlayerGroup(crusadeId, playerGoogleId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}

/** GM updates the crusade-level pack-mechanic tracker. Optimistic,
 *  bumps/toggles render instantly; Drive settles in the background. */
export function useUpdatePackState(crusadeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (state: PackState) => updatePackState(crusadeId, state),
    onMutate: async (state) => {
      await queryClient.cancelQueries({ queryKey: ["crusade", crusadeId] });
      const prev = queryClient.getQueryData(["crusade", crusadeId]);
      queryClient.setQueryData(
        ["crusade", crusadeId],
        (old: Record<string, unknown> | undefined) =>
          old ? { ...old, packState: state } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(["crusade", crusadeId], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}
