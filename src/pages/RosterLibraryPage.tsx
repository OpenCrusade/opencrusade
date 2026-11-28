import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { SpecimenHeader } from "@/components/design/SpecimenHeader";
import { NewRosterForm } from "@/components/roster/NewRosterForm";
import { PreConsentExplainer } from "@/components/consent/PreConsentExplainer";
import {
  useBootstrapMyRosters,
  useCreateRoster,
  useMyRosters,
} from "@/hooks/useRoster";
import { useAuth } from "@/hooks/useAuth";
import { addUnits } from "@/lib/sync/roster-ops";
import { SHEETS_EXPLAINER } from "@/lib/consent/copy";

/**
 * Player's roster library. Lives in /rosters.
 *
 * On a device with no local rosters, rebuild any of the player's
 * rosters found in the crusades this device has opened.
 */
export function RosterLibraryPage() {
  const { signedIn, hasSheetsScope, requestSheetsAccess } = useAuth();
  const { data: rosters } = useMyRosters();
  const bootstrap = useBootstrapMyRosters();
  const createRoster = useCreateRoster();

  const [showNew, setShowNew] = useState(false);
  const [showConsent, setShowConsent] = useState<"create" | "refresh" | null>(
    null,
  );
  // Sent to Google while creating a roster: carry on once it's granted.
  const [createAfterConsent, setCreateAfterConsent] = useState(false);
  // Ref, not state: the run-once flag doesn't drive any render.
  const autoDiscovered = useRef(false);

  useEffect(() => {
    if (
      hasSheetsScope &&
      !autoDiscovered.current &&
      rosters !== undefined &&
      rosters.length === 0 &&
      !bootstrap.isPending
    ) {
      autoDiscovered.current = true;
      bootstrap.mutate();
    }
  }, [hasSheetsScope, rosters, bootstrap]);

  if (!signedIn) return <Navigate to="/" replace />;

  const list = rosters ?? [];

  const beginCreate = () => {
    if (hasSheetsScope) setShowNew(true);
    else setShowConsent("create");
  };

  const beginRefresh = () => {
    if (hasSheetsScope) bootstrap.mutate();
    else setShowConsent("refresh");
  };

  return (
    <>
      <SpecimenHeader
        title="My rosters"
        blurb={
          list.length === 0
            ? "Build your first roster, then attach it to a crusade."
            : "Each roster belongs to one crusade."
        }
        beneath={
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={beginCreate}
              className="btn btn-primary"
            >
              New roster
            </button>
            <button
              type="button"
              onClick={beginRefresh}
              disabled={bootstrap.isPending}
              className="btn"
            >
              {bootstrap.isPending ? "Restoring…" : "Restore from my crusades"}
            </button>
          </div>
        }
      />

      <section className="page pt-4 pb-9">
        {bootstrap.isError && (
          <div className="mb-8 border border-bad text-bad p-4 font-mono text-[13px] leading-[1.5]">
            <strong className="font-semibold">Restore failed:</strong>{" "}
            {bootstrap.error instanceof Error
              ? bootstrap.error.message
              : String(bootstrap.error)}
          </div>
        )}
        {list.length === 0 ? (
          <EmptyState />
        ) : (
          <LibraryLedger
            rosters={list.map((r) => ({
              id: r.id,
              factionName: r.factionName,
              owner: r.player.displayName,
              units: r.units.length,
              supplyUsed: r.supplyUsed,
              characters: r.units.filter((u) => u.isCharacter).length,
            }))}
          />
        )}
      </section>

      {showConsent !== null && (
        <PreConsentExplainer
          explainer={SHEETS_EXPLAINER}
          onContinue={() => {
            setCreateAfterConsent(showConsent === "create");
            setShowConsent(null);
            requestSheetsAccess();
          }}
          onCancel={() => setShowConsent(null)}
        />
      )}

      {(showNew || (createAfterConsent && hasSheetsScope)) && (
        <NewRosterForm
          onClose={() => {
            setShowNew(false);
            setCreateAfterConsent(false);
          }}
          onSubmit={async (values) => {
            const roster = await createRoster.mutateAsync({
              name: values.name ?? "",
              factionName: values.factionName,
              ...values.orderOfBattle,
            });
            if (values.units?.length) await addUnits(roster.id, values.units);
            setShowNew(false);
            setCreateAfterConsent(false);
          }}
        />
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col gap-8">
      <article className="border border-rule p-8 bg-paper-2">
        <p className="font-display text-lg text-ink-2 m-0 max-w-[60ch]">
          No rosters yet. Create one, then attach it from a crusade's page.
        </p>
        <p className="mt-6 text-mute text-sm leading-[1.5]">
          Rosters you made on another device come back when you open the
          crusade they're attached to.
        </p>
      </article>
    </div>
  );
}

interface LibraryRow {
  id: string;
  factionName: string;
  owner: string;
  units: number;
  characters: number;
  supplyUsed: number;
}

function LibraryLedger({ rosters }: { rosters: LibraryRow[] }) {
  return (
    <div className="card px-5 py-3 overflow-x-auto">
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <Th>Faction</Th>
          <Th className="text-right">Units</Th>
          <Th className="text-right">Characters</Th>
          <Th className="text-right">Supply used</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {rosters.map((r) => (
          <tr
            key={r.id}
            className="border-b border-rule hover:bg-paper-2 transition-colors"
          >
            <Td>
              <Link
                to={`/rosters/${r.id}`}
                className="font-display text-lg leading-tight hover:text-accent"
              >
                {r.factionName}
              </Link>
              <div className="font-mono text-[13px] text-mute mt-1">
                {r.owner}
              </div>
            </Td>
            <Td className="text-right tnum font-mono">{r.units}</Td>
            <Td className="text-right tnum font-mono">{r.characters}</Td>
            <Td className="text-right tnum font-mono">{r.supplyUsed}</Td>
            <Td>
              <Link
                to={`/rosters/${r.id}`}
                className="btn-link"
              >
                Open
              </Link>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={[
        "text-left font-mono text-[13px] font-medium text-mute pb-3 pr-4 border-b border-rule-strong",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={["py-4 pr-4 align-baseline text-[15px]", className ?? ""].join(
        " ",
      )}
    >
      {children}
    </td>
  );
}
