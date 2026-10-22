import type { Character } from "./character";
import type { Rules } from "./rules";
import type { Breakdown, StatResult } from "./sheet";
import type { AbilityId, SkillId } from "./vocab";
import { SKILLS } from "./vocab";
import vocabJson from "../../data/vocab.json";
import { mod } from "./math";

const SKILL_ABILITIES = vocabJson.skillAbilities as unknown as Record<
  SkillId, { default: AbilityId; alternates?: AbilityId[] }
>;
const BACKGROUND_BONUS = 2;

/** E7: -1 for a negative Luck modifier, otherwise half the modifier rounded down. */
export function luckSkillBonus(modLuck: number): number {
  return modLuck < 0 ? -1 : Math.floor(modLuck / 2);
}

/** The ability a skill uses: the player's pick if allowed, else the p20 default (E11). */
export function skillAbilityFor(c: Character, skill: SkillId, problems?: string[]): AbilityId {
  const entry = SKILL_ABILITIES[skill];
  const pick = (c.skillAbility as Partial<Record<SkillId, AbilityId>>)[skill];
  if (pick === undefined || pick === entry.default) return entry.default;
  if (entry.alternates?.includes(pick)) return pick;
  problems?.push(`${skill} cannot use ${pick}; using ${entry.default}`);
  return entry.default;
}

/**
 * Stage stats for skills: ability modifier, Luck bonus, background, allocated
 * points. Effect contributions are appended by the caller.
 */
export function baseSkills(
  c: Character,
  rules: Rules,
  abilities: Record<AbilityId, StatResult>,
  problems: string[],
): Record<SkillId, StatResult> {
  const luckBonus = luckSkillBonus(mod(abilities.luck.value));

  const bg = rules.backgroundById.get(c.background.id);
  if (!bg) problems.push(`Unknown background: ${c.background.id}`);
  const picked = new Set<SkillId>();
  for (const s of c.background.skills) {
    if (!SKILLS.includes(s)) problems.push(`Unknown background skill: ${s}`);
    else if (picked.has(s)) problems.push(`Background skill picked twice: ${s}`);
    else if (bg?.skills && !bg.skills.includes(s)) {
      problems.push(`Background skill ${s} is not allowed by ${bg.name}`);
    }
    picked.add(s);
  }

  return Object.fromEntries(
    SKILLS.map((s) => {
      const ability = skillAbilityFor(c, s, problems);
      const score = abilities[ability].value;
      const breakdown: Breakdown = [
        { source: "base", label: `${ability} modifier (${score} − 5)`, value: mod(score) },
        { source: "base", label: "Luck skill bonus", value: luckBonus },
      ];
      if (picked.has(s)) breakdown.push({ source: "background", label: bg?.name ?? "Background", value: BACKGROUND_BONUS });
      const points = c.skillPointAllocations[s] ?? 0;
      if (points !== 0) breakdown.push({ source: "skill points", label: "Allocated skill points", value: points });
      return [s, { value: breakdown.reduce((n, b) => n + b.value, 0), breakdown }];
    }),
  ) as Record<SkillId, StatResult>;
}

/** Total allocated skill points; flags negative or fractional entries. */
export function skillPointsSpent(c: Character, problems: string[]): number {
  let spent = 0;
  for (const [skill, n] of Object.entries(c.skillPointAllocations)) {
    if (!Number.isInteger(n) || (n as number) < 0) problems.push(`Invalid skill point allocation for ${skill}: ${n}`);
    spent += n as number;
  }
  return spent;
}
