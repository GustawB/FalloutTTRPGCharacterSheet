import type { Character } from "./character";
import type { Feature, Race, Rules } from "./rules";
import type { EffectAccumulator, ExprContext } from "./effects";
import { applyEffects } from "./effects";

/**
 * Stage 2 of the pipeline: base features, then the chosen subtype, then the
 * chosen variants (whose `replaces` removes base features first). Choices are
 * validated into `problems`; nothing throws.
 */
export function applyRace(
  c: Character,
  rules: Rules,
  ctx: ExprContext,
  acc: EffectAccumulator,
  problems: string[],
): void {
  const race = rules.raceById.get(c.race.id);
  if (!race) return; // the base stage already reported the unknown race

  const features: { feature: Feature; label: string }[] = [];
  const variants = pickVariants(c, race, problems);
  const replaced = new Set(variants.flatMap((v) => v.replaces));
  for (const f of race.features) {
    if (!replaced.has(f.id)) features.push({ feature: f, label: race.name });
  }

  const subtype = pickSubtype(c, race, problems);
  if (subtype) for (const f of subtype.features) features.push({ feature: f, label: subtype.name });
  for (const v of variants) for (const f of v.features) features.push({ feature: f, label: v.name });

  for (const { feature, label } of features) {
    const source = `${race.name} (${label}): ${feature.name}`;
    applyEffects(feature.effects, source, feature.name, ctx, acc, problems);
  }
}

function pickSubtype(c: Character, race: Race, problems: string[]) {
  const subtypes = race.subtypes ?? [];
  const id = c.race.subtype;
  if (subtypes.length === 0) {
    if (id) problems.push(`${race.name} has no subtypes, but "${id}" is chosen`);
    return undefined;
  }
  if (!id) {
    problems.push(`${race.name} requires a subtype`);
    return undefined;
  }
  const subtype = subtypes.find((s) => s.id === id);
  if (!subtype) {
    problems.push(`Unknown ${race.name} subtype: ${id}`);
    return undefined;
  }
  const tools = c.race.tools ?? [];
  const choice = subtype.toolChoice;
  if (choice?.count === undefined) {
    if (tools.length > 0) problems.push(`${subtype.name} has no tool choice, but tools are chosen`);
    return subtype;
  }
  // Duplicates are allowed (E14).
  if (tools.length !== choice.count) {
    problems.push(`${subtype.name} needs ${choice.count} tool(s), got ${tools.length}`);
  }
  const options = new Set(choice.options.map((o) => o.id));
  for (const t of tools) {
    if (!options.has(t)) problems.push(`Unknown ${subtype.name} tool: ${t}`);
  }
  return subtype;
}

function pickVariants(c: Character, race: Race, problems: string[]) {
  const chosen: Race["variants"] = [];
  for (const id of new Set(c.race.variants)) {
    const v = race.variants.find((x) => x.id === id);
    if (v) chosen.push(v);
    else problems.push(`Unknown ${race.name} variant: ${id}`);
  }
  chosen.forEach((a, i) => {
    for (const b of chosen.slice(i + 1)) {
      const overlap = a.replaces.filter((r) => b.replaces.includes(r));
      if (overlap.length > 0) {
        problems.push(
          `${race.name} variants "${a.name}" and "${b.name}" are mutually exclusive (both replace ${overlap.join(", ")})`,
        );
      }
    }
  });
  return chosen;
}

/** Why `variantId` can't be added to the chosen variants (they share a replaced feature), or `null`. */
export function variantConflict(race: Race, chosen: string[], variantId: string): string | null {
  const variant = race.variants.find((v) => v.id === variantId);
  if (!variant) return null;
  for (const id of chosen) {
    if (id === variantId) continue;
    const other = race.variants.find((v) => v.id === id);
    if (other && other.replaces.some((r) => variant.replaces.includes(r))) {
      return `Conflicts with ${other.name} (both replace the same feature)`;
    }
  }
  return null;
}
