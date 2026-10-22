import type { Character } from "./character";
import type { Rules } from "./rules";
import type { PartyContext, PartyStats, Sheet, StatResult } from "./sheet";
import { computeSheet } from "./sheet";
import { mod } from "./math";

export type PartySheet = {
  /** Each member's sheet, in input order, with party stats and Party Nerve applied. */
  sheets: Sheet[];
  party: PartyStats;
};

/** Party stats from the members' solo sheets (E9, E10). `null` for an empty party. */
function partyStats(solo: Sheet[]): PartyStats {
  if (!solo.length) return { partyNerve: null, groupSneak: null };
  const mods = solo.map((s) => mod(s.abilities.charisma.value));
  const sum = mods.reduce((a, b) => a + b, 0);
  const sneak = solo.map((s) => s.skills.sneak.value);
  const sneakSum = sneak.reduce((a, b) => a + b, 0);
  const src = "party";
  return {
    partyNerve: {
      value: Math.floor(sum / 2),
      breakdown: [
        ...mods.map((m, i) => ({ source: src, label: `CHA modifier of PC ${i + 1}`, value: m })),
        { source: src, label: `floor(${sum} / 2) rounding`, value: Math.floor(sum / 2) - sum },
      ],
    } satisfies StatResult,
    groupSneak: {
      value: Math.floor(sneakSum / solo.length),
      breakdown: [
        ...sneak.map((v, i) => ({ source: src, label: `Sneak of PC ${i + 1}`, value: v })),
        {
          source: src,
          label: `floor(${sneakSum} / ${solo.length}) instead of the sum`,
          value: Math.floor(sneakSum / solo.length) - sneakSum,
        },
      ],
    } satisfies StatResult,
  };
}

/**
 * Pure: `(characters, rules) → sheets`. Party stats need every PC, so the whole
 * party is passed in. Each member's death save gains Party Nerve, and a perk
 * with `repeat.scope: "party"` picked again by a later member is a `problem`
 * on that member's sheet and gives no effects.
 */
export function computePartySheet(characters: Character[], rules: Rules): PartySheet {
  const party = partyStats(characters.map((c) => computeSheet(c, rules)));
  const taken = new Set<string>();
  const sheets = characters.map((c) => {
    const ctx: PartyContext = {
      partyNerve: party.partyNerve!,
      groupSneak: party.groupSneak!,
      taken: new Set(taken),
    };
    for (const p of c.perks) if (p.level <= c.level) taken.add(p.id);
    return computeSheet(c, rules, ctx);
  });
  return { sheets, party };
}
