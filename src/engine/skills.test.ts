import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import type { Character } from "./character";
import { loadBundledRules } from "./data";
import { computeSheet } from "./sheet";
import { luckSkillBonus } from "./skills";
import { SKILLS } from "./vocab";
import type { AbilityId } from "./vocab";

const rules = loadBundledRules();
const make = (patch: Partial<Character> = {}, abilities: Partial<Record<AbilityId, number>> = {}) => {
  const c = newCharacter("t");
  return { ...c, ...patch, abilities: { ...c.abilities, ...abilities } };
};
const sheet = (patch?: Partial<Character>, abilities?: Partial<Record<AbilityId, number>>) =>
  computeSheet(make(patch, abilities), rules);

describe("luckSkillBonus (E7)", () => {
  it.each([[-2, -1], [0, 0], [1, 0], [2, 1], [5, 2]])("modLCK %i → %i", (m, want) => {
    expect(luckSkillBonus(m)).toBe(want);
  });
  it("applies to every skill on the sheet", () => {
    const s = sheet({}, { luck: 10 });
    expect(s.skills.guns.breakdown.find((b) => b.label === "Luck skill bonus")?.value).toBe(2);
  });
});

describe("skill abilities (E11)", () => {
  const base = { strength: 7, perception: 6, intelligence: 9, charisma: 8 };
  it("defaults to the first ability in the p20 list", () => {
    const s = sheet({}, base);
    expect(s.skills.breach.breakdown[0]?.value).toBe(1); // PER 6
    expect(s.skills.intimidation.breakdown[0]?.value).toBe(2); // STR 7
    expect(s.skills.medicine.breakdown[0]?.value).toBe(1); // PER 6
  });
  it("honours overrides", () => {
    const s = sheet({ skillAbility: { breach: "intelligence", intimidation: "charisma", medicine: "intelligence" } }, base);
    expect(s.skills.breach.breakdown[0]?.value).toBe(4);
    expect(s.skills.intimidation.breakdown[0]?.value).toBe(3);
    expect(s.skills.medicine.breakdown[0]?.value).toBe(4);
    expect(s.problems).toEqual([]);
  });
  it("rejects a disallowed ability", () => {
    const s = sheet({ skillAbility: { breach: "luck" } });
    expect(s.problems.join()).toContain("breach cannot use luck");
  });
});

describe("totals", () => {
  it("sums ability, background, allocations with a full breakdown", () => {
    const s = sheet(
      { background: { id: "custom-background", skills: ["guns", "sneak", "speech"] }, skillPointAllocations: { guns: 3 } },
      { agility: 7 },
    );
    expect(s.skills.guns.value).toBe(2 + 0 + 2 + 3);
    expect(s.skills.guns.breakdown.map((b) => b.source)).toEqual(["base", "base", "background", "skill points"]);
    expect(s.skills.unarmed.value).toBe(0);
  });
  it("skill.* modifier hits all 14 skills", () => {
    const plain = sheet();
    const s = sheet({ race: { id: "ghoul", variants: ["variant-ghoul"] } });
    for (const id of SKILLS) expect(s.skills[id].value).toBe(plain.skills[id].value + 2);
    expect(SKILLS).toHaveLength(14);
  });
});

describe("background problems", () => {
  const limited = [...rules.backgroundById.values()].find((b) => b.skills !== null)!;
  it("flags a skill outside the background's list", () => {
    const outside = SKILLS.find((s) => !limited.skills!.includes(s))!;
    const [a, b] = limited.skills!;
    const s = sheet({ background: { id: limited.id, skills: [a!, b!, outside] } });
    expect(s.problems.join()).toContain(`${outside} is not allowed`);
  });
  it("accepts the listed skills", () => {
    const [a, b, c] = limited.skills!;
    expect(sheet({ background: { id: limited.id, skills: [a!, b!, c!] } }).problems).toEqual([]);
  });
  it("custom background allows any 3", () => {
    const s = sheet({ background: { id: "custom-background", skills: ["unarmed", "science", "barter"] } });
    expect(s.problems).toEqual([]);
    expect(s.skills.science.breakdown.some((b) => b.source === "background")).toBe(true);
  });
});

describe("skill points", () => {
  it("reports spent vs available", () => {
    const s = sheet({ level: 5, skillPointAllocations: { guns: 4 } });
    expect(s.derived.skillPoints.value).toBe(4);
    expect(s.skillPointsSpent.value).toBe(4);
    expect(s.problems).toEqual([]);
  });
  it("flags over-allocation", () => {
    const s = sheet({ level: 1, skillPointAllocations: { guns: 1 } });
    expect(s.problems.join()).toContain("Spent 1 skill points but only 0");
  });
});
