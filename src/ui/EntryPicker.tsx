import { useId, useMemo, useState } from "react";
import type { Character } from "../engine/character";
import { pickerEntries } from "../engine/picker";
import type { Perk, Rules, Trait } from "../engine/rules";
import { EntryTooltip } from "./EntryTooltip";

type Props = {
  kind: "perk" | "trait";
  label: string;
  character: Character;
  rules: Rules;
  /** Picking is refused (entries stay visible) while this is set, e.g. "no perk points left". */
  blocked?: string | null;
  onPick: (id: string) => void;
};

/**
 * Searchable list of perks or traits. Eligible entries come first; ineligible
 * ones are greyed out with the unmet requirement, and a toggle hides them.
 */
export function EntryPicker({ kind, label, character, rules, blocked, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [hideIneligible, setHide] = useState(false);
  const listId = useId();
  const all = useMemo(
    () => (kind === "perk" ? pickerEntries("perk", character, rules) : pickerEntries("trait", character, rules)),
    [kind, character, rules],
  );
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (e) => (!hideIneligible || e.eligible) && (q === "" || e.entry.name.toLowerCase().includes(q)),
  );
  return (
    <div>
      <label>
        {label}{" "}
        <input role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
      </label>{" "}
      <label>
        <input type="checkbox" checked={hideIneligible} onChange={(e) => setHide(e.target.checked)} /> Hide ineligible
      </label>
      {blocked && <span role="note"> {blocked}</span>}
      <ul role="listbox" id={listId} aria-label={`${label} options`} style={{ maxHeight: "16rem", overflowY: "auto", listStyle: "none", padding: 0 }}>
        {shown.map(({ entry, eligible, reasons }) => {
          const usable = eligible && !blocked;
          return (
            <li key={entry.id} role="option" aria-selected={false} aria-disabled={!usable}
              style={{ opacity: eligible ? 1 : 0.5 }}>
              <EntryTooltip entry={entry as Perk | Trait} />{" "}
              <button type="button" disabled={!usable} aria-label={`Pick ${entry.name}`} onClick={() => onPick(entry.id)}>Pick</button>
              {!eligible && <span> ({reasons.join("; ")})</span>}
            </li>
          );
        })}
        {shown.length === 0 && <li role="presentation">No matches</li>}
      </ul>
    </div>
  );
}
