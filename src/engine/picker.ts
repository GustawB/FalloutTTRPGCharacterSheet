import type { Character } from "./character";
import { checkRequirements, sheetWithout } from "./requirements";
import type { Perk, Rules, Trait } from "./rules";
import { computeSheet } from "./sheet";

export type PickerEntry<E extends Perk | Trait> = {
  entry: E;
  /** True if the entry can be picked now (requirements met and not already owned). */
  eligible: boolean;
  /** Why not, when `eligible` is false. */
  reasons: string[];
};

/** Pick limit of a perk: 1 unless `repeat.max` says otherwise; `null` is unbounded. */
export const perkMaxRanks = (p: Perk): number => {
  const max = p.repeat?.max;
  return max === undefined ? 1 : max === null ? Infinity : max;
};

/**
 * Pure. Every perk (or trait) with its eligibility for `character`. Eligible
 * entries come first, then by name. An entry that is already owned (perks:
 * at max rank, including granted ones) is ineligible with the reason
 * "already owned". Requirements are checked on a sheet without the entry itself.
 */
export function pickerEntries(kind: "perk", character: Character, rules: Rules): PickerEntry<Perk>[];
export function pickerEntries(kind: "trait", character: Character, rules: Rules): PickerEntry<Trait>[];
export function pickerEntries(kind: "perk" | "trait", character: Character, rules: Rules): PickerEntry<Perk | Trait>[] {
  const sheet = computeSheet(character, rules);
  const entries: (Perk | Trait)[] = kind === "perk" ? rules.perks : rules.traits;
  const out = entries.map((entry): PickerEntry<Perk | Trait> => {
    const reasons: string[] = [];
    if (entry.kind === "perk") {
      if ((sheet.perkRanks[entry.id] ?? 0) >= perkMaxRanks(entry)) reasons.push("already owned");
    } else if (character.traits.some((t) => t.id === entry.id)) {
      reasons.push("already owned");
    }
    const owned = reasons.length > 0 || (entry.kind === "perk" && (sheet.perkRanks[entry.id] ?? 0) > 0);
    const view = owned ? sheetWithout(character, rules, entry) : sheet;
    reasons.push(...checkRequirements(entry, character, view).unmet.map((u) => `requires ${u.reason}`));
    return { entry, eligible: reasons.length === 0, reasons };
  });
  return out.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.entry.name.localeCompare(b.entry.name) || (a.entry.id < b.entry.id ? -1 : 1));
}

/** Perk points still unspent. */
export function perkPointsLeft(character: Character, rules: Rules): number {
  const s = computeSheet(character, rules);
  return s.derived.perkPoints.value - s.perkPointsSpent.value;
}

/** The character with one more rank of `perkId`, picked at its current level. */
export const withPerk = (c: Character, perkId: string): Character => ({
  ...c,
  perks: [...c.perks, { id: perkId, level: c.level }],
});
