import { NavLink, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOnline } from "@/hooks/useOnline";
import { useSyncStatus } from "@/stores/sync-status";
import { useCrusade } from "@/hooks/useCrusade";
import { useCrusadeMirrors, useRoster } from "@/hooks/useRoster";
import { battleTodo } from "@/lib/utils/stats";

export function Header() {
  const { user, signedIn, signIn, signOut, needsReconnect, sheetsDeclined, wrongAccount, requestSheetsAccess } =
    useAuth();
  const online = useOnline();
  const readProblems = useSyncStatus((s) => s.readProblems);
  const { crusadeId: paramCrusadeId, rosterId, battleId } = useParams<{
    crusadeId?: string;
    rosterId?: string;
    battleId?: string;
  }>();
  // On a roster page, the crusade is the one the roster is attached to.
  const { data: roster } = useRoster(rosterId);
  const crusadeId = paramCrusadeId ?? roster?.attachedTo?.[0]?.crusadeId;
  const { data: crusade } = useCrusade(crusadeId);
  const readProblem = crusadeId ? readProblems[crusadeId] : undefined;
  const { data: mirrors } = useCrusadeMirrors(crusadeId);
  const mine = (mirrors ?? []).find((m) => m.player.googleId === user?.googleId);
  const isGm =
    crusade?.players.find((p) => p.role === "gm")?.user.googleId === user?.googleId;
  const canLog =
    !!crusade &&
    !!mine &&
    (mirrors ?? []).length >= 2 &&
    (isGm || crusade.settings.allowPlayerBattleCreation !== false);

  // Battles waiting on this player, shown on every page of the crusade
  // except the battle's own page.
  const todos = (crusade?.battles ?? [])
    .map((b) => ({ id: b.id, name: b.missionName, todo: battleTodo(b, user?.googleId) }))
    .filter((t) => t.todo !== null && t.id !== battleId);

  return (
    <>
      <header className="bg-surface border-b border-rule-strong">
        <div className="page flex flex-wrap items-center justify-between gap-x-7 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-7 gap-y-1 min-w-0">
            <NavLink
              to={crusade ? `/crusades/${crusade.id}` : "/crusades"}
              className="flex items-center gap-2.5 font-display font-bold text-[17px] no-underline text-ink min-w-0 max-w-[60vw]"
            >
              <img
                src={`${import.meta.env.BASE_URL}favicon.svg`}
                alt=""
                width={26}
                height={26}
                className="flex-none rounded-md"
              />
              <span className="truncate">{crusade ? crusade.name : "OpenCrusade"}</span>
            </NavLink>
            <nav aria-label="Sections" className="flex flex-wrap gap-1">
              {crusade ? (
                <>
                  <Tab to={`/crusades/${crusade.id}`} end>
                    Campaign
                  </Tab>
                  {mine && <Tab to={`/rosters/${mine.id}`}>My force</Tab>}
                  <Tab to={`/crusades/${crusade.id}/table`}>Table</Tab>
                  <Tab to={`/crusades/${crusade.id}/battles`}>Battles</Tab>
                  {(isGm || crusade.houseRules) && (
                    <Tab to={`/crusades/${crusade.id}/rules`}>House rules</Tab>
                  )}
                </>
              ) : (
                <>
                  {signedIn ? (
                    <>
                      <Tab to="/crusades">Crusades</Tab>
                      <Tab to="/rosters">My rosters</Tab>
                    </>
                  ) : (
                    <>
                      <Tab to="/" end>Home</Tab>
                      <Tab to="/faq">FAQ</Tab>
                    </>
                  )}
                </>
              )}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
            {crusade && (
              <NavLink to="/crusades" className="btn-link no-underline">
                All crusades
              </NavLink>
            )}
            {signedIn && user ? (
              <button type="button" onClick={signOut} className="btn-link no-underline" title={user.email}>
                Sign out
              </button>
            ) : (
              <button type="button" onClick={() => signIn()} className="btn-link">
                Sign in
              </button>
            )}
            {canLog && crusade && (
              <NavLink to={`/crusades/${crusade.id}/battles?new=1`} className="btn btn-primary">
                Log battle
              </NavLink>
            )}
          </div>
        </div>
      </header>

      {todos.length > 0 && crusade && (
        <div role="status" data-testid="battle-todos" className="bg-plate text-plate-ink">
          <div className="page py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="m-0 font-semibold">{todoText(todos)}</p>
            <NavLink
              to={
                todos.length === 1
                  ? `/crusades/${crusade.id}/battles/${todos[0].id}`
                  : `/crusades/${crusade.id}/battles`
              }
              className="btn btn-sm no-underline"
            >
              {todos.length === 1 ? `Open ${todos[0].name}` : "Show battles"}
            </NavLink>
          </div>
        </div>
      )}

      {!online && (
        <Banner>
          <strong className="font-semibold">Offline.</strong> Changes to your
          own force are saved when you're back online.
        </Banner>
      )}
      {online && readProblem && (
        <Banner alert>
          <strong className="font-semibold">This page may be out of date.</strong>{" "}
          {readProblem}
        </Banner>
      )}
      {online && wrongAccount && (
        <Banner
          alert
          action={
            <button type="button" onClick={() => requestSheetsAccess()} className="btn btn-primary btn-sm">
              Choose account
            </button>
          }
        >
          <strong className="font-semibold">That was a different Google account.</strong>{" "}
          Reconnect with the one you signed in with.
        </Banner>
      )}
      {online && sheetsDeclined && !wrongAccount && (
        <Banner
          alert
          action={
            <button type="button" onClick={() => requestSheetsAccess()} className="btn btn-primary btn-sm">
              Try again
            </button>
          }
        >
          <strong className="font-semibold">
            Google Sheets access wasn't granted.
          </strong>{" "}
          Tick the box on Google's screen, then Continue.
        </Banner>
      )}
      {online && needsReconnect && !sheetsDeclined && !wrongAccount && (
        <Banner
          action={
            <button type="button" onClick={() => requestSheetsAccess()} className="btn btn-primary btn-sm">
              Reconnect
            </button>
          }
        >
          <strong className="font-semibold">Google session expired.</strong>{" "}
          Reconnect to keep saving.
        </Banner>
      )}
    </>
  );
}

function Banner({
  children,
  action,
  alert,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      role={alert ? "alert" : undefined}
      className="bg-surface border-b border-rule-strong"
    >
      <div className="page py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-ink leading-[1.4] max-w-[80ch]">
          {children}
        </p>
        {action}
      </div>
    </div>
  );
}

function Tab({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "min-h-14 flex items-center px-3 no-underline",
          isActive
            ? "text-ink font-semibold shadow-[inset_0_-3px_0_var(--color-ink)]"
            : "text-mute font-medium hover:text-ink",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}

/** "You have 1 result to confirm and 2 battles to apply." */
function todoText(todos: { todo: string | null }[]): string {
  const count = (t: string) => todos.filter((x) => x.todo === t).length;
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(count("Confirm result"), "result to confirm", "results to confirm");
  add(count("Enter result"), "result to enter", "results to enter");
  add(count("Apply results"), "battle with XP to apply", "battles with XP to apply");
  return `You have ${parts.join(parts.length > 2 ? ", " : " and ")}.`;
}
