/** Where a campaign-page panel shows: side column, or full width at the top or bottom. */
export type PanelPlacement = "side" | "above" | "below";

/** The GM's menu for moving a panel on the campaign page. */
export function PanelPlacementMenu({
  name,
  value,
  onChange,
}: {
  name: string;
  value: PanelPlacement;
  onChange: (next: PanelPlacement) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PanelPlacement)}
      aria-label={`Where ${name} shows`}
      className="bg-transparent border-0 text-xs text-mute underline cursor-pointer min-w-0 max-w-full"
    >
      <option value="side">Shown at the side</option>
      <option value="above">Shown at the top</option>
      <option value="below">Shown at the bottom</option>
    </select>
  );
}
