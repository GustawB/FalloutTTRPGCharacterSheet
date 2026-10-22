import type { Character } from "../engine/character";
import type { Rules } from "../engine/rules";
import { computeSheet, type StatResult } from "../engine/sheet";
import { Breakdown } from "./Breakdown";

type CurrentKey = keyof Character["current"];

const num = (s: string, fallback: number) => (s.trim() === "" || Number.isNaN(Number(s)) ? fallback : Math.max(0, Math.trunc(Number(s))));

/** One tracked value with -/+ buttons and direct entry; `max` is shown when the stat has one. */
function Counter({ name, value, max, onSet }: { name: string; value: number; max?: StatResult; onSet: (n: number) => void }) {
  return (
    <div data-testid={`tracker-${name}`}>
      {name}{" "}
      <button type="button" aria-label={`Decrease ${name}`} disabled={value <= 0} onClick={() => onSet(value - 1)}>−</button>{" "}
      <input type="number" min={0} aria-label={`Current ${name}`} value={value} onChange={(e) => onSet(num(e.target.value, value))} />{" "}
      <button type="button" aria-label={`Increase ${name}`} onClick={() => onSet(value + 1)}>+</button>
      {max !== undefined && <span> / <span data-testid={`tracker-${name}-max`}><Breakdown value={max.value} lines={max.breakdown} /></span></span>}
      {max !== undefined && value > max.value && <span role="note"> Warning: {name} is above its maximum</span>}
    </div>
  );
}

/** Current vs max HP/SP/AP, rads, needs, karma caps and points spent vs available. Stored in `Character.current`. */
export function Trackers({ character, rules, onChange }: { character: Character; rules: Rules; onChange: (c: Character) => void }) {
  const sheet = computeSheet(character, rules);
  const set = (key: CurrentKey) => (n: number) => onChange({ ...character, current: { ...character.current, [key]: n } });
  const c = character.current;
  const skillOver = sheet.skillPointsSpent.value > sheet.derived.skillPoints.value;
  const perkOver = sheet.perkPointsSpent.value > sheet.derived.perkPoints.value;

  return (
    <section aria-label="Trackers">
      <h2>Trackers</h2>
      <Counter name="HP" value={c.hp} max={sheet.derived.hp} onSet={set("hp")} />
      <Counter name="SP" value={c.sp} max={sheet.derived.sp} onSet={set("sp")} />
      <Counter name="AP" value={c.ap} max={sheet.derived.ap} onSet={set("ap")} />
      <Counter name="Rads" value={c.rads} onSet={set("rads")} />
      <Counter name="Hunger" value={c.hunger} onSet={set("hunger")} />
      <Counter name="Dehydration" value={c.dehydration} onSet={set("dehydration")} />
      <Counter name="Exhaustion" value={c.exhaustion} onSet={set("exhaustion")} />
      <Counter name="Karma caps flipped" value={c.karmaCapsFlipped} max={sheet.derived.karmaCaps} onSet={set("karmaCapsFlipped")} />
      <div data-testid="tracker-skillPoints">
        Skill points spent <span data-testid="skillPoints-spent"><Breakdown value={sheet.skillPointsSpent.value} lines={sheet.skillPointsSpent.breakdown} /></span> / available <span data-testid="skillPoints-available"><Breakdown value={sheet.derived.skillPoints.value} lines={sheet.derived.skillPoints.breakdown} /></span>
        {skillOver && <span role="note"> Warning: over by {sheet.skillPointsSpent.value - sheet.derived.skillPoints.value} skill points</span>}
      </div>
      <div data-testid="tracker-perkPoints">
        Perk points spent <span data-testid="perkPoints-spent"><Breakdown value={sheet.perkPointsSpent.value} lines={sheet.perkPointsSpent.breakdown} /></span> / available <span data-testid="perkPoints-available"><Breakdown value={sheet.derived.perkPoints.value} lines={sheet.derived.perkPoints.breakdown} /></span>
        {perkOver && <span role="note"> Warning: over by {sheet.perkPointsSpent.value - sheet.derived.perkPoints.value} perk points</span>}
      </div>
    </section>
  );
}
