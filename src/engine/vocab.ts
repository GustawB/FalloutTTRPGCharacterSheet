// Closed id lists. data/vocab.json is the single source; vocab.test.ts fails if
// these literals drift from it (TS cannot infer literal types from JSON).
export const ABILITIES = ["strength", "perception", "endurance", "charisma", "intelligence", "agility", "luck"] as const;
export const SKILLS = [
  "barter", "breach", "crafting", "energyWeapons", "explosives", "guns", "intimidation",
  "medicine", "meleeWeapons", "science", "sneak", "speech", "survival", "unarmed",
] as const;
export const DERIVED = [
  "hp", "sp", "ap", "apMax", "ac", "dt", "healingRate", "carryLoad", "passiveSense",
  "combatSequence", "radiationDc", "karmaCaps", "deathSave", "skillPoints", "perkPoints",
  "partyNerve", "groupSneak",
] as const;
export const RACES = ["human", "ghoul", "synth", "robot", "superMutant"] as const;
export const DAMAGE_TYPES = [
  "acid", "ballistic", "bludgeoning", "cold", "electricity", "explosive", "fire",
  "impact", "laser", "piercing", "plasma", "poison", "radiation", "slashing",
] as const;
export const CONDITIONS = [
  "blinded", "bleeding", "burning", "buzzed", "corroded", "dazed", "deafened",
  "dehydration", "drunk", "dying", "encumbered", "exhaustion", "fatigue", "frightened",
  "grappled", "hammered", "heavilyEncumbered", "hunger", "invisible", "limb", "poisoned",
  "prone", "radiation", "restrained", "shadowed", "shock", "slowed", "stunned",
  "unconscious", "wasted",
] as const;
export const ROLLS = ["attack", "damage", "abilityCheck", "radiation", "addiction"] as const;

export type AbilityId = (typeof ABILITIES)[number];
export type SkillId = (typeof SKILLS)[number];
export type DerivedId = (typeof DERIVED)[number];
export type RaceId = (typeof RACES)[number];
export type DamageType = (typeof DAMAGE_TYPES)[number];
export type ConditionId = (typeof CONDITIONS)[number];

/** Any stat an effect can target: derived stats, `ability.<id>` and `skill.<id>`. */
export type StatId = DerivedId | `ability.${AbilityId}` | `skill.${SkillId}`;
/** A roll an effect can change: any stat, a roll name, or `check.<ability>`. */
export type RollId = StatId | (typeof ROLLS)[number] | `check.${AbilityId}`;
