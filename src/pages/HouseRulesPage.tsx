import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { PlainText } from "@/components/common/PlainText";
import { Card } from "@/components/ui/kit";
import { useAuth } from "@/hooks/useAuth";
import { useCrusade, useSetHouseRules } from "@/hooks/useCrusade";

const MAX = 20000;

/** The campaign's house rules. The GM writes them; everyone reads. /crusades/:id/rules */
export function HouseRulesPage() {
  const { crusadeId } = useParams<{ crusadeId: string }>();
  const { user, signedIn } = useAuth();
  const { data: crusade, isLoading } = useCrusade(crusadeId);
  const save = useSetHouseRules(crusadeId ?? "");
  const [draft, setDraft] = useState<string | null>(null);

  if (!signedIn || (!isLoading && !crusade)) {
    return <Navigate to={`/crusades/${crusadeId}`} replace />;
  }
  if (!crusade) return <p className="page py-12 text-mute">Loading…</p>;

  const isGm = crusade.players.find((p) => p.role === "gm")?.user.googleId === user?.googleId;
  const rules = crusade.houseRules;
  const editing = draft !== null;

  const commit = async () => {
    if (draft === null) return;
    await save.mutateAsync(draft);
    setDraft(null);
  };

  return (
    <div className="page max-w-[860px] pt-7 pb-9 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-1 pb-1">
        <div className="flex flex-col gap-1">
          <h1 className="nameplate">House rules</h1>
          {rules && !editing && (
            <div className="text-mute">Last changed {formatDate(rules.updatedAt)}</div>
          )}
        </div>
        {isGm && !editing && (
          <button type="button" className="btn" onClick={() => setDraft(rules?.text ?? "")}>
            {rules ? "Edit house rules" : "Write house rules"}
          </button>
        )}
      </div>

      {editing ? (
        <Card>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void commit();
            }}
          >
            <label className="grid gap-1.5">
              <span className="label-mono">House rules</span>
              <textarea
                autoFocus
                rows={18}
                maxLength={MAX}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={"# Before a battle\n- Agree the mission with your opponent.\n\n# Painting\nFully painted forces gain **1 extra RP** a month."}
                className="field resize-y leading-[1.5] font-[inherit]"
                data-testid="house-rules-text"
              />
            </label>
            <p className="m-0 text-mute text-[13px] leading-[1.5]">
              Start a line with # for a heading or - for a bullet. Put
              **two stars** round words to make them bold. Leave a blank
              line between paragraphs. Every player can read this page.
              {draft.length > MAX * 0.9 && ` ${MAX - draft.length} characters left.`}
            </p>
            {save.error ? (
              <p role="alert" className="m-0 text-bad text-[13px]">
                {save.error instanceof Error ? save.error.message : String(save.error)}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" disabled={save.isPending} onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save house rules"}
              </button>
            </div>
          </form>
        </Card>
      ) : rules ? (
        <Card>
          <div data-testid="house-rules">
            <PlainText text={rules.text} />
          </div>
        </Card>
      ) : (
        <Card>
          <p className="m-0 text-mute">
            {isGm
              ? "No house rules yet. Write down anything your group plays differently, and every player can read it here."
              : "Your GM hasn't written any house rules yet."}
          </p>
        </Card>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
