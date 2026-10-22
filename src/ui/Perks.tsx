import type { Character } from "../engine/character";
import { computeSheet } from "../engine/sheet";
import { perkPointsLeft, withPerk } from "../engine/picker";
import type { Rules } from "../engine/rules";
import { ABILITIES } from "../engine/vocab";
import { EntryPicker } from "./EntryPicker";
import { EntryTooltip } from "./EntryTooltip";
import { Proposals } from "./Proposals";

const label = (id: string) => id.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const ABILITY_MAX = 10;

/** Perk picks and ability increases; both spend perk points. */
export function Perks({ character, rules, onChange }: { character: Character; rules: Rules; onChange: (c: Character) => void }) {
  const left = perkPointsLeft(character, rules);
  const blocked = left <= 0 ? "No perk points left" : null;
  const abilities = computeSheet(character, rules).abilities;
  return (
    <section aria-label="Perks">
      <h2>Perks</h2>
      <p>Perk points left: <span data-testid="perkPointsLeft">{left}</span></p>
      <ul>
        {character.perks.map((p, i) => {
          const perk = rules.perkById.get(p.id);
          return (
            <li key={i}>
              {perk ? <EntryTooltip entry={perk} /> : p.id} (level {p.level}){" "}
              <button type="button" onClick={() => onChange({ ...character, perks: character.perks.filter((_, j) => j !== i) })}>
                Remove {perk?.name ?? p.id}
              </button>
            </li>
          );
        })}
      </ul>
      <EntryPicker kind="perk" label="Add perk" character={character} rules={rules} blocked={blocked}
        onPick={(id) => onChange(withPerk(character, id))} />
      <Proposals character={character} rules={rules} blocked={blocked}
        onPick={(id) => onChange(withPerk(character, id))} />
      <h3>Ability increases</h3>
      {ABILITIES.map((a) => {
        const full = abilities[a].value >= ABILITY_MAX;
        return (
          <button key={a} type="button" disabled={left <= 0 || full}
            onClick={() => onChange({ ...character, abilityIncreases: [...character.abilityIncreases, { ability: a, level: character.level }] })}>
            Increase {label(a)}
          </button>
        );
      })}
    </section>
  );
}
