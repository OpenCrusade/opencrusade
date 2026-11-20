import { useState } from "react";
import { pickSheet } from "@/lib/google/picker";
import { userMessage } from "@/lib/utils/user-message";

/**
 * "File" access mode only. Google lets the app open a sheet someone
 * else created only after the player has chosen it once in Google's
 * own file chooser. This explains that and opens the chooser.
 */
export function ChooseSheet({
  crusadeId,
  onChosen,
}: {
  crusadeId: string;
  onChosen: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const choose = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (await pickSheet(crusadeId)) onChosen();
      else setProblem("No sheet was selected.");
    } catch (err) {
      setProblem(userMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3" data-testid="choose-sheet">
      <p className="m-0 leading-[1.55]">
        <strong className="font-semibold">Choose this crusade's sheet, once.</strong>{" "}
        This app can only open the files you point it at. Google will show
        you the crusade's sheet: select it, and from then on the app can
        open it directly.
      </p>
      <p className="m-0 text-mute text-sm leading-[1.5]">
        If Google's list is empty, the sheet hasn't been shared with the
        account you're signed in with. Ask your GM to share it with you as an
        editor.
      </p>
      <div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void choose()}>
          {busy ? "Waiting for Google…" : "Choose the sheet"}
        </button>
      </div>
      {problem && (
        <p role="alert" className="m-0 text-bad text-sm">
          {problem}
        </p>
      )}
    </div>
  );
}
