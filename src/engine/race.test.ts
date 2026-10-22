import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import type { Character } from "./character";
import { loadBundledRules } from "./data";
import { evalExpr } from "./effects";
import { computeSheet } from "./sheet";
import type { RaceId } from "./vocab";

const rules = loadBundledRules();

const make = (race: Partial<Character["race"]> & { id: RaceId }, patch: Partial<Character> = {}) => ({
  ...newCharacter("t"),
  ...patch,
  race: { variants: [], ...race },
});
const sheet = (race: Parameters<typeof make>[0], patch?: Partial<Character>) =>
  computeSheet(make(race, patch), rules);

describe("evalExpr", () => {
  const ctx = { level: 9, abilities: { ...newCharacter("t").abilities, intelligence: 8 }, rank: 2 };
  it("evaluates refs and ops", () => {
    expect(evalExpr({ ref: "level" }, ctx)).toBe(9);
    expect(evalExpr({ ref: "mod.intelligence" }, ctx)).toBe(3);
    expect(evalExpr({ ref: "ability.intelligence" }, ctx)).toBe(8);
    expect(evalExpr({ ref: "skillPointGrants" }, ctx)).toBe(2);
    expect(evalExpr({ op: "floor", args: [{ op: "div", args: [{ ref: "rank" }, 4] }] }, ctx)).toBe(0);
    expect(evalExpr({ op: "max", args: [1, { op: "sub", args: [10, 3] }] }, ctx)).toBe(7);
  });
  it("rejects rank outside perks", () => {
    expect(() => evalExpr({ ref: "rank" }, { ...ctx, rank: undefined })).toThrow();
  });
});

describe("races", () => {
  it("human: no features, no problems", () => {
    const s = sheet({ id: "human" });
    expect(s.problems).toEqual([]);
    expect(s.immunities).toEqual([]);
    expect(s.derived.radiationDc?.value).toBe(12);
  });

  it("ghoul: radiation immunity and poison resistance", () => {
    const s = sheet({ id: "ghoul" });
    expect(s.problems).toEqual([]);
    expect(s.immunities.map((d) => d.to).sort()).toEqual(["damage.radiation", "radiationLevels"]);
    expect(s.resistances.map((d) => d.to)).toEqual(["damage.poison"]);
    expect(s.immunities[0]?.source).toContain("Ghoul");
  });

  it("synth: immunities from the inorganic body", () => {
    const s = sheet({ id: "synth" });
    expect(s.problems).toEqual([]);
    expect(s.immunities.map((d) => d.to)).toContain("damage.poison");
  });

  it("robot: protectron adds DT with a breakdown", () => {
    const s = sheet({ id: "robot", subtype: "protectron", tools: ["taser"] });
    expect(s.problems).toEqual([]);
    expect(s.derived.dt.value).toBe(1);
    expect(s.derived.dt.breakdown.at(-1)).toMatchObject({ value: 1 });
    expect(s.derived.dt.breakdown.at(-1)?.source).toContain("Protectron");
    expect(s.immunities.map((d) => d.to)).toContain("condition.bleeding");
  });

  it("super mutant: STR bonus feeds derived stats", () => {
    const s = sheet({ id: "superMutant" });
    expect(s.problems).toEqual([]);
    expect(s.abilities.strength.value).toBe(6);
    expect(s.abilities.strength.breakdown).toHaveLength(2);
    // STR 6 × 10, plus 40 from Bulky.
    expect(s.derived.carryLoad.value).toBe(100);
    expect(s.derived.carryLoad.breakdown).toHaveLength(2);
  });
});

describe("variants", () => {
  it("applies variant effects with the variant as source", () => {
    const s = sheet({ id: "human", variants: ["variant-human"] });
    expect(s.derived.karmaCaps.value).toBe(2);
    expect(s.derived.karmaCaps.breakdown.at(-1)?.source).toContain("Human");
    expect(s.rollModes.map((r) => r.roll).sort()).toEqual(["addiction", "radiation"]);
  });

  it("applies skill.* to every skill", () => {
    const s = sheet({ id: "ghoul", variants: ["variant-ghoul"] });
    expect(s.skills.sneak.value).toBe(2);
    expect(s.skills.barter.breakdown).toHaveLength(1);
    expect(s.derived.perkPoints.value).toBe(2);
  });

  it("evaluates skillPointGrants expressions", () => {
    const s = sheet({ id: "synth", variants: ["variant-gen-2-synth"] }, { level: 9 });
    expect(s.derived.skillPoints.value).toBe(8 + 2);
    expect(s.vulnerabilities.map((d) => d.to)).toEqual(["damage.electricity"]);
  });

  it("replaces removes the base feature's effects", () => {
    const nk = sheet({ id: "superMutant", variants: ["nightkin"] });
    expect(nk.problems).toEqual([]);
    expect(nk.abilities.strength.breakdown.some((c) => c.source.includes("Superior Strength"))).toBe(false);
    expect(nk.abilities.strength.breakdown.some((c) => c.source.includes("Nightkin"))).toBe(true);
  });

  it("overlapping replaces is a problem", () => {
    const s = sheet({ id: "superMutant", variants: ["nightkin", "defective-strain"] });
    expect(s.problems.some((p) => p.includes("mutually exclusive"))).toBe(true);
  });

  it("unknown variant is a problem", () => {
    expect(sheet({ id: "human", variants: ["nope"] }).problems).toHaveLength(1);
  });
});

describe("robot subtypes and tools", () => {
  it("robot without a subtype is a problem", () => {
    expect(sheet({ id: "robot" }).problems).toEqual(["Robot requires a subtype"]);
  });

  it("handy with 3 tools, duplicates included, is OK", () => {
    const s = sheet({ id: "robot", subtype: "handy", tools: ["gripper", "gripper", "drill"] });
    expect(s.problems).toEqual([]);
  });

  it("handy with 2 tools is a problem", () => {
    const s = sheet({ id: "robot", subtype: "handy", tools: ["gripper", "drill"] });
    expect(s.problems).toEqual(["Handy needs 3 tool(s), got 2"]);
  });

  it("unknown tool and unknown subtype are problems", () => {
    expect(sheet({ id: "robot", subtype: "handy", tools: ["gripper", "gripper", "x"] }).problems).toHaveLength(1);
    expect(sheet({ id: "robot", subtype: "nope" }).problems).toHaveLength(1);
  });

  it("subtype on a race without subtypes is a problem", () => {
    expect(sheet({ id: "human", subtype: "handy" }).problems).toHaveLength(1);
  });
});

describe("race effects reach derived stats", () => {
  it("defective strain raises END, so hp and the ability breakdown follow", () => {
    const plain = sheet({ id: "superMutant" });
    const s = sheet({ id: "superMutant", variants: ["defective-strain"] });
    expect(s.abilities.endurance.value).toBe(plain.abilities.endurance.value + 2);
    expect(s.derived.hp.value).toBe(plain.derived.hp.value + 2);
    expect(s.abilities.intelligence.breakdown.at(-1)).toMatchObject({ value: -2 });
    expect(s.abilities.intelligence.breakdown.at(-1)?.source).toContain("Defective Strain");
  });

  it("every stat value equals the sum of its breakdown", () => {
    const s = sheet({ id: "superMutant", variants: ["defective-strain"] });
    for (const r of [...Object.values(s.abilities), ...Object.values(s.derived)]) {
      if (r) expect(r.value).toBe(r.breakdown.reduce((a, c) => a + c.value, 0));
    }
  });

  it("notes carry the feature as source", () => {
    const s = sheet({ id: "superMutant" });
    expect(s.notes.some((n) => n.source.includes("Super Mutant") && n.text.includes("power armor"))).toBe(true);
  });
});

describe("tool choice edge cases", () => {
  it("protectron with no tool is a problem", () => {
    expect(sheet({ id: "robot", subtype: "protectron" }).problems).toEqual(["Protectron needs 1 tool(s), got 0"]);
  });
  it("robobrain has no tool choice", () => {
    expect(sheet({ id: "robot", subtype: "robobrain" }).problems).toEqual([]);
    expect(sheet({ id: "robot", subtype: "robobrain", tools: ["taser"] }).problems).toHaveLength(1);
  });
  it("handy with 4 tools is a problem", () => {
    const tools = ["gripper", "gripper", "drill", "torch"];
    expect(sheet({ id: "robot", subtype: "handy", tools }).problems).toEqual(["Handy needs 3 tool(s), got 4"]);
  });
});
