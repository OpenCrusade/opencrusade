import { useState } from "react";
import { Link, useRouteError } from "react-router-dom";
import { wipeLocalData } from "@/lib/device";

/** Shown when a page crashes. Says what to do; never shows the error itself. */
export function ErrorPage() {
  const error = useRouteError();
  console.error("[app] page crashed", error);
  const [confirming, setConfirming] = useState(false);

  return (
    <main className="page py-10 grid gap-5 max-w-[46rem]">
      <h1 className="nameplate text-[clamp(1.5rem,4vw,2rem)] m-0">
        This page hit a problem
      </h1>
      <p className="m-0 leading-[1.5]">
        Something went wrong showing this page. Your campaigns are safe in
        their Google Sheets. Reloading usually fixes it.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
        <a className="btn no-underline" href={import.meta.env.BASE_URL}>
          Go to the start page
        </a>
      </div>

      <div className="card p-5 grid gap-3">
        <h2 className="plate-heading m-0">If reloading doesn't help</h2>
        <p className="m-0 leading-[1.5] text-mute">
          The copy of your campaigns saved on this device may be out of step
          with the app. Clearing it makes the app read everything fresh from
          your campaign sheets. Changes that haven't been saved to a sheet
          yet, and forces you haven't added to a campaign, exist only on this
          device and would be lost.
        </p>
        {confirming ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                void wipeLocalData().finally(() => {
                  window.location.href = import.meta.env.BASE_URL;
                })
              }
            >
              Yes, clear this device's copy
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div>
            <button type="button" className="btn" onClick={() => setConfirming(true)}>
              Clear this device's copy
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

/** Any address the app doesn't know. */
export function NotFoundPage() {
  return (
    <main className="page py-10 grid gap-5 max-w-[46rem]">
      <h1 className="nameplate text-[clamp(1.5rem,4vw,2rem)] m-0">
        There's nothing at this address
      </h1>
      <p className="m-0 leading-[1.5]">
        The link may be mistyped or out of date. If someone sent it to you,
        ask them for the campaign's link again.
      </p>
      <div>
        <Link className="btn btn-primary no-underline" to="/crusades">
          Go to your campaigns
        </Link>
      </div>
    </main>
  );
}
