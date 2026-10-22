import type { ReactNode } from "react";
import type { AbilityId, SkillId } from "../engine/vocab";
import type { Character } from "../engine/character";
import type { Rules } from "../engine/rules";
import { computeSheet, type PartyContext, type StatResult } from "../engine/sheet";
import { skillAbilityFor, skillAbilityOptions } from "../engine/skills";
import { ABILITIES, SKILLS } from "../engine/vocab";
import { Breakdown } from "./Breakdown";
import { Build } from "./Build";
import { Perks } from "./Perks";

const DERIVED_ROWS = [
  ["hp", "Hit points"], ["sp", "Stamina"], ["ap", "Action points"], ["apMax", "AP max"],
  ["ac", "Armor class"], ["dt", "Damage threshold"], ["healingRate", "Healing rate"],
  ["carryLoad", "Carry load"], ["passiveSense", "Passive sense"], ["combatSequence", "Combat sequence"],
  ["radiationDc", "Radiation DC"], ["karmaCaps", "Karma caps"], ["deathSave", "Death save"],
  ["skillPoints", "Skill points"], ["perkPoints", "Perk points"],
] as const;

const label = (id: string) => id.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const num = (s: string, fallback: number) => (s.trim() === "" || Number.isNaN(Number(s)) ? fallback : Number(s));

function Stat({ stat }: { stat: StatResult | null }): ReactNode {
  return stat ? <Breakdown value={stat.value} lines={stat.breakdown} /> : <span>—</span>;
}

/** Abilities, skills and derived stats for one character. Editing never blocks, even out of range. */
export function Sheet({
  character, rules, party, onChange,
}: {
  character: Character;
  rules: Rules;
  party?: PartyContext;
  onChange: (c: Character) => void;
}) {
  const sheet = computeSheet(character, rules, party);
  const set = (patch: Partial<Character>) => onChange({ ...character, ...patch });

  return (
    <div>
      <section aria-label="Level and XP">
        <label>
          Level{" "}
          <input type="number" value={character.level} onChange={(e) => set({ level: num(e.target.value, 1) })} />
        </label>{" "}
        <label>
          XP <input type="number" value={character.xp} onChange={(e) => set({ xp: num(e.target.value, 0) })} />
        </label>
      </section>

      <Build character={character} rules={rules} onChange={onChange} />
      <Perks character={character} rules={rules} onChange={onChange} />

      {sheet.problems.length > 0 && (
        <section aria-label="Problems" role="alert">
          <ul>{sheet.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </section>
      )}

      <section aria-label="Abilities">
        <h2>Abilities</h2>
        {ABILITIES.map((a: AbilityId) => {
          const out = character.abilities[a] < 1 || character.abilities[a] > 10;
          return (
            <div key={a}>
              <label>
                {label(a)}{" "}
                <input
                  type="number"
                  value={character.abilities[a]}
                  onChange={(e) =>
                    set({ abilities: { ...character.abilities, [a]: num(e.target.value, character.abilities[a]) } })
                  }
                />
              </label>{" "}
              <span data-testid={`ability-${a}`}><Stat stat={sheet.abilities[a]} /></span>
              {out && <span role="note"> Warning: scores range from 1 to 10</span>}
            </div>
          );
        })}
      </section>

      <section aria-label="Skills">
        <h2>Skills</h2>
        {SKILLS.map((s: SkillId) => {
          const options = skillAbilityOptions(s);
          return (
            <div key={s}>
              {label(s)} <span data-testid={`skill-${s}`}><Stat stat={sheet.skills[s]} /></span>{" "}
              <label>
                Points {label(s)}{" "}
                <input
                  type="number"
                  min={0}
                  value={character.skillPointAllocations[s] ?? 0}
                  onChange={(e) =>
                    set({ skillPointAllocations: { ...character.skillPointAllocations, [s]: num(e.target.value, 0) } })
                  }
                />
              </label>{" "}
              {options.length > 1 ? (
                <label>
                  Ability for {label(s)}{" "}
                  <select
                    value={skillAbilityFor(character, s)}
                    onChange={(e) => set({ skillAbility: { ...character.skillAbility, [s]: e.target.value as AbilityId } })}
                  >
                    {options.map((a) => <option key={a} value={a}>{label(a)}</option>)}
                  </select>
                </label>
              ) : (
                <span>({label(options[0]!)})</span>
              )}
            </div>
          );
        })}
        <p>
          Spent <Stat stat={sheet.skillPointsSpent} /> of <Stat stat={sheet.derived.skillPoints} />
        </p>
      </section>

      <section aria-label="Derived stats">
        <h2>Derived</h2>
        {DERIVED_ROWS.map(([id, name]) => (
          <div key={id}>
            {name} <span data-testid={`derived-${id}`}><Stat stat={sheet.derived[id]} /></span>
          </div>
        ))}
        <div>Perk points spent <span data-testid="perkPointsSpent"><Stat stat={sheet.perkPointsSpent} /></span></div>
        <div>Party nerve <span data-testid="derived-partyNerve"><Stat stat={sheet.party.partyNerve} /></span></div>
        <div>Group sneak <span data-testid="derived-groupSneak"><Stat stat={sheet.party.groupSneak} /></span></div>
      </section>

      {sheet.notes.length > 0 && (
        <section aria-label="Notes">
          <h2>Notes</h2>
          <ul>{sheet.notes.map((n, i) => <li key={i}>{n.source}: {n.text}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
