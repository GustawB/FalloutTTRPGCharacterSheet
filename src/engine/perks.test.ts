import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import type { Character } from "./character";
import { loadBundledRules } from "./data";
import type { Perk, Rules } from "./rules";
import { computeSheet } from "./sheet";

const real = loadBundledRules();
const perk = (id: string, patch: Partial<Perk>): Perk => ({
  id, name: id, kind: "perk", category: "general", requirements: [],
  description: "", source: { page: 1 }, effects: [], ...patch,
});
const fixtures = [
  perk("flat", {
    repeat: { text: "", max: 3 },
    effects: [{ type: "modifier", stat: "carryLoad", value: 5 }],
  }),
  perk("ranked", {
    repeat: { text: "", max: 3 },
    effects: [{ type: "modifier", stat: "carryLoad", value: { op: "mul", args: [{ ref: "rank" }, 4] } }],
  }),
  perk("once", { effects: [{ type: "modifier", stat: "healingRate", value: 1 }] }),
  perk("giver", { effects: [{ type: "grantPerk", perkId: "once" }] }),
  perk("needy", { requirements: [{ kind: "level", min: 20 }], effects: [{ type: "grantPerk", perkId: "flat" }] }),
];
const rules: Rules = {
  ...real,
  perkById: new Map([...real.perkById, ...fixtures.map((p) => [p.id, p] as const)]),
};
const make = (patch: Partial<Character>): Character => ({ ...newCharacter("t"), ...patch });
const sheet = (patch: Partial<Character>) => computeSheet(make(patch), rules);
const picks = (id: string, n: number, level = 1) => Array.from({ length: n }, () => ({ id, level }));

describe("ability increases", () => {
  it("raise the score, cap at 10 and update HP/SP/skills retroactively", () => {
    const base = newCharacter("t");
    const hi = { ...base.abilities, endurance: 9, agility: 9 };
    const s0 = sheet({ abilities: hi, level: 5 });
    const s = sheet({
      abilities: hi, level: 5,
      abilityIncreases: [
        { ability: "endurance", level: 2 }, { ability: "endurance", level: 3 },
        { ability: "agility", level: 4 },
      ],
    });
    expect(s.abilities.endurance.value).toBe(10);
    expect(s.derived.hp.value).toBe(s0.derived.hp.value + 3); // k+1 = 3, one effective point
    expect(s.derived.sp.value).toBe(s0.derived.sp.value + 3);
    expect(s.skills.guns.value).toBe(s0.skills.guns.value + 1);
    expect(s.perkPointsSpent.value).toBe(3);
  });
});

describe("ranks", () => {
  it("rank 2 doubles a plain modifier", () => {
    const one = sheet({ perks: picks("flat", 1) }).derived.carryLoad.value;
    const two = sheet({ perks: picks("flat", 2) }).derived.carryLoad.value;
    expect(two - one).toBe(5);
    expect(sheet({ perks: picks("flat", 2) }).derived.carryLoad.breakdown.at(-1)).toMatchObject({ value: 10 });
  });

  it("does not scale a {ref: rank} expression twice", () => {
    const base = sheet({}).derived.carryLoad.value;
    expect(sheet({ perks: picks("ranked", 2) }).derived.carryLoad.value).toBe(base + 8);
  });
});

describe("grantPerk", () => {
  it("gives rank 1 without a pick, and costs no perk point", () => {
    const s = sheet({ perks: picks("giver", 1) });
    const b = s.derived.healingRate.breakdown;
    expect(b).toContainEqual({ source: "Perk: once", label: "once", value: 1 });
    expect(s.perkPointsSpent.value).toBe(1);
    expect(s.problems).toEqual([]);
  });

  it("applies even when the granted perk's requirements are unmet", () => {
    const s = sheet({ perks: picks("needy", 1) });
    expect(s.derived.carryLoad.breakdown.at(-1)).toMatchObject({ value: 5 });
  });

  it("cannot be picked again without repeat", () => {
    const s = sheet({ level: 4, perks: [...picks("giver", 1), ...picks("once", 1)] });
    expect(s.problems).toEqual(["Perk once is already owned (from Perk: giver)"]);
    expect(s.derived.healingRate.breakdown.filter((b) => b.source === "Perk: once")).toHaveLength(1);
  });

  it("a manual pick adds a rank on top for a repeatable perk", () => {
    const s = sheet({ level: 4, perks: [...picks("needy", 1), ...picks("flat", 1)] });
    expect(s.derived.carryLoad.breakdown.at(-1)).toMatchObject({ value: 10 });
    expect(s.problems).toEqual([]);
  });
});

describe("problems", () => {
  it("exceeding repeat.max", () => {
    const s = sheet({ perks: picks("flat", 4), level: 10 });
    expect(s.problems).toEqual(["Perk flat is taken 4 times, but the maximum is 3"]);
    expect(s.derived.carryLoad.breakdown.at(-1)).toMatchObject({ value: 15 });
  });

  it("spending more perk points than available", () => {
    const s = sheet({ perks: picks("once", 1), abilityIncreases: [{ ability: "luck", level: 1 }] });
    expect(s.derived.perkPoints.value).toBe(1);
    expect(s.perkPointsSpent.value).toBe(2);
    expect(s.problems).toEqual(["Spent 2 perk points but only 1 are available"]);
  });

  it("unknown perk", () => {
    expect(sheet({ perks: picks("nope", 1) }).problems).toContain("Unknown perk: nope");
  });
});
