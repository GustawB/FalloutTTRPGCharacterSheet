import type { Character } from "./character";
import type { Rules } from "./rules";
import type { Breakdown, Sheet, StatResult } from "./sheet";
import type { AbilityId } from "./vocab";
import { ABILITIES } from "./vocab";
import { mod } from "./math";

const SOURCE = "base";
const AP_MAX = 15;
const ABILITY_MAX = 10;
/** Levels that grant skill points (and no perk point): 5, 9, ..., 29. */
const GRANT_LEVELS = [5, 9, 13, 17, 21, 25, 29];

const line = (label: string, value: number, source = SOURCE) => ({ source, label, value });
const total = (breakdown: Breakdown): StatResult => ({
  value: breakdown.reduce((sum, c) => sum + c.value, 0),
  breakdown,
});

/** Number of skill-point grants reached at `level`. */
export function skillPointGrants(level: number): number {
  return GRANT_LEVELS.filter((l) => l <= level).length;
}

/** Skill points per grant, keyed by INT modifier (E4). */
export function skillPointsPerGrant(modInt: number): number {
  return modInt <= -1 ? 3 : modInt === 0 ? 4 : 5;
}

/** Base abilities: the creation score plus perk-point increases up to this level (max 10). */
export function baseAbilities(c: Character): Record<AbilityId, StatResult> {
  return Object.fromEntries(
    ABILITIES.map((a) => {
      const breakdown = [line("Score", c.abilities[a])];
      const picked = c.abilityIncreases.filter((i) => i.ability === a && i.level <= c.level).length;
      const inc = Math.min(picked, Math.max(0, ABILITY_MAX - c.abilities[a]));
      if (inc > 0) breakdown.push(line("Perk point increases", inc, "perk points"));
      return [a, total(breakdown)];
    }),
  ) as Record<AbilityId, StatResult>;
}

type Derived = Sheet["derived"];

/** Stage 1 of the pipeline: formulas from abilities and level. */
export function baseDerived(
  c: Character,
  rules: Rules,
  abilities: Record<AbilityId, StatResult>,
  problems: string[],
  partyNerve?: StatResult | null,
): Derived {
  const L = c.level;
  const k = Math.floor((L - 1) / 2);
  const score = (a: AbilityId) => abilities[a].value;
  const m = (a: AbilityId) => mod(score(a));
  const mods = (a: AbilityId, name: string) => line(`${name} modifier (${score(a)} − 5)`, m(a));

  const levelBase = line(`10 + 5 × ${k} (level ${L})`, 10 + 5 * k);
  const perLevel = (a: AbilityId, name: string) =>
    line(`${name} modifier ${m(a)} × ${k + 1}`, m(a) * (k + 1));

  const race = rules.raceById.get(c.race.id);
  if (!race) problems.push(`Unknown race: ${c.race.id}`);
  const radiationDc = race?.hasRadiationDc
    ? total([line("12", 12), line(`−END modifier (${score("endurance")} − 5)`, -m("endurance"))])
    : null;

  // Death save: the player picks LCK or END; the default is the higher modifier.
  const dsAbility: AbilityId =
    c.deathSaveAbility ?? (m("luck") >= m("endurance") ? "luck" : "endurance");
  const dsName = dsAbility === "luck" ? "LCK" : "END";

  const grants = skillPointGrants(L);
  const perGrant = skillPointsPerGrant(m("intelligence"));
  const skillPointsBreakdown = [
    line(`${grants} grants × ${perGrant} (INT modifier ${m("intelligence")})`, grants * perGrant),
  ];
  const perkPointsBreakdown = [
    line(`Level ${L}`, L),
    line(`No perk point at ${grants} skill-point levels`, -grants),
  ];

  return {
    hp: total([levelBase, perLevel("endurance", "END")]),
    sp: total([levelBase, perLevel("agility", "AGI")]),
    // Capped at apMax by the clamp stage.
    ap: total([line("10", 10), mods("agility", "AGI")]),
    apMax: total([line(`${AP_MAX}`, AP_MAX)]),
    // Armor and effects arrive in later stages; the clamp stage floors AC at 10.
    ac: total([line("10", 10)]),
    dt: total([line("0", 0)]),
    healingRate: total([
      line(`floor((level ${L} + END ${score("endurance")}) / 2)`, Math.floor((L + score("endurance")) / 2)),
    ]),
    carryLoad: total([line(`STR ${score("strength")} × 10`, score("strength") * 10)]),
    passiveSense: total([line("12", 12), mods("perception", "PER")]),
    combatSequence: total([mods("perception", "PER")]),
    radiationDc,
    karmaCaps: total([line("1", 1), line("Luck 10", score("luck") === 10 ? 1 : 0)]),
    deathSave: total([
      line(`${dsName} modifier (${score(dsAbility)} − 5)`, m(dsAbility)),
      ...(partyNerve ? [line("Party Nerve", partyNerve.value, "party")] : []),
    ]),
    skillPoints: total(skillPointsBreakdown),
    perkPoints: total(perkPointsBreakdown),
  };
}
