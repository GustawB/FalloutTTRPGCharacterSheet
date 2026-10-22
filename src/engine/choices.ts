import type { Character } from "./character";

/** Key of a stored pick in `Character.choices`: the perk or trait id and the choice id. */
export const choiceKey = (entryId: string, choiceId: string) => `${entryId}:${choiceId}`;

/** The stored picks of one perk or trait, by choice id. */
export function picksFor(c: Character, entryId: string): Record<string, string[]> {
  const prefix = `${entryId}:`;
  const out: Record<string, string[]> = {};
  for (const [key, picks] of Object.entries(c.choices)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = picks;
  }
  return out;
}
