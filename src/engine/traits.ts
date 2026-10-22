import type { Character } from "./character";
import type { Requirement, Rules } from "./rules";
import type { EffectAccumulator, ExprContext } from "./effects";
import { applyEffects } from "./effects";
import { unmetReason } from "./requirements";
import { picksFor } from "./choices";

export const MAX_TRAITS = 2;

/** Why a requirement isn't met, or `null` if it is. */
function unmet(r: Requirement, c: Character, ctx: ExprContext, acc: EffectAccumulator): string | null {
  // Scores include ability modifiers from earlier stages (e.g. race).
  return unmetReason(r, {
    level: ctx.level,
    race: c.race.id,
    countsAsRace: acc.countsAsRace.map((x) => x.race),
    score: (a) => ctx.abilities[a] + (acc.modifiers.get(`ability.${a}`) ?? []).reduce((n, m) => n + m.value, 0),
  });
}

/**
 * Stage 4 of the pipeline: the chosen traits. A Wild Wasteland trait uses the
 * chosen variant's effects *instead of* the base effects. Problems (too many
 * traits, unknown trait or variant, unmet requirements) are reported, never thrown.
 */
export function applyTraits(
  c: Character,
  rules: Rules,
  ctx: ExprContext,
  acc: EffectAccumulator,
  problems: string[],
): void {
  if (c.traits.length > MAX_TRAITS) {
    problems.push(`Has ${c.traits.length} traits, but the maximum is ${MAX_TRAITS}`);
  }
  const seen = new Set<string>();
  for (const pick of c.traits) {
    const trait = rules.traitById.get(pick.id);
    if (!trait) {
      problems.push(`Unknown trait: ${pick.id}`);
      continue;
    }
    if (seen.has(pick.id)) {
      problems.push(`Trait ${trait.name} is chosen more than once`);
      continue;
    }
    seen.add(pick.id);

    let effects = trait.effects;
    let requirements = trait.requirements;
    let source = `Trait: ${trait.name}`;
    if (pick.wildWasteland) {
      const index = pick.variant ?? 0;
      const variant = trait.wildWasteland?.[index];
      if (!variant) {
        problems.push(`Trait ${trait.name} has no Wild Wasteland variant ${index}`);
        continue;
      }
      effects = variant.effects;
      requirements = variant.requirements ?? requirements;
      source = `Trait (Wild Wasteland): ${trait.name}`;
    }
    for (const r of requirements) {
      const why = unmet(r, c, ctx, acc);
      if (why) problems.push(`Trait ${trait.name} requires ${why}`);
    }
    applyEffects(effects, source, trait.name, { ...ctx, picks: picksFor(c, pick.id) }, acc, problems);
  }
}

