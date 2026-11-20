import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { PageBand } from "@/components/public/NightBand";
import { useAuth } from "@/hooks/useAuth";
import { wipeLocalData } from "@/lib/device";
import { ACCESS_SUMMARY } from "@/lib/google/access-copy";
import { SCOPE_DRIVE_FILE, SCOPE_SPREADSHEETS } from "@/lib/google/scopes";
import { useAppStore } from "@/stores/app-store";

/**
 * Where to report a problem, if whoever hosts this copy has set one:
 * normally the project's issues page. The app itself never sends
 * email or messages anywhere.
 */
const CONTACT_URL = (import.meta.env.VITE_CONTACT_URL as string | undefined)?.trim() || "";

type Section = "about" | "privacy" | "terms";

const TITLES: Record<Section, string> = {
  about: "About OpenCrusade",
  privacy: "Privacy",
  terms: "Terms of use",
};

/** About, privacy and terms. Readable signed in or out. */
export function LegalPage({ section }: { section: Section }) {
  return (
    <div className="min-h-screen grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto]">
      <Header />
      <main>
        <PageBand title={TITLES[section]} />
        <div className="page pt-7 pb-10 grid gap-6 content-start">
        <nav aria-label="About this app" className="flex flex-wrap gap-x-5 gap-y-1 px-1">
          <Link to="/faq">FAQ</Link>
          {(Object.keys(TITLES) as Section[]).map((s) => (
            <Link
              key={s}
              to={`/${s}`}
              aria-current={s === section ? "page" : undefined}
              className={s === section ? "font-semibold text-ink no-underline" : ""}
            >
              {TITLES[s]}
            </Link>
          ))}
        </nav>
        <div className="grid gap-5 max-w-[70ch] px-1 leading-[1.6]">
          {section === "about" && <About />}
          {section === "privacy" && <Privacy />}
          {section === "terms" && <Terms />}
        </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-lg font-bold m-0 mt-2">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="m-0">{children}</p>;
}

function Contact() {
  return CONTACT_URL ? (
    <P>
      Found a problem? <a href={CONTACT_URL} rel="noreferrer">Report it on the project's issues page</a>.
    </P>
  ) : null;
}

function About() {
  return (
    <>
      <P>
        OpenCrusade keeps track of a Warhammer 40,000 Crusade campaign for
        a gaming group: each player's force, the battles played and what each
        unit has earned. Each campaign is stored in one Google Sheet that the
        GM owns.
      </P>
      <H>Unofficial</H>
      <P>
        This is an unofficial tool made by fans. It is not affiliated with,
        endorsed by or sponsored by Games Workshop. Warhammer 40,000 and
        related names are trademarks of Games Workshop Limited, used here only
        to say what the tool is for. The app contains no rules text: you name
        honours, scars, relics and agendas from your own books, and you need
        those books to play.
      </P>
      <H>Your data on this device</H>
      <P>
        The app keeps a working copy of your campaigns and forces in this
        browser so it opens quickly and works offline. You can remove it at
        any time.
      </P>
      <DeviceData />
      <Contact />
    </>
  );
}

/** Remove the device copy, and withdraw the app's Google permission. */
function DeviceData() {
  const { signedIn, signOut, disconnect } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"idle" | "confirm" | "done">("idle");
  const scopes = useAppStore((s) => s.session?.scopes);

  if (step === "done") {
    return (
      <p className="note m-0">
        Done. Nothing from the app is saved on this device now, and its Google
        permission has been withdrawn.
      </p>
    );
  }
  return (
    <div className="card p-5 grid gap-3">
      {step === "confirm" ? (
        <>
          <P>
            This removes the app's copy of your campaigns and forces from this
            device, signs you out and withdraws the permission you gave the
            app in your Google account. Campaign sheets in Google are not
            touched. Changes not yet saved to a sheet, and any force you
            haven't added to a campaign, exist only here and will be lost.
          </P>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                // Withdraw the permission first: it needs the sign-in
                // that the wipe is about to remove.
                void (signedIn ? disconnect() : Promise.resolve())
                  .then(() => wipeLocalData())
                  .then(() => {
                    signOut();
                    setStep("done");
                  })
              }
            >
              Remove my data from this device
            </button>
            <button type="button" className="btn" onClick={() => setStep("idle")}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn" onClick={() => setStep("confirm")}>
            Remove my data from this device…
          </button>
          {signedIn && (
            <button
              type="button"
              className="btn"
              onClick={() => void disconnect().then(() => navigate("/"))}
              title="Signs you out and withdraws the permission you gave this app in your Google account"
            >
              Sign out and disconnect from Google
            </button>
          )}
        </div>
      )}
      {signedIn && scopes && (
        <p className="m-0 text-[13px]" data-testid="current-access">
          <strong className="font-semibold">Connected right now with:</strong>{" "}
          {scopes.includes(SCOPE_SPREADSHEETS)
            ? "access to all your Google Sheets."
            : scopes.includes(SCOPE_DRIVE_FILE)
              ? "access only to the sheets you create or choose in this app."
              : "sign-in only; no access to any sheet yet."}
        </p>
      )}
      <p className="m-0 text-[13px] text-mute">
        Disconnecting withdraws the permission you gave this app. You can also
        do that in your Google account under Security, "Your connections to
        third-party apps and services". Signing in again will ask for
        permission afresh.
      </p>
    </div>
  );
}

function Privacy() {
  return (
    <>
      <P>
        OpenCrusade has no server of its own. The app runs entirely in
        your browser and talks directly to Google. Whoever made or hosts it
        never receives your campaigns, your email address or your Google
        access.
      </P>

      <H>What the app asks Google for</H>
      <P>
        <strong>Your email address and Google account ID</strong>, when you
        sign in. They identify you in a campaign, and your part of the
        campaign's sheet is locked to your email so only you and the GM can
        change it.
      </P>
      <P>
        <strong>Access to Google Sheets</strong>, when you first create or
        open a campaign. {ACCESS_SUMMARY} The app only ever reads and writes
        the campaign sheets you create or open in it.
      </P>

      <H>Where your data is kept</H>
      <P>
        <strong>In the campaign's Google Sheet.</strong> Your display name,
        email address, Google account ID, your force and your battle records
        are written to the sheet. The GM owns that sheet and decides who it
        is shared with; everyone it is shared with can read what is in it,
        including your email address. Google holds it under Google's own
        privacy policy.
      </P>
      <P>
        <strong>In this browser.</strong> A working copy of your campaigns
        and forces, and a temporary Google access token that expires after
        about an hour. If someone else signs in to the app on this device,
        the previous person's copy is removed first.
      </P>
      <P>Nowhere else. There are no analytics, adverts or tracking cookies.</P>

      <H>Other services your browser contacts</H>
      <P>
        <strong>GitHub</strong>, only when someone imports tracker sets from
        a GitHub link. The request goes from your browser to GitHub without
        any information about you, though GitHub, like any website, sees
        your internet address.
      </P>
      <P>
        <strong>The site hosting this app</strong> delivers its files to your
        browser and may keep ordinary access logs.
      </P>

      <H>How Google data is used</H>
      <P>
        The app uses the information it receives from Google only to provide
        the features you see: showing and saving your campaigns. It is not
        transferred to anyone, not used for advertising, and no person reads
        it. Its use of information received from Google APIs adheres to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </P>

      <H>Removing your data</H>
      <P>
        <strong>From this device:</strong> use "Remove my data from this
        device" on the <Link to="/about">About page</Link>.
      </P>
      <P>
        <strong>From a campaign:</strong> ask the GM to remove you. Your rows
        stay in their sheet until the GM deletes your tab or the sheet, since
        the sheet belongs to them.
      </P>
      <P>
        <strong>A whole campaign:</strong> the GM deletes its spreadsheet in
        Google Drive. The app cannot delete files.
      </P>
      <P>
        <strong>The app's access to your Google account:</strong> use "Sign
        out and disconnect from Google" on the About page, or remove the app
        in your Google account's security settings.
      </P>
      <Contact />
    </>
  );
}

function Terms() {
  return (
    <>
      <P>
        OpenCrusade is a free, unofficial hobby tool. By using it you
        agree to the following.
      </P>
      <H>Your data is yours</H>
      <P>
        Campaigns are stored in Google Sheets owned by whoever created them.
        You are responsible for who you share a sheet with and for keeping
        any copies you care about. If you are a GM, the players' email
        addresses in your sheet are in your care.
      </P>
      <H>No warranty</H>
      <P>
        The app is provided as it is, without any warranty. It may have
        faults, may be changed or may stop being available. To the extent
        the law allows, its makers are not liable for loss of data or any
        other loss arising from its use.
      </P>
      <H>Fair use</H>
      <P>
        Use it for running tabletop campaigns. Don't use it to interfere
        with other people's campaigns or to store anything unlawful. You
        also need to follow Google's terms for your Google account.
      </P>
      <H>Not official</H>
      <P>
        This tool is not affiliated with or endorsed by Games Workshop, and
        contains no rules text. Warhammer 40,000 and related names are
        trademarks of Games Workshop Limited.
      </P>
      <Contact />
    </>
  );
}
