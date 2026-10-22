import type { AbilityId, DamageType, RaceId, SkillId, StatId } from "./vocab";
import { ABILITIES } from "./vocab";

/** Bump when the saved shape changes incompatibly; the save server checks it. */
export const CHARACTER_SCHEMA_VERSION = 1;

export type Weapon = { name: string; damage: string; damageType?: DamageType; notes?: string };

export type Character = {
  id: string;
  name: string;
  schemaVersion: typeof CHARACTER_SCHEMA_VERSION;
  race: { id: RaceId; subtype?: string; variants: string[]; tools?: string[] };
  level: number;
  xp: number;
  /** After creation-point allocation, before perk-point increases. */
  abilities: Record<AbilityId, number>;
  background: { id: string; skills: [SkillId, SkillId, SkillId] };
  /** 0–2 entries. `variant` indexes `Trait.wildWasteland` (default 0). */
  traits: { id: string; wildWasteland: boolean; variant?: number }[];
  /** One row per pick; repeats are multiple rows. */
  perks: { id: string; level: number }[];
  /** Perk points spent on +1 to an ability. */
  abilityIncreases: { ability: AbilityId; level: number }[];
  /** Pick-time choices, keyed `<perk or trait id>:<choice id>`; values are skill or ability ids. */
  choices: Record<string, string[]>;
  skillPointAllocations: Partial<Record<SkillId, number>>;
  skillAbility: Partial<Record<"breach" | "intimidation" | "medicine", AbilityId>>;
  /** Which ability the death save uses; absent = whichever modifier is higher. */
  deathSaveAbility?: "luck" | "endurance";
  /** Toggleable timed effects, added after perks and before manual overrides and clamps. Inactive ones apply nothing. */
  temporaryModifiers: { stat: StatId; value: number; label: string; active: boolean }[];
  manualOverrides: { stat: StatId; value: number; note: string }[];
  current: {
    hp: number; sp: number; ap: number; rads: number;
    hunger: number; dehydration: number; exhaustion: number;
    karmaCapsFlipped: number;
  };
  inventory: { name: string; qty: number; notes?: string }[];
  /** Free-text weapons, no cap. `damage` is free text such as "2d6+3". */
  weapons: Weapon[];
  partyId?: string;
};

/** A level 1 human with every ability at 5. Pure: the caller supplies the id. */
export function newCharacter(id: string, name = ""): Character {
  return {
    id,
    name,
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    race: { id: "human", variants: [] },
    level: 1,
    xp: 0,
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, 5])) as Record<AbilityId, number>,
    background: { id: "custom-background", skills: ["barter", "speech", "survival"] },
    traits: [],
    perks: [],
    abilityIncreases: [],
    choices: {},
    skillPointAllocations: {},
    skillAbility: {},
    temporaryModifiers: [],
    manualOverrides: [],
    current: {
      hp: 0, sp: 0, ap: 0, rads: 0,
      hunger: 0, dehydration: 0, exhaustion: 0,
      karmaCapsFlipped: 0,
    },
    inventory: [],
    weapons: [],
  };
}

/** Fills fields that files saved by older versions lack (`weapons` → `[]`). */
export function normalizeCharacter(raw: Character): Character {
  return { ...raw, weapons: raw.weapons ?? [] };
}
