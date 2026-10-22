import type { Character } from "./character";
import type { Rules } from "./rules";
import type {
  AbilityId, ConditionId, DamageType, DerivedId, RollId, SkillId,
} from "./vocab";
import { baseAbilities, baseDerived } from "./base";
import { newAccumulator } from "./effects";
import { applyRace } from "./race";
import { baseSkills, skillPointsSpent } from "./skills";
import { ABILITIES, SKILLS } from "./vocab";

/** One line of a breakdown: where a number came from and how much it added. */
export type Contribution = { source: string; label: string; value: number };
export type Breakdown = Contribution[];
/** A derived number; `value` is the sum of the breakdown after clamps. */
export type StatResult = { value: number; breakdown: Breakdown };

/** A resistance, immunity or vulnerability, with where it came from. */
export type DefenseTarget = `damage.${DamageType}` | `condition.${ConditionId}` | "radiationLevels";
export type Defense = { to: DefenseTarget; source: string };
export type RollModeResult = {
  roll: RollId;
  mode: "advantage" | "disadvantage";
  source: string;
};
export type SheetNote = { source: string; text: string };

/** Party stats are `null` until every PC in the party is known. */
export type PartyStats = {
  partyNerve: StatResult | null;
  groupSneak: StatResult | null;
};

export type Sheet = {
  abilities: Record<AbilityId, StatResult>;
  skills: Record<SkillId, StatResult>;
  /** Every derived id except the party stats, which live in `party`. */
  derived: Record<Exclude<DerivedId, "partyNerve" | "groupSneak" | "radiationDc">, StatResult> & {
    /** `null` unless the race has `hasRadiationDc` (humans). */
    radiationDc: StatResult | null;
  };
  /** Skill points allocated; compare with `derived.skillPoints` (available). */
  skillPointsSpent: StatResult;
  party: PartyStats;
  notes: SheetNote[];
  rollModes: RollModeResult[];
  resistances: Defense[];
  immunities: Defense[];
  vulnerabilities: Defense[];
  /** Things wrong with the character (unknown ids, unmet requirements, ...). */
  problems: string[];
};

/** Appends contributions to a stat; the value stays the sum of the breakdown. */
function append(stat: StatResult, extra: Breakdown | undefined): StatResult {
  if (!extra?.length) return stat;
  const breakdown = [...stat.breakdown, ...extra];
  return { value: breakdown.reduce((sum, c) => sum + c.value, 0), breakdown };
}

/**
 * Pure: `(character, rules) → sheet`. Base, race and background stages exist
 * so far; traits and perks land later.
 */
export function computeSheet(character: Character, rules: Rules): Sheet {
  const problems: string[] = [];
  const base = baseAbilities(character);
  const acc = newAccumulator();

  // Stage 2: race. Expressions see the ability scores before effects.
  const ctx = {
    level: character.level,
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, base[a].value])) as Record<AbilityId, number>,
  };
  applyRace(character, rules, ctx, acc, problems);

  // Ability effects come first: everything derived reads the final scores.
  const abilities = Object.fromEntries(
    ABILITIES.map((a) => [a, append(base[a], acc.modifiers.get(`ability.${a}`))]),
  ) as Record<AbilityId, StatResult>;
  const derived = baseDerived(character, rules, abilities, problems);
  for (const id of Object.keys(derived) as (keyof typeof derived)[]) {
    const stat = derived[id];
    if (stat) derived[id] = append(stat, acc.modifiers.get(id));
  }

  const baseSk = baseSkills(character, rules, abilities, problems);
  const skills = Object.fromEntries(
    SKILLS.map((s) => [s, append(baseSk[s], acc.modifiers.get(`skill.${s}`))]),
  ) as Sheet["skills"];

  const spent = skillPointsSpent(character, problems);
  if (spent > derived.skillPoints.value) {
    problems.push(`Spent ${spent} skill points but only ${derived.skillPoints.value} are available`);
  }

  return {
    abilities,
    skills,
    skillPointsSpent: { value: spent, breakdown: [{ source: "skill points", label: "Allocated to skills", value: spent }] },
    derived,
    party: { partyNerve: null, groupSneak: null },
    notes: acc.notes,
    rollModes: acc.rollModes,
    resistances: acc.resistances,
    immunities: acc.immunities,
    vulnerabilities: acc.vulnerabilities,
    problems,
  };
}
