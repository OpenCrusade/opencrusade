import { useEffect, useState } from "react";
import type { Crusade, PlayerGroup } from "@/types";
import type { CrusadeConfigPatch } from "@/lib/sync/crusade-ops";

/**
 * GM-only crusade settings. Everything saves in one Drive write via
 * updateCrusadeConfig:
 *   - battle-creation permission toggle
 *   - pack content lists (agendas / missions / relics), one name per
 *     line, offered as suggestions in battle forms
 *   - team definitions (assignment happens in the players table)
 */
export function CrusadeSettingsDialog({
  crusade,
  onSave,
  onClose,
}: {
  crusade: Crusade;
  onSave: (patch: CrusadeConfigPatch) => Promise<void>;
  onClose: () => void;
}) {
  const [allowPlayerBattles, setAllowPlayerBattles] = useState(
    crusade.settings.allowPlayerBattleCreation,
  );
  const [agendas, setAgendas] = useState(
    (crusade.packContent?.agendas ?? []).join("\n"),
  );
  const [missions, setMissions] = useState(
    (crusade.packContent?.missions ?? []).join("\n"),
  );
  const [relics, setRelics] = useState(
    (crusade.packContent?.relics ?? []).join("\n"),
  );
  const [groups, setGroups] = useState<PlayerGroup[]>(crusade.groups ?? []);
  const [newTeam, setNewTeam] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = o;
    };
  }, []);

  const addTeam = () => {
    const name = newTeam.trim();
    if (!name) return;
    setGroups((g) => [
      ...g,
      { id: crypto.randomUUID(), name, playerGoogleIds: [] },
    ]);
    setNewTeam("");
  };

  const parseLines = (raw: string) =>
    raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({
        settings: { allowPlayerBattleCreation: allowPlayerBattles },
        packContent: {
          agendas: parseLines(agendas),
          missions: parseLines(missions),
          relics: parseLines(relics),
        },
        groups,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto items-start dialog-scrim p-3"
    >
      <div className="w-full max-w-2xl dialog-panel">
        <div className="flex items-start justify-between gap-8">
          <span />
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-link"
          >
            Cancel
          </button>
        </div>

        <h2 className="specimen-title text-[clamp(1.75rem,4vw,2.75rem)] mt-6 [&_em]:specimen-title-em">
          Tune the <em>campaign</em>
        </h2>

        <div className="mt-10 grid gap-8">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowPlayerBattles}
              onChange={(e) => setAllowPlayerBattles(e.target.checked)}
              className="accent-accent w-4 h-4 mt-1"
            />
            <span>
              <span className="font-display text-lg leading-tight block">
                Players can record battles
              </span>
              <span className="text-mute text-[13px] leading-[1.5]">
                Off means only you (the GM) can create battle records.
              </span>
            </span>
          </label>

          <div className="grid gap-2">
            <span className="label-mono">Pack content · one name per line</span>
            <span className="text-mute text-[13px] leading-[1.5] max-w-[56ch]">
              Names from your crusade pack (or homebrew). They're offered as
              suggestions when players fill in missions and agendas. Free
              text still works everywhere. Rules text stays in your books.
            </span>
            <div className="grid sm:grid-cols-3 gap-4 mt-2">
              <PackListField
                label="Agendas"
                value={agendas}
                onChange={setAgendas}
                placeholder={"Hold the line\nTake a prisoner"}
              />
              <PackListField
                label="Missions"
                value={missions}
                onChange={setMissions}
                placeholder={"Night raid\nBridge crossing"}
              />
              <PackListField
                label="Relics"
                value={relics}
                onChange={setRelics}
                placeholder={"Heirloom blade\nTattered banner"}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <span className="label-mono">Teams</span>
            <span className="text-mute text-[13px] leading-[1.5] max-w-[56ch]">
              Assign players to teams on the Players card.
            </span>
            {groups.length > 0 && (
              <ul className="grid gap-2 list-none m-0 p-0 mt-2">
                {groups.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between gap-3 border border-rule p-3"
                  >
                    <span className="font-display">{g.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setGroups((gs) => gs.filter((x) => x.id !== g.id))
                      }
                      className="font-mono text-[13px] text-mute hover:text-bad"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={newTeam}
                onChange={(e) => setNewTeam(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTeam();
                  }
                }}
                aria-label="New team name"
                placeholder="Team name (e.g. Defenders)"
                className="field flex-1"
              />
              <button
                type="button"
                onClick={addTeam}
                disabled={!newTeam.trim()}
                className="btn btn-sm"
              >
                + Team
              </button>
            </div>
          </div>

          {error && (
            <div className="border border-bad text-bad p-4 font-mono text-[13px] leading-[1.5]">
              <strong className="font-semibold">Failed:</strong> {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-rule-strong">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="btn btn-primary"
            >
              {busy ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PackListField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="grid gap-2 content-start">
      <span className="font-mono text-[13px] text-ink-2">
        {label}
      </span>
      <textarea
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field resize-y"
      />
    </label>
  );
}
