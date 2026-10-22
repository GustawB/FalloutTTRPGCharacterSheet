import type { AbilityId, ConditionId, DamageType, RaceId, RollId, SkillId, StatId } from "./vocab";

export type * from "./vocab";

export type Source = { page: number };

export type Requirement =
  | { kind: "ability"; ability: AbilityId; min?: number; max?: number }
  | { kind: "anyAbility"; max: number }
  | { kind: "race"; anyOf: RaceId[] }
  | { kind: "level"; min: number }
  | { kind: "condition"; text: string };

export type Repeat = {
  text: string;
  max?: number | null;
  scope?: "party";
};

export type Expr =
  | number
  | { ref: "level" | `ability.${AbilityId}` | `mod.${AbilityId}` | "rank" | "skillPointGrants" }
  | { op: "add" | "sub" | "mul" | "div" | "min" | "max"; args: Expr[] }
  | { op: "floor"; args: [Expr] };

export type Effect =
  | { type: "modifier"; stat: StatId | "skill.*"; value: Expr }
  | { type: "clamp"; stat: StatId; min?: number; max?: number }
  | { type: "rollMode"; roll: RollId; mode: "advantage" | "disadvantage" }
  | {
      type: "immunity" | "resistance" | "vulnerability";
      to: `damage.${DamageType}` | `condition.${ConditionId}` | "radiationLevels";
    }
  | { type: "grantPerk"; perkId: string }
  | { type: "countsAsRace"; race: RaceId; for: "perkRequirements" }
  | { type: "note"; text: string };

export type Perk = {
  id: string;
  name: string;
  kind: "perk";
  category: "general" | AbilityId | "race";
  requirements: Requirement[];
  requirementText?: string;
  repeat?: Repeat;
  description: string;
  source: Source;
  effects: Effect[];
  needsReview?: true;
};

export type Trait = Omit<Perk, "kind" | "category" | "repeat"> & {
  kind: "trait";
  category: "race" | "background" | "character";
  wildWasteland?: {
    label?: string;
    requirementText?: string;
    requirements?: Requirement[];
    description: string;
    effects: Effect[];
  }[];
};

export type Background = {
  id: string;
  name: string;
  skills: SkillId[] | null;
  traitId: string | null;
  description: string;
  source: Source;
  startingEquipment: { races: RaceId[]; label: string; items: string }[];
};

export type Feature = {
  id: string;
  name: string;
  description: string;
  effects: Effect[];
  needsReview?: true;
};

export type Race = {
  id: RaceId;
  name: string;
  source: Source;
  size: ("small" | "medium" | "large")[];
  hasRadiationDc: boolean;
  features: Feature[];
  subtypes?: {
    id: string;
    name: string;
    source: Source;
    features: Feature[];
    toolChoice?: {
      count: number;
      description: string;
      needsReview?: true;
      options: { id: string; name: string; text: string }[];
    };
  }[];
  variants: {
    id: string;
    name: string;
    replaces: string[];
    features: Feature[];
  }[];
};

/** Parsed contents of data/*.json, as handed to `loadRules`. */
export type RulesData = {
  perks: Perk[];
  traits: Trait[];
  backgrounds: Background[];
  races: Race[];
};

/** All rules data bundled, with id lookups. */
export type Rules = RulesData & {
  perkById: ReadonlyMap<string, Perk>;
  traitById: ReadonlyMap<string, Trait>;
  backgroundById: ReadonlyMap<string, Background>;
  raceById: ReadonlyMap<RaceId, Race>;
};

function index<T extends { id: K }, K extends string>(what: string, items: T[]): Map<K, T> {
  if (!Array.isArray(items)) throw new Error(`${what}: expected an array`);
  const map = new Map<K, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new Error(`${what}: duplicate id "${item.id}"`);
    map.set(item.id, item);
  }
  return map;
}

/** Pure: bundles already-parsed rules data and builds the id lookups. Throws on duplicate ids. */
export function loadRules(data: RulesData): Rules {
  return {
    ...data,
    perkById: index("perks", data.perks),
    traitById: index("traits", data.traits),
    backgroundById: index("backgrounds", data.backgrounds),
    raceById: index("races", data.races),
  };
}
