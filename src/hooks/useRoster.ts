import type { ImportedOrderOfBattle, ImportedUnit } from "@/lib/import/roster-import";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRosterByRosterId,
  listRostersByOwner,
} from "@/lib/db/rosters";
import { listCrusades } from "@/lib/db/crusades";
import {
  addUnit,
  addUnits,
  updateUnitsFromList,
  adjustRequisitionPoints,
  attachRosterToCrusade,
  restoreMyRosters,
  createRoster,
  listAttachedRosters,
  removeUnit,
  renameAttachmentBanner,
  revalidateRoster,
  setFaction,
  type AddUnitInput,
  type CreateRosterInput,
} from "@/lib/sync/roster-ops";
import { useCrusade, POLL_MS } from "./useCrusade";
import type { AttachedRoster, PlayerRoster } from "@/types";

/**
 * Find a roster by id wherever it lives locally:
 *   1. The player's own Library (canonical). Editable.
 *   2. Any known crusade's `attachedRosters[]` (mirror). Read-only.
 *
 * Returns `PlayerRoster` (or undefined). When the source is a mirror,
 * the returned object is an `AttachedRoster` which structurally
 * extends `PlayerRoster`, so callers that just need the roster shape
 * (faction, units, etc.) work without changes.
 */
async function findRosterAnywhere(
  rosterId: string,
): Promise<PlayerRoster | undefined> {
  const canonical = await getRosterByRosterId(rosterId);
  if (canonical) return canonical;

  // Fall back to crusade mirrors. Local-only: we don't hit Drive here.
  const crusades = await listCrusades();
  for (const crusade of crusades) {
    const mirror = (crusade.attachedRosters ?? []).find(
      (a) => a.id === rosterId,
    );
    if (mirror) return mirror;
  }
  return undefined;
}
import { useDexieQuery } from "./dexieQuery";
import { useAuth } from "./useAuth";

/**
 * Read a roster by its stable id, Dexie-first.
 *
 * Looks in (a) the user's own Library, then (b) any crusade's
 * `attachedRosters[]`. For mirrors, revalidation happens via the
 * parent crusade's `useCrusade` query, no separate roster fetch
 * needed: another player's force only exists as the copy in the
 * crusade's sheet.
 */
export function useRoster(rosterId: string | undefined) {
  return useDexieQuery({
    queryKey: ["roster", rosterId],
    fromDexie: async () =>
      rosterId ? await findRosterAnywhere(rosterId) : undefined,
    revalidate: () =>
      rosterId ? revalidateRoster(rosterId) : undefined,
    options: {
      enabled: !!rosterId,
      // Someone else may be changing this force (its owner, or the GM
      // correcting it), so look again regularly.
      refetchInterval: POLL_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
}

/** Library: every roster owned by the signed-in user, Dexie-first. */
export function useMyRosters() {
  const { user } = useAuth();
  return useDexieQuery({
    queryKey: ["my-rosters", user?.googleId],
    fromDexie: async () =>
      user ? await listRostersByOwner(user.googleId) : [],
    options: { enabled: !!user },
  });
}

/**
 * Discover rosters of mine that are in a crusade's sheet but not on
 * this device. Runs once per session, once Sheets access is granted.
 */
export function useBootstrapMyRosters() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      return restoreMyRosters();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
    },
  });
}

export function useCreateRoster() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRosterInput) => {
      if (!user) throw new Error("Not signed in");
      return createRoster(input, user);
    },
    onSuccess: (roster) => {
      queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
      queryClient.invalidateQueries({ queryKey: ["roster", roster.id] });
    },
  });
}

export function useAddUnit(rosterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddUnitInput) => addUnit(rosterId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster", rosterId] });
      queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
    },
  });
}

/** Re-import a list: update matching units, add the rest. */
export function useUpdateUnitsFromList(rosterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (incoming: ImportedUnit[]) => updateUnitsFromList(rosterId, incoming),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster", rosterId] });
      queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
    },
  });
}

/** Add several units at once (roster import). */
export function useAddUnits(rosterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      inputs: AddUnitInput[] | { units: AddUnitInput[]; orderOfBattle?: ImportedOrderOfBattle },
    ) =>
      Array.isArray(inputs)
        ? addUnits(rosterId, inputs)
        : addUnits(rosterId, inputs.units, inputs.orderOfBattle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster", rosterId] });
      queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
    },
  });
}

export function useRemoveUnit(rosterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (unitId: string) => removeUnit(rosterId, unitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster", rosterId] });
    },
  });
}

/** Manual RP adjust (+/-). Clamped at 0 in the op. */
export function useAdjustRP(rosterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (delta: number) => adjustRequisitionPoints(rosterId, delta),
    onMutate: async (delta) => {
      const key = ["roster", rosterId] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<
        import("@/types").PlayerRoster | undefined
      >(key);
      if (previous) {
        queryClient.setQueryData(key, {
          ...previous,
          requisitionPoints: Math.max(
            0,
            previous.requisitionPoints + delta,
          ),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["roster", rosterId], ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["roster", rosterId] });
      queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
    },
  });
}

export function useSetFaction(rosterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { factionName: string; colour?: string }) =>
      typeof input === "string"
        ? setFaction(rosterId, input)
        : setFaction(rosterId, input.factionName, undefined, input.colour),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster", rosterId] });
      queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
    },
  });
}

export function useAttachRoster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      crusadeId,
      rosterId,
    }: {
      crusadeId: string;
      rosterId: string;
    }) => attachRosterToCrusade(crusadeId, rosterId),
    onSuccess: (_result, vars) => {
      // useCrusadeMirrors derives from ["crusade", id]; invalidating
      // that key refreshes both the crusade view and the inline
      // attached-rosters list.
      queryClient.invalidateQueries({
        queryKey: ["crusade", vars.crusadeId],
      });
      queryClient.invalidateQueries({
        queryKey: ["roster", vars.rosterId],
      });
      queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
    },
  });
}

/**
 * Rename the per-crusade banner on an attached roster.
 *
 * Optimistic: updates the TanStack Query cache for the parent crusade
 * BEFORE the Drive write fires, so the user sees the new banner in
 * <50 ms. The Drive write happens in the background. On failure, we
 * roll the cache back. Other accounts see the update on their next
 * crusade revalidation (page mount / poll).
 */
export function useRenameAttachmentBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      rosterId,
      crusadeId,
      newBanner,
    }: {
      rosterId: string;
      crusadeId: string;
      newBanner: string;
    }) => renameAttachmentBanner(rosterId, crusadeId, newBanner),

    onMutate: async (vars) => {
      const crusadeKey = ["crusade", vars.crusadeId] as const;
      // Stop any in-flight refetches that could overwrite our
      // optimistic update mid-mutation.
      await queryClient.cancelQueries({ queryKey: crusadeKey });

      // Snapshot for rollback.
      const previous = queryClient.getQueryData<
        import("@/types").Crusade | undefined
      >(crusadeKey);

      if (previous) {
        queryClient.setQueryData(crusadeKey, {
          ...previous,
          attachedRosters: (previous.attachedRosters ?? []).map((entry) =>
            entry.id === vars.rosterId
              ? { ...entry, crusadeBanner: vars.newBanner }
              : entry,
          ),
        });
      }
      return { previous };
    },

    onError: (_err, vars, context) => {
      // Roll back.
      if (context?.previous) {
        queryClient.setQueryData(
          ["crusade", vars.crusadeId],
          context.previous,
        );
      }
    },

    onSettled: (_result, _err, vars) => {
      // Re-fetch to reconcile against whatever Drive actually has.
      queryClient.invalidateQueries({
        queryKey: ["crusade", vars.crusadeId],
      });
      queryClient.invalidateQueries({ queryKey: ["roster", vars.rosterId] });
    },
  });
}

/**
 * Read attached rosters for a crusade. v2.6: inline in crusade.json,
 * so we just derive from `useCrusade`. This keeps the mirrors view
 * automatically in sync with the underlying crusade query, any Drive
 * revalidation that updates the crusade also updates this view.
 */
export function useCrusadeMirrors(
  crusadeId: string | undefined,
): { data: AttachedRoster[]; isLoading: boolean } {
  const { data: crusade, isLoading } = useCrusade(crusadeId);
  const data = crusade ? listAttachedRosters(crusade) : [];
  return { data, isLoading };
}
