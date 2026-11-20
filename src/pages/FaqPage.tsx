import { Link } from "react-router-dom";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { PageBand } from "@/components/public/NightBand";
import { GOOGLE_BOX_LABEL } from "@/lib/google/access-copy";
import { ACCESS_MODE } from "@/lib/google/scopes";

/**
 * Where the source and the written guides live. Whoever hosts a copy
 * can point this at their own fork; otherwise it is the project's home.
 */
const REPO_URL = (
  (import.meta.env.VITE_REPO_URL as string | undefined)?.trim() ||
  "https://github.com/OpenCrusade/opencrusade"
).replace(/\/$/, "");
/** Set by whoever hosts this copy. Optional. */
const CONTACT_URL = (import.meta.env.VITE_CONTACT_URL as string | undefined)?.trim() || "";

const file = ACCESS_MODE === "file";

/** A link to one of the written guides in the repository. */
function Guide({ file, children }: { file: string; children: React.ReactNode }) {
  return (
    <a className="underline" href={`${REPO_URL}/blob/main/docs/${file}`} rel="noreferrer">
      {children}
    </a>
  );
}

interface Question {
  q: string;
  a: React.ReactNode;
}

const GROUPS: { id: string; title: string; questions: Question[] }[] = [
  {
    id: "basics",
    title: "The basics",
    questions: [
      {
        q: "What is OpenCrusade?",
        a: (
          <>
            A campaign tracker for sci-fi wargaming crusades. It keeps each
            player's force, the battles your group plays, and what each unit
            has earned. One person, the GM, creates the campaign and the
            others join it.
          </>
        ),
      },
      {
        q: "What does it cost?",
        a: (
          <>
            Nothing. There is no charge, no paid tier and no adverts, and
            that will not change. The site has no server to pay for, and the
            code is open source, so anyone can run a copy.
          </>
        ),
      },
      {
        q: "Is it official?",
        a: (
          <>
            No. It is a fan-made tool. It is not affiliated with, endorsed by
            or sponsored by Games Workshop.
          </>
        ),
      },
      {
        q: "Does it include the rules?",
        a: (
          <>
            No. It contains no rules text, points values or datasheets. You
            type in your own unit names, honours, scars and agendas from the
            books you own, so you still need those books to play. That also
            means it works with any campaign pack or house rules.
          </>
        ),
      },
      {
        q: "What do I need to use it?",
        a: (
          <>
            A Google account and a web browser. Every player needs their own
            Google account, because each player's part of the campaign is
            locked to their account.
          </>
        ),
      },
    ],
  },
  {
    id: "permissions",
    title: "Google permissions",
    questions: [
      {
        q: "What does Google ask me to allow?",
        a: (
          <>
            Two things, at two moments. When you sign in: your email address.
            When you first create or open a campaign: "{GOOGLE_BOX_LABEL}".
            Nothing else is ever requested.
          </>
        ),
      },
      {
        q: "Can the app see my other files?",
        a: file ? (
          <>
            No. Google only lets the app open campaign sheets it created for
            you, and sheets you have chosen yourself. It cannot list, open or
            change anything else in your Google Drive, and it has no access
            to Gmail, Docs, Calendar or your contacts.
          </>
        ) : (
          <>
            Google words the permission as all your spreadsheets. The app
            only opens campaign sheets you create or join here. It has no
            access to Drive, Gmail, Docs, Calendar or your contacts.
          </>
        ),
      },
      ...(file
        ? [
            {
              q: "Why do I have to choose the campaign's sheet?",
              a: (
                <>
                  Because a link alone gives the app nothing. Choosing the
                  sheet in Google's window is how you tell Google that this
                  app may open that one file. You do it once for each
                  campaign; Google remembers it, on your other devices too.
                </>
              ),
            },
          ]
        : []),
      {
        q: "Why is the box on Google's screen unticked?",
        a: (
          <>
            Google leaves it for you to decide. Tick it and continue. If you
            leave it unticked the app cannot save anything, and it will ask
            again.
          </>
        ),
      },
      {
        q: "How do I take the permission back?",
        a: (
          <>
            On the <Link className="underline" to="/about">About page</Link>, press "Sign out and
            disconnect from Google". You can also remove the app in your
            Google account, under Security, "Your connections to third-party
            apps and services". The same page shows which permission the app
            currently has.
          </>
        ),
      },
    ],
  },
  {
    id: "data",
    title: "Your data and who can see it",
    questions: [
      {
        q: "Where is my campaign stored?",
        a: (
          <>
            In one Google Sheet in the GM's Google account, and in a working
            copy in each player's browser. Nowhere else.
          </>
        ),
      },
      {
        q: "What can the people who run this site see?",
        a: (
          <>
            None of your campaigns, forces or battles. The site is a set of
            pages with no server behind it, no database, no analytics and no
            tracking. Your browser talks to Google directly. Like any
            website, the company hosting the pages may keep ordinary access
            logs. The <Link className="underline" to="/privacy">privacy page</Link> has the full
            account.
          </>
        ),
      },
      {
        q: "What can my GM and the other players see?",
        a: (
          <>
            Everything in the campaign: all forces and battles, and each
            player's name. Your email address and Google account ID are
            written into the sheet when you join, so anyone who can open the
            sheet in Google Sheets can read them. The app does not show other
            players' email addresses.
          </>
        ),
      },
      {
        q: "Can another player change my force?",
        a: (
          <>
            No. Your part of the sheet is protected so that only you and the
            GM can edit it. Google enforces that, not the app.
          </>
        ),
      },
      {
        q: "What is kept on my device?",
        a: (
          <>
            A copy of your campaigns and forces, so pages open quickly and
            you can work offline, and a Google sign-in that lasts about an
            hour. "Remove my data from this device" on the{" "}
            <Link className="underline" to="/about">About page</Link> clears it and
            withdraws the app's Google permission.
          </>
        ),
      },
      {
        q: "How do I delete a campaign?",
        a: (
          <>
            The GM deletes the campaign's spreadsheet in Google Drive. The
            app cannot delete files. Each player can then remove the copy on
            their own device.
          </>
        ),
      },
      {
        q: "What happens to my campaign if this site closes?",
        a: (
          <>
            You keep it. The spreadsheet is yours and has pages made for
            reading: standings, the battle log and every force. Because the
            code is open source, anyone can also host the app again and open
            the same sheet with it.
          </>
        ),
      },
    ],
  },
  {
    id: "using",
    title: "Using it",
    questions: [
      {
        q: "Does it work on a phone?",
        a: (
          <>
            Yes, in the phone's browser. You can also add it to your home
            screen from the browser's menu and it opens like an app.
          </>
        ),
      },
      {
        q: "Does it work without a connection?",
        a: (
          <>
            Partly. You can read your campaigns and change your own force
            offline; the changes are saved to the sheet when you are back
            online. Recording battles and changing campaign settings need a
            connection.
          </>
        ),
      },
      {
        q: "How quickly do other people's changes appear?",
        a: (
          <>
            Within about a minute while the page is open, or straight away
            when you press Refresh at the bottom of the page.
          </>
        ),
      },
      {
        q: "Can I be in more than one campaign?",
        a: <>Yes. Each campaign is its own sheet, and you can run some and play in others.</>,
      },
      {
        q: "Can I edit the spreadsheet by hand?",
        a: (
          <>
            Read it as much as you like. Avoid editing it by hand: the
            readable pages are rebuilt by the app, and the data pages are
            easy to break. Make changes in the app.
          </>
        ),
      },
    ],
  },
  {
    id: "guides",
    title: "Guides",
    questions: [
      {
        q: "Is there a guide for players?",
        a: (
          <>
            Yes. The <Guide file="player-guide.md">player guide</Guide> covers
            signing in, joining a campaign, keeping your force and recording
            battles.
          </>
        ),
      },
      {
        q: "Is there a guide for running a campaign?",
        a: (
          <>
            Yes. The <Guide file="gm-guide.md">GM guide</Guide> covers creating
            a campaign, sharing it, managing players and correcting mistakes.{" "}
            <Guide file="tracker-sets.md">Tracker sets</Guide> explains
            ready-made campaign trackers.
          </>
        ),
      },
      {
        q: "Something isn't working. Where do I look?",
        a: (
          <>
            The <Guide file="troubleshooting.md">troubleshooting guide</Guide>{" "}
            lists each message the app can show, what causes it and how to
            fix it.
          </>
        ),
      },
    ],
  },
  {
    id: "open-source",
    title: "Open source and running your own copy",
    questions: [
      {
        q: "What licence is it under?",
        a: (
          <>
            The MIT licence. You may use, copy, change and share the code,
            for any purpose, as long as you keep the copyright and licence
            notice. It comes with no warranty.
          </>
        ),
      },
      {
        q: "How do I host it myself?",
        a: (
          <>
            The app is a folder of static files, so any web host will do,
            and you set up a Google Cloud project of your own for the
            sign-in. Both are free at this scale. Follow the{" "}
            <Guide file="self-hosting.md">self-hosting guide</Guide> and the{" "}
            <Guide file="google-cloud-setup.md">Google Cloud set-up guide</Guide>.
            The code is in the{" "}
            <a className="underline" href={REPO_URL} rel="noreferrer">
              project's repository
            </a>
            .
          </>
        ),
      },
      {
        q: "I found a problem. Where do I report it?",
        a: CONTACT_URL ? (
          <>
            On the project's{" "}
            <a className="underline" href={CONTACT_URL} rel="noreferrer">
              issues page
            </a>
            . The app has no contact form and never sends email.
          </>
        ) : (
          <>
            Raise an issue in the project's repository. The app has no
            contact form and never sends email.
          </>
        ),
      },
    ],
  },
];

/** FAQ. Readable signed in or out. */
export function FaqPage() {
  return (
    <div className="min-h-screen grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto]">
      <Header />
      <main>
        <PageBand title="Frequently asked questions">
          <p className="m-0 text-night-mute text-[16px] max-w-[60ch]">
            What it costs, what Google is asked for, and who can see your
            campaign.
          </p>
        </PageBand>
        <div className="page pt-8 pb-10 grid gap-8 content-start lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-12">
        <nav aria-label="Sections" className="px-1 lg:sticky lg:top-6 lg:self-start">
          <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-2 lg:grid">
            {GROUPS.map((g) => (
              <li key={g.id}>
                <a className="underline" href={`#${g.id}`}>{g.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid gap-10 px-1 max-w-[70ch]">
          {GROUPS.map((g) => (
            <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="grid gap-5 scroll-mt-6">
              <h2 id={`${g.id}-title`} className="m-0 font-display font-bold text-xl border-t-2 border-ink pt-3">
                {g.title}
              </h2>
              {g.questions.map((item) => (
                <div key={item.q} className="grid gap-1.5">
                  <h3 className="m-0 font-display text-base font-bold">{item.q}</h3>
                  <p className="m-0 leading-[1.6] text-ink-2">{item.a}</p>
                </div>
              ))}
            </section>
          ))}
          <p className="m-0 text-mute">
            More detail: <Link className="underline" to="/privacy">Privacy</Link>, <Link className="underline" to="/terms">Terms</Link>,{" "}
            <Link className="underline" to="/about">About</Link>.
          </p>
        </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
