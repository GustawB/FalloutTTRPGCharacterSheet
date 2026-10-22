import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import type { Character } from "./character";
import { loadBundledRules } from "./data";
import { checkRequirements, sheetWithout } from "./requirements";
import type { Perk, Requirement, Rules, Trait } from "./rules";
import { computeSheet } from "./sheet";

const real = loadBundledRules();
const base = (over: Partial<Character> = {}): Character => ({ ...newCharacter("t"), ...over });
const check = (requirements: Requirement[], c = base(), rules = real) =>
  checkRequirements({ requirements }, c, computeSheet(c, rules));

describe("checkRequirements", () => {
  it("is eligible with no requirements", () => {
    expect(check([])).toEqual({ eligible: true, unmet: [] });
  });

  it("ability min and max", () => {
    const c = base({ abilities: { ...base().abilities, strength: 6, luck: 8 } });
    expect(check([{ kind: "ability", ability: "strength", min: 6 }], c).eligible).toBe(true);
    const low = check([{ kind: "ability", ability: "strength", min: 7 }], c);
    expect(low.eligible).toBe(false);
    expect(low.unmet[0]?.reason).toBe("strength 7+");
    expect(check([{ kind: "ability", ability: "luck", max: 8 }], c).eligible).toBe(true);
    expect(check([{ kind: "ability", ability: "luck", max: 7 }], c).unmet[0]?.reason).toBe("luck 7 or less");
  });

  it("anyAbility", () => {
    expect(check([{ kind: "anyAbility", max: 3 }]).unmet[0]?.reason).toBe("an ability score of 3 or less");
    const c = base({ abilities: { ...base().abilities, agility: 3 } });
    expect(check([{ kind: "anyAbility", max: 3 }], c).eligible).toBe(true);
  });

  it("race and level", () => {
    expect(check([{ kind: "race", anyOf: ["human"] }]).eligible).toBe(true);
    expect(check([{ kind: "race", anyOf: ["ghoul", "robot"] }]).unmet[0]?.reason).toBe("race ghoul or robot");
    expect(check([{ kind: "level", min: 3 }]).unmet[0]?.reason).toBe("level 3+");
    expect(check([{ kind: "level", min: 3 }], base({ level: 3 })).eligible).toBe(true);
  });

  it("shows a condition but assumes it met", () => {
    expect(check([{ kind: "condition", text: "GM approval" }])).toEqual({ eligible: true, unmet: [] });
  });

  it("reports every unmet requirement", () => {
    const r = check([{ kind: "level", min: 5 }, { kind: "race", anyOf: ["ghoul"] }]);
    expect(r.unmet.map((u) => u.reason)).toEqual(["level 5+", "race ghoul"]);
  });

  it("counts effects of countsAsRace for race requirements", () => {
    const granter: Trait = {
      id: "granter", name: "Granter", kind: "trait", category: "character", requirements: [],
      description: "", source: { page: 1 },
      effects: [{ type: "countsAsRace", race: "ghoul", for: "perkRequirements" }],
    };
    const rules: Rules = { ...real, traitById: new Map([...real.traitById, ["granter", granter]]) };
    const need: Requirement[] = [{ kind: "race", anyOf: ["ghoul"] }];
    expect(check(need, base(), rules).eligible).toBe(false);
    const c = base({ traits: [{ id: "granter", wildWasteland: false }] });
    expect(check(need, c, rules).eligible).toBe(true);
  });

  it("sheetWithout drops the candidate's own effects", () => {
    const perk: Perk = {
      id: "boost", name: "Boost", kind: "perk", category: "general", requirements: [],
      description: "", source: { page: 1 },
      effects: [{ type: "modifier", stat: "ability.strength", value: 3 }],
    };
    const rules: Rules = { ...real, perkById: new Map([...real.perkById, ["boost", perk]]) };
    const c = base({ perks: [{ id: "boost", level: 1 }] });
    expect(computeSheet(c, rules).abilities.strength.value).toBe(8);
    expect(sheetWithout(c, rules, { kind: "perk", id: "boost" }).abilities.strength.value).toBe(5);
  });
});

describe("pick-time choices", () => {
  const choosy: Perk = {
    id: "choosy", name: "Choosy", kind: "perk", category: "general", requirements: [],
    description: "", source: { page: 1 },
    effects: [{ type: "modifier", choice: { id: "pair", of: "skill", count: 2 }, value: 5 }],
  };
  const abilityPick: Perk = {
    ...choosy, id: "abilitypick", name: "Ability Pick",
    effects: [{ type: "modifier", choice: { id: "a", of: "ability" }, value: 1 }],
  };
  const rules: Rules = {
    ...real,
    perkById: new Map([...real.perkById, ["choosy", choosy], ["abilitypick", abilityPick]]),
  };
  const withPerk = (id: string, choices: Character["choices"] = {}) =>
    base({ perks: [{ id, level: 1 }], choices });

  it("applies nothing, and reports a problem, until the choice is stored", () => {
    const s = computeSheet(withPerk("choosy"), rules);
    expect(s.skills.sneak.breakdown.some((b) => b.source === "Perk: Choosy")).toBe(false);
    expect(s.problems).toEqual(['Perk: Choosy: choice "pair" needs 2 skill pick(s), has 0']);
  });

  it("applies to each pick and shows the choice in the breakdown", () => {
    const none = computeSheet(withPerk("choosy"), rules);
    const s = computeSheet(withPerk("choosy", { "choosy:pair": ["sneak", "speech"] }), rules);
    expect(s.problems).toEqual([]);
    expect(s.skills.sneak.value).toBe(none.skills.sneak.value + 5);
    expect(s.skills.sneak.breakdown).toContainEqual({
      source: "Perk: Choosy", label: "Choosy (choice: sneak)", value: 5,
    });
    expect(s.skills.speech.value).toBe(none.skills.speech.value + 5);
    expect(s.skills.guns.value).toBe(none.skills.guns.value);
  });

  it("rejects duplicate, unknown and surplus picks", () => {
    const dup = computeSheet(withPerk("choosy", { "choosy:pair": ["sneak", "sneak"] }), rules);
    expect(dup.problems).toHaveLength(1);
    const bad = computeSheet(withPerk("choosy", { "choosy:pair": ["strength", "sneak"] }), rules);
    expect(bad.problems).toHaveLength(1);
    const extra = computeSheet(withPerk("choosy", { "choosy:pair": ["sneak", "speech", "guns"] }), rules);
    expect(extra.problems).toEqual([]);
    expect(extra.skills.guns.breakdown.some((b) => b.source === "Perk: Choosy")).toBe(false);
  });

  it("ability choices raise the score", () => {
    const s = computeSheet(withPerk("abilitypick", { "abilitypick:a": ["luck"] }), rules);
    expect(s.abilities.luck.value).toBe(6);
  });

  it("works for traits, Wild Wasteland variants included", () => {
    const c = (ww: boolean, choices: Character["choices"]) =>
      base({
        abilities: { ...base().abilities, strength: 1 },
        traits: [{ id: "skilled", wildWasteland: ww }],
        choices,
      });
    const plain = computeSheet(base(), real).skills.guns.value;
    const sk = computeSheet(c(false, { "skilled:skills": ["guns"] }), real);
    expect(sk.skills.guns.value).toBe(plain + 2);
    expect(sk.skills.guns.breakdown).toContainEqual({
      source: "Trait: Skilled", label: "Skilled (choice: guns)", value: 2,
    });
    expect(computeSheet(c(true, { "skilled:skills": ["guns"] }), real).skills.guns.value).toBe(plain + 5);
    expect(computeSheet(c(false, {}), real).problems.some((p) => p.includes("choice"))).toBe(true);
  });
});

describe("ability-point choices", () => {
  const abilities = (c: Character) => computeSheet(c, real).abilities;
  const base0 = abilities(base());

  it("adaptive-reflexes distributes points as +1 each, up to 5 per rank", () => {
    const pick = (picks: string[]) =>
      base({ perks: [{ id: "adaptive-reflexes", level: 1 }], choices: { "adaptive-reflexes:points": picks } });
    const s = computeSheet(pick(["strength", "strength", "luck"]), real);
    expect(s.problems).toEqual([]);
    expect(s.abilities.strength.value).toBe(base0.strength.value + 2);
    expect(s.abilities.luck.value).toBe(base0.luck.value + 1);
    expect(s.abilities.strength.breakdown).toContainEqual({
      source: "Perk: Adaptive Reflexes", label: "Adaptive Reflexes (choice: strength)", value: 1,
    });
    expect(computeSheet(pick(["strength", "bogus"]), real).problems).toHaveLength(1);
    const over = computeSheet(pick(Array(6).fill("luck")), real);
    expect(over.problems).toHaveLength(1);
    expect(over.abilities.luck.value).toBe(base0.luck.value + 5);
  });

  it("partition-reset moves points with a bonus", () => {
    const c = (picks: string[]) =>
      base({ race: { id: "robot", subtype: "mister-handy", variants: [] }, level: 10,
             perks: [{ id: "partition-reset", level: 10 }], choices: { "partition-reset:swap": picks } });
    const ok = computeSheet(c(["strength", "luck", "2"]), real);
    expect(ok.problems.filter((p) => p.includes("Partition"))).toEqual([]);
    expect(ok.abilities.strength.value).toBe(base0.strength.value - 2);
    expect(ok.abilities.luck.value).toBe(base0.luck.value + 3);
    for (const bad of [[], ["strength", "strength", "1"], ["strength", "luck", "4"], ["strength", "luck"]]) {
      const s = computeSheet(c(bad), real);
      expect(s.problems.filter((p) => p.includes("Partition"))).toHaveLength(1);
      expect(s.abilities.luck.value).toBe(base0.luck.value);
    }
  });
});
