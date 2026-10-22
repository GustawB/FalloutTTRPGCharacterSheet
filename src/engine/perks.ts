import type { Character } from "./character";
import type { Effect, Expr, Perk, Rules } from "./rules";
import type { EffectAccumulator, ExprContext } from "./effects";
import { applyEffects } from "./effects";
import { picksFor } from "./choices";

/** True if the expression reads `rank`, i.e. it already scales itself. */
function usesRank(e: Expr): boolean {
  if (typeof e === "number") return false;
  if ("ref" in e) return e.ref === "rank";
  return e.args.some(usesRank);
}

/** Pick limit of a perk: 1 unless `repeat.max` says otherwise; `null` is unbounded. */
const maxRanks = (p: Perk): number => {
  const max = p.repeat?.max;
  return max === undefined ? 1 : max === null ? Infinity : max;
};

export type PerkStage = {
  /** Perk rows picked at or below the character's level. */
  picks: number;
  /** Perk points spent: picks plus ability increases. */
  spent: number;
  /** Final rank of every owned perk (picked or granted), after the repeat limit. */
  ranks: Map<string, number>;
};

/**
 * Stage 5 of the pipeline: owned perks. Ranks come from repeated rows in
 * `Character.perks`; a `grantPerk` (from the race, a trait or another perk)
 * adds a free rank 1 that needs no requirements. Effects scale by rank, except
 * modifiers whose expression uses `{ ref: "rank" }`. Problems are reported,
 * never thrown.
 */
export function applyPerks(
  c: Character,
  rules: Rules,
  ctx: ExprContext,
  acc: EffectAccumulator,
  problems: string[],
  /** Perk ids already picked by earlier party members, for `repeat.scope: "party"`. */
  partyTaken: ReadonlySet<string> = new Set(),
): PerkStage {
  const rows = c.perks.filter((p) => p.level <= c.level);
  const picked = new Map<string, number>();
  for (const row of rows) picked.set(row.id, (picked.get(row.id) ?? 0) + 1);

  // Close the granted set over the grants made by granted and picked perks.
  const granted = new Map<string, string>();
  const queue = acc.grants.map((g) => ({ ...g }));
  const scanned = new Set<string>();
  const scan = (id: string) => {
    if (scanned.has(id)) return;
    scanned.add(id);
    const perk = rules.perkById.get(id);
    if (!perk) return;
    for (const e of perk.effects) {
      if (e.type === "grantPerk") queue.push({ perkId: e.perkId, source: `Perk: ${perk.name}` });
    }
  };
  for (const id of picked.keys()) scan(id);
  while (queue.length) {
    const g = queue.shift()!;
    if (!granted.has(g.perkId)) granted.set(g.perkId, g.source);
    scan(g.perkId);
  }

  const ranks = new Map<string, number>();
  for (const id of new Set([...granted.keys(), ...picked.keys()])) {
    const perk = rules.perkById.get(id);
    if (!perk) {
      problems.push(`Unknown perk: ${id}`);
      continue;
    }
    const free = granted.has(id) ? 1 : 0;
    let picks = picked.get(id) ?? 0;
    if (picks > 0 && perk.repeat?.scope === "party" && partyTaken.has(id)) {
      problems.push(`Perk ${perk.name} was already taken by another party member`);
      picks = 0; // the pick gives nothing; a granted copy still applies
      if (!free) continue;
    }
    const max = maxRanks(perk);
    let rank = free + picks;
    if (rank > max) {
      problems.push(
        free && !perk.repeat
          ? `Perk ${perk.name} is already owned (from ${granted.get(id)})`
          : `Perk ${perk.name} is taken ${rank} times, but the maximum is ${max}`,
      );
      rank = max;
    }
    ranks.set(id, rank);
    const source = `Perk: ${perk.name}`;
    const label = rank > 1 ? `${perk.name} (rank ${rank})` : perk.name;
    const pctx = { ...ctx, rank, picks: picksFor(c, id) };
    // Only modifiers scale; notes, resistances and the like apply once.
    for (const e of perk.effects as Effect[]) {
      const scale = e.type === "modifier" && usesRank(e.value) ? 1 : rank;
      applyEffects([e], source, label, pctx, acc, problems, scale);
    }
  }

  const increases = c.abilityIncreases.filter((i) => i.level <= c.level).length;
  return { picks: rows.length, spent: rows.length + increases, ranks };
}
