import type { Character } from "./character";
import type { Requirement, Rules } from "./rules";
import type { Sheet } from "./sheet";
import { computeSheet } from "./sheet";
import { ABILITIES } from "./vocab";
import type { AbilityId, RaceId } from "./vocab";

/** What a requirement is checked against. */
export type RequirementView = {
  level: number;
  race: RaceId;
  /** Races granted by `countsAsRace` effects. */
  countsAsRace: RaceId[];
  score: (a: AbilityId) => number;
};

/** Why a requirement isn't met, or `null` if it is. `condition` text is shown but assumed met. */
export function unmetReason(r: Requirement, v: RequirementView): string | null {
  switch (r.kind) {
    case "ability": {
      const s = v.score(r.ability);
      if (r.min !== undefined && s < r.min) return `${r.ability} ${r.min}+`;
      if (r.max !== undefined && s > r.max) return `${r.ability} ${r.max} or less`;
      return null;
    }
    case "anyAbility":
      return ABILITIES.some((a) => v.score(a) <= r.max) ? null : `an ability score of ${r.max} or less`;
    case "race":
      return r.anyOf.includes(v.race) || v.countsAsRace.some((x) => r.anyOf.includes(x))
        ? null
        : `race ${r.anyOf.join(" or ")}`;
    case "level":
      return v.level >= r.min ? null : `level ${r.min}+`;
    case "condition":
      return null;
  }
}

export type RequirementCheck = {
  eligible: boolean;
  unmet: { requirement: Requirement; reason: string }[];
};

/**
 * Pure. Checks an entry's requirements (all must hold). `sheet` should be
 * computed without the candidate entry (see `sheetWithout`), so its own effects
 * can't satisfy its requirements. `countsAsRace` effects count for race requirements.
 */
export function checkRequirements(
  entry: { requirements: Requirement[] },
  character: Character,
  sheet: Sheet,
): RequirementCheck {
  const view: RequirementView = {
    level: character.level,
    race: character.race.id,
    countsAsRace: sheet.countsAsRace.map((x) => x.race),
    score: (a) => sheet.abilities[a].value,
  };
  const unmet = entry.requirements.flatMap((requirement) => {
    const reason = unmetReason(requirement, view);
    return reason ? [{ requirement, reason }] : [];
  });
  return { eligible: unmet.length === 0, unmet };
}

/** The sheet of `character` as if it had not picked the given perk or trait. */
export function sheetWithout(
  character: Character,
  rules: Rules,
  entry: { kind: "perk" | "trait"; id: string },
): Sheet {
  return computeSheet(
    {
      ...character,
      perks: entry.kind === "perk" ? character.perks.filter((p) => p.id !== entry.id) : character.perks,
      traits: entry.kind === "trait" ? character.traits.filter((t) => t.id !== entry.id) : character.traits,
    },
    rules,
  );
}
