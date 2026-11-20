import { Link, Navigate } from "react-router-dom";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { NightBand } from "@/components/public/NightBand";
import { useAuth } from "@/hooks/useAuth";
import { getGoogleClientId } from "@/lib/google/auth";
import { ACCESS_MODE } from "@/lib/google/scopes";
import { takeReturnTo } from "@/lib/utils/return-to";

/**
 * Public start page: what the app is, how a campaign runs, what Google
 * is asked for, and the sign-in button. Google's brand review reads
 * this page signed out, so it has to explain the app by itself.
 *
 * Sign-in requests identity only (`openid email`). Access to a
 * campaign's sheet is requested later. See lib/google/scopes.ts.
 */
export function HomePage() {
  const { signedIn, signIn, signInError } = useAuth();
  if (signedIn) return <Navigate to={takeReturnTo() ?? "/crusades"} replace />;

  const clientIdConfigured = getGoogleClientId() !== "";
  const file = ACCESS_MODE === "file";

  return (
    <div className="min-h-screen grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto]">
      <Header />

      <main>
        <NightBand>
          <section className="page pt-10 sm:pt-16 pb-14 sm:pb-20 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,29rem)] lg:items-center">
            <div className="grid gap-7">
              <h1 className="m-0 font-display font-bold leading-[1.02] tracking-[-0.02em] text-[clamp(2.3rem,5.6vw,4rem)] text-balance">
                Your crusade, in a Google Sheet you own.
              </h1>
              <p className="m-0 text-[17px] leading-[1.55] text-night-mute max-w-[54ch]">
                OpenCrusade is a campaign tracker for sci-fi wargaming. It
                keeps every player's force, every battle, and what each unit
                has earned. It is free, has no server, and keeps nothing of
                yours.
              </p>

              <div className="grid gap-3 justify-items-start">
                <button
                  type="button"
                  onClick={() => signIn()}
                  disabled={!clientIdConfigured}
                  className="inline-flex items-center min-h-[52px] px-7 rounded-xl border-0 bg-[#2b5fd9] text-white font-display font-bold text-base cursor-pointer transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  Continue with Google
                </button>
                {signInError && (
                  <p role="alert" className="text-[#ffb4ab] m-0 leading-[1.5] max-w-[54ch]">
                    {signInError}
                  </p>
                )}
                {!clientIdConfigured && (
                  <p role="alert" className="text-[#ffb4ab] m-0 leading-[1.5] max-w-[54ch]">
                    <strong className="font-semibold">
                      Sign-in isn't set up on this copy of the app.
                    </strong>{" "}
                    Whoever runs it needs to add its Google client ID (see the
                    README).
                  </p>
                )}
                <p className="m-0 text-night-mute max-w-[54ch]">
                  Signing in asks Google for your email address only. Sent a
                  campaign link by your GM? Open it and sign in there.
                </p>
              </div>
            </div>

            <SampleForce />
          </section>
        </NightBand>

        <section className="bg-surface">
          <div className="page py-12 grid gap-8">
            <h2 className="m-0 font-display font-bold text-[clamp(1.5rem,3vw,2rem)] leading-tight">
              How a campaign runs
            </h2>
            <ol className="relative m-0 p-0 list-none grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4 lg:before:absolute lg:before:left-5 lg:before:right-[12%] lg:before:top-5 lg:before:border-t-2 lg:before:border-dashed lg:before:border-rule-strong">
              <Step n={1} title="The GM creates it">
                One spreadsheet appears in the GM's Google account. That
                sheet is the campaign.
              </Step>
              <Step n={2} title="The GM shares the sheet">
                With each player, in Google Sheets, as an editor. Then sends
                everyone the campaign link.
              </Step>
              <Step n={3} title="Players join">
                {file
                  ? "Each player opens the link, chooses the sheet once, and gets a tab only they and the GM can edit."
                  : "Each player opens the link and gets a tab only they and the GM can edit."}
              </Step>
              <Step n={4} title="You play">
                One player records a battle and the others confirm it. Each
                player then updates their own units.
              </Step>
            </ol>
          </div>
        </section>

        <section className="page py-12 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
          <div className="grid gap-6 content-start">
            <h2 className="m-0 font-display font-bold text-[clamp(1.5rem,3vw,2rem)] leading-tight">
              What it keeps track of
            </h2>
            <dl className="m-0 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              <Fact term="Forces">
                Named units with points, experience, honours and scars.
                Supply and requisition points are totalled for you.
              </Fact>
              <Fact term="Battles">
                Who played, the result, and what each unit did. Experience is
                applied when the players agree.
              </Fact>
              <Fact term="The campaign">
                Standings, a battle log and any trackers your GM adds, such
                as campaign points or territories.
              </Fact>
              <Fact term="Your own rules">
                The app contains no rules text. You name honours, scars,
                relics and agendas from your own books, so it fits any
                campaign pack or house rules.
              </Fact>
            </dl>
          </div>

          <div className="grid gap-4 content-start">
            <div className="rounded-2xl bg-surface overflow-hidden shadow-[0_1px_2px_rgb(17_22_29/0.08)]">
              <h2 className="m-0 px-5 py-4 bg-night text-night-ink font-display font-bold text-lg">
                What Google is asked for
              </h2>
              <ul className="m-0 p-0 list-none">
                <Ask mark="yes" when="When you sign in" what="Your email address">
                  Your tab in the campaign's sheet is locked to it.
                </Ask>
                <Ask
                  mark="yes"
                  when="When you create or open a campaign"
                  what={file ? "Only the campaign sheets you create or choose" : "Your Google Sheets"}
                >
                  {file
                    ? "The app cannot see any other file in your Google account."
                    : "Google words this as all your spreadsheets. The app only opens campaign sheets you create or join here."}
                </Ask>
                <Ask
                  mark="no"
                  when="Never"
                  what={file ? "Your Drive, Docs, Gmail, contacts or profile" : "Your Drive, Gmail, contacts or profile"}
                >
                  Nothing else is requested, now or later.
                </Ask>
              </ul>
            </div>
            <p className="m-0 text-mute max-w-[60ch]">
              The people who run this site cannot see your campaigns. The{" "}
              <Link className="underline" to="/faq">
                FAQ
              </Link>{" "}
              and the{" "}
              <Link className="underline" to="/privacy">
                privacy page
              </Link>{" "}
              have the details.
            </p>
          </div>
        </section>

        <NightBand route={false}>
          <div className="page py-11 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
            <Pledge title="Free">No charge, no adverts, no paid tier.</Pledge>
            <Pledge title="Open source">
              MIT licence. Run your own copy if you prefer.
            </Pledge>
            <Pledge title="Unofficial">
              Fan-made. Not affiliated with Games Workshop.
            </Pledge>
            <Pledge title="Created with Claude">
              This app was built with AI tools. That is why it is completely
              free to use.
            </Pledge>
          </div>
        </NightBand>
      </main>

      <Footer />
    </div>
  );
}

/**
 * A made-up force, drawn with the same pieces the app uses, so the
 * first thing a visitor sees is what they will be working with.
 * Every name here is invented.
 */
function SampleForce() {
  const units = [
    { name: "The Commander", role: "Character", xp: 31, marks: ["Steady Aim", "Old Wound"] },
    { name: "First Squad", role: "Infantry", xp: 17, marks: ["Veteran Sergeant"] },
    { name: "Heavy Team", role: "Support", xp: 9, marks: [] },
    { name: "Outriders", role: "Fast attack", xp: 4, marks: [] },
  ];
  return (
    <figure className="m-0 grid gap-3">
      <div className="rounded-2xl overflow-hidden bg-surface text-ink ring-1 ring-white/10 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.7)] lg:rotate-[1.2deg]">
        <div className="bg-team text-white px-5 py-4 flex items-center gap-3">
          <span className="crest w-10 h-10 bg-white/15 text-white" aria-hidden>
            AC
          </span>
          <div className="min-w-0">
            <p className="m-0 font-display font-bold text-lg leading-tight">Ashen Company</p>
            <p className="m-0 text-[13px] text-white/75">Played by Robin</p>
          </div>
          <span className="ml-auto flex gap-1" role="img" aria-label="Last three battles: win, win, loss">
            <span className="form-chip bg-white text-team" aria-hidden>W</span>
            <span className="form-chip bg-white text-team" aria-hidden>W</span>
            <span className="form-chip border border-white/60 text-white" aria-hidden>L</span>
          </span>
        </div>

        <div className="px-5 py-4 flex flex-wrap gap-x-6 gap-y-3 border-b border-rule">
          <Stat label="Supply used" value="940 / 1000" />
          <Stat label="Requisition" value="3" />
          <Stat label="Battles" value="6" />
        </div>

        <ul className="m-0 p-0 list-none">
          {units.map((u) => (
            <li
              key={u.name}
              className="px-5 py-3 flex items-center gap-3 border-b border-rule last:border-b-0"
            >
              <span className="xp-badge" role="img" aria-label={`${u.xp} experience`}>
                {u.xp}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 font-semibold">{u.name}</p>
                <p className="m-0 text-[13px] text-mute">{u.role}</p>
              </div>
              <span className="hidden sm:flex flex-wrap justify-end gap-1.5">
                {u.marks.map((m) => (
                  <span key={m} className="chip">
                    {m}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="text-[13px] text-night-mute px-1">
        An example force. The names are made up; yours come from your own
        army.
      </figcaption>
    </figure>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-cell">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="relative grid gap-2.5 content-start">
      <span
        aria-hidden
        className="inline-flex w-10 h-10 items-center justify-center rounded-full bg-night text-night-ink font-display font-bold ring-[6px] ring-surface"
      >
        {n}
      </span>
      <h3 className="m-0 font-display text-[17px] font-bold">
        <span className="sr-only">Step {n}: </span>
        {title}
      </h3>
      <p className="m-0 text-mute leading-[1.5]">{children}</p>
    </li>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 content-start border-t-2 border-ink pt-3">
      <dt className="font-display font-bold text-[17px]">{term}</dt>
      <dd className="m-0 text-mute leading-[1.5]">{children}</dd>
    </div>
  );
}

function Ask({
  mark,
  when,
  what,
  children,
}: {
  mark: "yes" | "no";
  when: string;
  what: string;
  children: React.ReactNode;
}) {
  return (
    <li className="px-5 py-4 flex gap-3.5 border-b border-rule last:border-b-0">
      <span
        aria-hidden
        className={`mt-0.5 flex-none inline-flex w-6 h-6 items-center justify-center rounded-full text-[13px] font-bold ${
          mark === "yes" ? "bg-good-soft text-good" : "bg-fill text-mute"
        }`}
      >
        {mark === "yes" ? "✓" : "✕"}
      </span>
      <div className="grid gap-0.5">
        <p className="m-0 label-mono">{when}</p>
        <p className={`m-0 font-display font-bold text-base ${mark === "no" ? "text-mute" : ""}`}>{what}</p>
        <p className="m-0 text-mute leading-[1.5]">{children}</p>
      </div>
    </li>
  );
}

function Pledge({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <p className="m-0 leading-[1.5] border-l-2 border-beacon pl-4">
      <strong className="font-display font-bold text-[17px] block text-night-ink">{title}</strong>
      <span className="text-night-mute">{children}</span>
    </p>
  );
}
