import type { Character } from "./character";
import type { Rules } from "./rules";
import type {
  AbilityId, ConditionId, DamageType, DerivedId, RollId, SkillId,
} from "./vocab";
import { baseAbilities, baseDerived } from "./base";
import { SKILLS } from "./vocab";

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
  party: PartyStats;
  notes: SheetNote[];
  rollModes: RollModeResult[];
  resistances: Defense[];
  immunities: Defense[];
  vulnerabilities: Defense[];
  /** Things wrong with the character (unknown ids, unmet requirements, ...). */
  problems: string[];
};

const empty = (): StatResult => ({ value: 0, breakdown: [] });

/**
 * Pure: `(character, rules) → sheet`. Only the base stage exists so far; skills
 * are zeroed stubs until the later stages land.
 */
export function computeSheet(character: Character, rules: Rules): Sheet {
  const problems: string[] = [];
  const abilities = baseAbilities(character);
  return {
    abilities,
    skills: Object.fromEntries(SKILLS.map((s) => [s, empty()])) as Sheet["skills"],
    derived: baseDerived(character, rules, abilities, problems),
    party: { partyNerve: null, groupSneak: null },
    notes: [],
    rollModes: [],
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    problems,
  };
}
