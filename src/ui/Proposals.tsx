import type { Character } from "../engine/character";
import { proposePerks } from "../engine/proposals";
import type { Rules } from "../engine/rules";
import { EntryTooltip } from "./EntryTooltip";

type Props = {
  character: Character;
  rules: Rules;
  /** Reason picking is not possible right now (for example no perk points), or null. */
  blocked: string | null;
  onPick: (perkId: string) => void;
};

/** Engine perk proposals in engine order: eligible first, then "1 SPECIAL point away". */
export function Proposals({ character, rules, blocked, onPick }: Props) {
  const proposals = proposePerks(character, rules);
  return (
    <section aria-label="Perk proposals">
      <h3>Perk proposals</h3>
      {proposals.length === 0 ? <p>No proposals</p> : (
        <ul>
          {proposals.map((p) => {
            const perk = rules.perkById.get(p.perkId);
            if (!perk) return null;
            return (
              <li key={p.perkId} data-testid="proposal">
                <EntryTooltip entry={perk} />{" "}
                {p.eligible ? (
                  <button type="button" disabled={blocked !== null} title={blocked ?? undefined} aria-label={`Pick ${perk.name} from proposals`} onClick={() => onPick(p.perkId)}>
                    Pick {perk.name}
                  </button>
                ) : (
                  <em>
                    1 SPECIAL point away:{" "}
                    {p.missing?.map((m) => `${m.ability} ${m.have} → ${m.need}`).join(", ")}
                  </em>
                )}
                <ul>{p.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
