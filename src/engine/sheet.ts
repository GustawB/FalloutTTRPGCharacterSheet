import type { Character } from "./character";
import type { Rules } from "./rules";
import type {
  AbilityId, ConditionId, DamageType, DerivedId, RollId, SkillId,
} from "./vocab";
import { baseAbilities, baseDerived } from "./base";
import { newAccumulator } from "./effects";
import { applyRace } from "./race";
import { applyTraits } from "./traits";
import { applyPerks } from "./perks";
import { finalizeStat } from "./clamps";
import type { Bounds } from "./clamps";
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
  /** Perk points spent (perks picked plus ability increases); compare with `derived.perkPoints`. */
  perkPointsSpent: StatResult;
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

const total = (breakdown: Breakdown): StatResult => ({
  value: breakdown.reduce((sum, c) => sum + c.value, 0),
  breakdown,
});

/**
 * Pure: `(character, rules) → sheet`. Base, race, background, trait, perk,
 * manual override and clamp stages.
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
  // Stage 4: traits (Wild Wasteland variants replace the base effects).
  applyTraits(character, rules, ctx, acc, problems);
  // Stage 5: perks (ranks, grantPerk, repeat limits).
  const perkStage = applyPerks(character, rules, ctx, acc, problems);

  // Ability effects, overrides and clamps come first: everything derived reads the final scores.
  const abilities = Object.fromEntries(
    ABILITIES.map((a) => {
      const key = `ability.${a}`;
      const stat = finalizeStat(key, append(base[a], acc.modifiers.get(key)), character, acc);
      if (stat.value < 1 || stat.value > 10) {
        problems.push(`${a} is ${stat.value}; ability scores range from 1 to 10`);
      }
      return [a, stat];
    }),
  ) as Record<AbilityId, StatResult>;
  const derived = baseDerived(character, rules, abilities, problems);
  // apMax first: the AP cap reads its final value. AC never drops below 10 unless a clamp effect says so.
  const order = ["apMax", ...Object.keys(derived).filter((k) => k !== "apMax")] as (keyof typeof derived)[];
  for (const id of order) {
    const stat = derived[id];
    if (!stat) continue;
    const defaults: Bounds =
      id === "ap" ? { max: { value: derived.apMax.value, why: "apMax" } }
      : id === "ac" ? { min: { value: 10, why: "AC floor" } }
      : {};
    derived[id] = finalizeStat(id, append(stat, acc.modifiers.get(id)), character, acc, defaults);
  }
  for (const o of character.manualOverrides) {
    const isKnown =
      (o.stat in derived && derived[o.stat as keyof typeof derived] !== null) ||
      o.stat.startsWith("ability.") || o.stat.startsWith("skill.");
    if (!isKnown) problems.push(`Manual override on ${o.stat}, which this character does not have`);
  }

  const baseSk = baseSkills(character, rules, abilities, problems);
  const skills = Object.fromEntries(
    SKILLS.map((s) => [
      s,
      finalizeStat(`skill.${s}`, append(baseSk[s], acc.modifiers.get(`skill.${s}`)), character, acc),
    ]),
  ) as Sheet["skills"];

  const spent = skillPointsSpent(character, problems);
  if (spent > derived.skillPoints.value) {
    problems.push(`Spent ${spent} skill points but only ${derived.skillPoints.value} are available`);
  }

  if (perkStage.spent > derived.perkPoints.value) {
    problems.push(`Spent ${perkStage.spent} perk points but only ${derived.perkPoints.value} are available`);
  }
  const increases = perkStage.spent - perkStage.picks;

  return {
    abilities,
    skills,
    skillPointsSpent: { value: spent, breakdown: [{ source: "skill points", label: "Allocated to skills", value: spent }] },
    perkPointsSpent: total([
      { source: "perks", label: "Perks picked", value: perkStage.picks },
      { source: "perks", label: "Ability increases", value: increases },
    ]),
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
