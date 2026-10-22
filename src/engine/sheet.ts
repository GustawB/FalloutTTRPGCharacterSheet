import type { Character } from "./character";
import type { Rules } from "./rules";
import type {
  AbilityId, ConditionId, DamageType, DerivedId, RollId, SkillId,
} from "./vocab";
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
 * Pure: `(character, rules) → sheet`. Stub: returns the full shape with zeroed
 * stats and empty breakdowns until the formula stages land.
 */
export function computeSheet(_character: Character, _rules: Rules): Sheet {
  return {
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, empty()])) as Sheet["abilities"],
    skills: Object.fromEntries(SKILLS.map((s) => [s, empty()])) as Sheet["skills"],
    derived: {
      hp: empty(), sp: empty(), ap: empty(), apMax: empty(), ac: empty(), dt: empty(),
      healingRate: empty(), carryLoad: empty(), passiveSense: empty(),
      combatSequence: empty(), radiationDc: null, karmaCaps: empty(),
      deathSave: empty(), skillPoints: empty(), perkPoints: empty(),
    },
    party: { partyNerve: null, groupSneak: null },
    notes: [],
    rollModes: [],
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    problems: [],
  };
}
