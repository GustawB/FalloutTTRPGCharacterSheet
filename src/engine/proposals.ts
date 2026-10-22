import type { Character } from "./character";
import { checkRequirements, sheetWithout } from "./requirements";
import type { Perk, Rules } from "./rules";
import { computeSheet } from "./sheet";
import type { Sheet } from "./sheet";
import type { AbilityId, SkillId } from "./vocab";
import { SKILLS } from "./vocab";

export type PerkProposal = {
  perkId: string;
  /** True if the character meets every requirement now; false means "near". */
  eligible: boolean;
  /** For a near perk: the ability that needs +1 to qualify. */
  missing?: { ability: AbilityId; have: number; need: number }[];
  score: number;
  reasons: string[];
};

/**
 * Perk proposals. Pure and deterministic.
 *
 * Candidates: perks whose requirements are all met ("eligible"), and perks
 * whose only unmet requirement is one ability minimum missed by exactly 1
 * ("near": one perk point spent on an ability increase would unlock it).
 * Perks already at their maximum rank (picked or granted) are skipped.
 *
 * Score (integer, higher is better):
 *   + the score of the perk's category ability (general and race perks: 0)
 *   + for each ability requirement with a minimum: that ability's score
 *   + for each skill the perk's effects modify by name (not `skill.*`):
 *     skill points allocated + 2 if the background boosts it
 *   - 5 if near
 * Order: eligible before near, then score descending, then perk id ascending.
 */
export function proposePerks(character: Character, rules: Rules): PerkProposal[] {
  const sheet = computeSheet(character, rules);
  const out: PerkProposal[] = [];
  const invested = (s: SkillId) =>
    (character.skillPointAllocations[s] ?? 0) + (character.background.skills.includes(s) ? 2 : 0);

  for (const perk of rules.perks) {
    const rank = sheet.perkRanks[perk.id] ?? 0;
    const max = perk.repeat ? (perk.repeat.max ?? Infinity) : 1;
    if (rank >= max) continue;

    // An owned repeatable perk must not satisfy its own requirements.
    const view: Sheet = rank > 0 ? sheetWithout(character, rules, perk) : sheet;
    const check = checkRequirements(perk, character, view);
    const missing: NonNullable<PerkProposal["missing"]> = [];
    let near = !check.eligible;
    for (const { requirement: r } of check.unmet) {
      const have = r.kind === "ability" ? view.abilities[r.ability].value : 0;
      if (r.kind === "ability" && r.min !== undefined && have === r.min - 1 && missing.length === 0) {
        missing.push({ ability: r.ability, have, need: r.min });
      } else {
        near = false;
      }
    }
    if (!check.eligible && !near) continue;

    let score = 0;
    const reasons: string[] = [];
    const add = (n: number, why: string) => {
      score += n;
      reasons.push(`${why} (${n >= 0 ? "+" : ""}${n})`);
    };
    if (perk.category !== "general" && perk.category !== "race") {
      add(sheet.abilities[perk.category].value, `${perk.category} perk, your ${perk.category} is ${sheet.abilities[perk.category].value}`);
    }
    for (const r of perk.requirements) {
      if (r.kind === "ability" && r.min !== undefined) {
        add(sheet.abilities[r.ability].value, `needs ${r.ability} ${r.min}+, you have ${sheet.abilities[r.ability].value}`);
      }
    }
    const skills = new Set<SkillId>();
    for (const e of perk.effects) {
      if (e.type === "modifier" && "stat" in e) {
        const id = e.stat.startsWith("skill.") ? e.stat.slice(6) : null;
        if (id && (SKILLS as readonly string[]).includes(id)) skills.add(id as SkillId);
      }
    }
    for (const s of [...skills].sort()) {
      if (invested(s) > 0) add(invested(s), `improves ${s}, which you have invested ${invested(s)} in`);
    }
    if (near) add(-5, `one ability point short (${missing[0]!.ability} ${missing[0]!.need}+)`);

    out.push({ perkId: perk.id, eligible: check.eligible, ...(near ? { missing } : {}), score, reasons });
  }
  return out.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      b.score - a.score ||
      (a.perkId < b.perkId ? -1 : a.perkId > b.perkId ? 1 : 0),
  );
}
