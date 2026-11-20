import { packLabel } from "@/lib/utils/stats";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { SpecimenHeader } from "@/components/design/SpecimenHeader";
import { MarginNote } from "@/components/design/MarginNote";
import { PreConsentExplainer } from "@/components/consent/PreConsentExplainer";
import { NewCrusadeForm } from "@/components/crusade/NewCrusadeForm";
import { useAuth } from "@/hooks/useAuth";
import { useCrusadeList, useJoinExistingCrusade } from "@/hooks/useCrusade";
import { SHEETS_EXPLAINER } from "@/lib/consent/copy";
import { ACCESS_MODE } from "@/lib/google/scopes";
import { crusadeIdFromLink } from "@/lib/sync/crusade-ops";
import { NoAccessError } from "@/lib/sync/sheet-store";
import { ChooseSheet } from "@/components/crusade/ChooseSheet";
import { pickSheet } from "@/lib/google/picker";
import { userMessage } from "@/lib/utils/user-message";

type ConsentIntent = "create" | "join" | null;

/**
 * Crusade dashboard. Lists the crusades this device knows about. The
 * app can't search Google for crusade sheets (it has no Drive
 * permission), so on a new device a crusade is opened once from its
 * link, "Open a crusade".
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const { user, signedIn, hasSheetsScope, requestSheetsAccess } = useAuth();
  const { data: crusades } = useCrusadeList();
  const join = useJoinExistingCrusade();

  const [consentIntent, setConsentIntent] = useState<ConsentIntent>(null);
  // What the person was doing when they were sent to Google for
  // permission. Once it is granted, they carry straight on.
  const [afterConsent, setAfterConsent] = useState<ConsentIntent>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [lastLinkId, setLastLinkId] = useState<string | null>(null);

  if (!signedIn) return <Navigate to="/" replace />;

  const beginCreateCrusade = () => {
    if (hasSheetsScope) setShowNewForm(true);
    else setConsentIntent("create");
  };

  const beginJoin = () => {
    if (hasSheetsScope) setShowJoin(true);
    else setConsentIntent("join");
  };

  const openFromLink = async (link: string) => {
    setLastLinkId(crusadeIdFromLink(link));
    try {
      const crusade = await join.mutateAsync(link);
      setShowJoin(false);
      setAfterConsent(null);
      navigate(`/crusades/${crusade.id}`);
    } catch (err) {
      // Shown inside the dialog via join.error.
      console.error("[join] failed", err);
    }
  };

  const handleConsentContinue = () => {
    setAfterConsent(consentIntent);
    setConsentIntent(null);
    requestSheetsAccess();
  };
  const joinOpen = showJoin || (afterConsent === "join" && hasSheetsScope);
  const newFormOpen = showNewForm || (afterConsent === "create" && hasSheetsScope);

  const list = crusades ?? [];

  return (
    <>
      <SpecimenHeader
        title="Crusades"
        blurb={
          list.length === 0
            ? "Create a crusade, or open one your GM has shared with you."
            : undefined
        }
        beneath={
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={beginCreateCrusade}
              className="btn btn-primary"
            >
              New crusade
            </button>
            <button
              type="button"
              onClick={beginJoin}
              disabled={join.isPending}
              className="btn"
            >
              Open a crusade
            </button>
          </div>
        }
      />

      <section className="page pt-4 pb-9">
        {list.length === 0 ? (
          <EmptyState hasSheetsScope={hasSheetsScope} />
        ) : (
          <CrusadeLedger crusades={list} />
        )}
      </section>

      {joinOpen && (
        <OpenCrusadeDialog
          email={user?.email ?? ""}
          pending={join.isPending}
          error={
            join.isError
              ? join.error instanceof Error
                ? join.error.message
                : String(join.error)
              : null
          }
          choose={
            ACCESS_MODE === "file" && join.error instanceof NoAccessError && lastLinkId ? (
              <ChooseSheet crusadeId={lastLinkId} onChosen={() => void openFromLink(lastLinkId)} />
            ) : null
          }
          onOpen={(link) => void openFromLink(link)}
          onClose={() => {
            join.reset();
            setShowJoin(false);
            setAfterConsent(null);
          }}
        />
      )}

      {consentIntent && (
        <PreConsentExplainer
          explainer={SHEETS_EXPLAINER}
          onContinue={handleConsentContinue}
          onCancel={() => setConsentIntent(null)}
        />
      )}

      {newFormOpen && (
        <NewCrusadeForm
          onClose={() => {
            setShowNewForm(false);
            setAfterConsent(null);
          }}
        />
      )}
    </>
  );
}

function EmptyState({ hasSheetsScope }: { hasSheetsScope: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <aside>
        <MarginNote label="Signed in on a new device?">
          Your crusades live in Google Sheets. They aren't stored on any
          server. To bring one onto this device, click{" "}
          <em>Open a crusade</em>{ACCESS_MODE === "file" ? " and choose its sheet." : " and paste its link."}
        </MarginNote>
      </aside>
      <article className="border border-rule p-8 bg-paper-2">
        <p className="font-display text-lg text-ink-2 m-0 max-w-[60ch]">
          When you create a crusade, one Google Sheet appears in your Google
          account. You share the sheet with your players in Google Sheets and
          send them the crusade's link; each player joins from it and gets a
          tab only they and you can edit.
        </p>
        {!hasSheetsScope && (
          <p className="mt-6 text-mute text-sm leading-[1.5]">
            <strong className="font-semibold text-ink">Google Sheets access</strong> is
            only requested at the point you create or open a crusade, not
            during sign-in.
          </p>
        )}
      </article>
    </div>
  );
}

interface CrusadeRow {
  id: string;
  name: string;
  packId: string;
  createdAt: string;
  supplyLimit: number;
  players: { user: { displayName: string } }[];
}

function CrusadeLedger({ crusades }: { crusades: CrusadeRow[] }) {
  return (
    <div className="card px-5 py-3 overflow-x-auto">
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <Th>Crusade</Th>
          <Th>Pack</Th>
          <Th className="text-right">Players</Th>
          <Th className="text-right">Supply</Th>
          <Th>Created</Th>
        </tr>
      </thead>
      <tbody>
        {crusades.map((c) => (
          <tr
            key={c.id}
            className="border-b border-rule hover:bg-paper-2 transition-colors"
          >
            <Td>
              <Link
                to={`/crusades/${c.id}`}
                className="font-display text-lg leading-tight hover:text-accent"
              >
                {c.name}
              </Link>
            </Td>
            <Td>
              <span className="font-mono text-[13px] text-ink-2">
                {packLabel(c.packId) || "–"}
              </span>
            </Td>
            <Td className="text-right tnum font-mono">{c.players.length}</Td>
            <Td className="text-right tnum font-mono">{c.supplyLimit}</Td>
            <Td>
              <span className="font-mono text-[13px] text-mute">
                {new Date(c.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
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
  children: React.ReactNode;
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


/**
 * Open a crusade from its link. Used by invited players (first time)
 * and by anyone on a new device. No file picker: any sheet shared with
 * the signed-in Google account opens directly.
 */
function OpenCrusadeDialog({
  email,
  pending,
  error,
  choose,
  onOpen,
  onClose,
}: {
  email: string;
  pending: boolean;
  error: string | null;
  /** Shown in place of the error when the sheet has to be chosen first. */
  choose?: React.ReactNode;
  onOpen: (link: string) => void;
  onClose: () => void;
}) {
  const [link, setLink] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [browseProblem, setBrowseProblem] = useState<string | null>(null);
  const browse = async () => {
    setBrowsing(true);
    setBrowseProblem(null);
    try {
      const id = await pickSheet();
      if (id) onOpen(id);
    } catch (err) {
      setBrowseProblem(userMessage(err));
    } finally {
      setBrowsing(false);
    }
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto dialog-scrim p-3"
    >
      <form
        className="w-full max-w-xl dialog-panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim()) onOpen(link);
        }}
      >
        <div className="flex items-start justify-between gap-8">
          <span />
          <button
            type="button"
            onClick={onClose}
            className="btn-link"
          >
            Cancel
          </button>
        </div>

        <h2 className="specimen-title text-[clamp(1.75rem,4vw,2.5rem)] mt-6 [&_em]:specimen-title-em">
          {ACCESS_MODE === "file" ? (
            <>Choose the <em>crusade's sheet</em></>
          ) : (
            <>Paste the <em>crusade link</em></>
          )}
        </h2>

        <p className="text-mute text-sm leading-[1.55] mt-4">
          The GM must have shared the crusade's sheet, as an editor, with{" "}
          <strong className="font-semibold text-ink">
            {email || "the account you're signed in with here"}
          </strong>
          .
        </p>

        {ACCESS_MODE === "file" && (
          <div className="mt-6 grid gap-2" data-testid="browse-sheets">
            <div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || browsing}
                onClick={() => void browse()}
              >
                {browsing ? "Waiting for Google…" : pending ? "Opening…" : "Choose from Google Drive"}
              </button>
            </div>
            <p className="m-0 text-mute text-sm leading-[1.5]">
              Google shows your spreadsheets, including ones shared with you.
              Pick the crusade's sheet (its name starts with "OpenCrusade"). This
              app can only open the sheets you choose.
            </p>
            {browseProblem && (
              <p role="alert" className="m-0 text-bad text-sm">{browseProblem}</p>
            )}
          </div>
        )}

        {ACCESS_MODE !== "file" && (
          <label className="block mt-6">
            <span className="label-mono">Crusade link</span>
            <input
              type="text"
              autoFocus
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className="field mt-2"
            />
          </label>
        )}

        {choose ? (
          <div className="mt-4">{choose}</div>
        ) : error && (
          <div
            role="alert"
            className="mt-4 border border-bad text-bad p-3 leading-[1.5]"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-rule-strong">
          <button
            type="button"
            onClick={onClose}
            className="btn"
          >
            Cancel
          </button>
          {ACCESS_MODE !== "file" && (
            <button
              type="submit"
              disabled={pending || !link.trim()}
              className="btn btn-primary"
            >
              {pending ? "Opening…" : "Open crusade"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
