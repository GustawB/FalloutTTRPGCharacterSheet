import type { Character } from "./character";
import type { EffectAccumulator } from "./effects";
import type { Breakdown, StatResult } from "./sheet";

const total = (breakdown: Breakdown): StatResult => ({
  value: breakdown.reduce((sum, c) => sum + c.value, 0),
  breakdown,
});

/** Default bounds a stat has without any effect; an effect bound of the same kind replaces them. */
export type Bounds = { min?: { value: number; why: string }; max?: { value: number; why: string } };

/**
 * Pipeline stage 6 plus clamps. Appends the manual overrides for `key`
 * (added to the value, always sourced "manual override" with the user's note),
 * then applies the default bounds and `clamp` effects last. Each clamp that
 * changes the value appears in the breakdown as its own line.
 */
export function finalizeStat(
  key: string,
  stat: StatResult,
  character: Character,
  acc: EffectAccumulator,
  defaults: Bounds = {},
): StatResult {
  const breakdown = [...stat.breakdown];
  const sum = () => breakdown.reduce((s, c) => s + c.value, 0);

  for (const o of character.manualOverrides) {
    if (o.stat === key) {
      breakdown.push({ source: "manual override", label: o.note ? `Manual: ${o.note}` : "Manual", value: o.value });
    }
  }

  const bounds: { kind: "min" | "max"; value: number; why: string }[] = [];
  const mine = acc.clamps.filter((c) => c.stat === key);
  for (const kind of ["min", "max"] as const) {
    const fromEffects = mine.filter((c) => c[kind] !== undefined);
    const dflt = defaults[kind];
    if (fromEffects.length === 0 && dflt) bounds.push({ kind, ...dflt });
    for (const c of fromEffects) bounds.push({ kind, value: c[kind]!, why: c.source });
  }
  // Floors first, then ceilings, so a ceiling always holds.
  bounds.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "min" ? -1 : 1));
  for (const b of bounds) {
    const now = sum();
    const clamped = b.kind === "min" ? Math.max(now, b.value) : Math.min(now, b.value);
    if (clamped !== now) {
      const word = b.kind === "min" ? "at least" : "at most";
      breakdown.push({ source: "clamp", label: `Clamp to ${word} ${b.value} (${b.why})`, value: clamped - now });
    }
  }
  return total(breakdown);
}
