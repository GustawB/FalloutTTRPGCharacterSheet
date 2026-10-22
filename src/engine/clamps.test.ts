import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import type { Character } from "./character";
import { loadBundledRules } from "./data";
import type { Effect, Perk, Rules } from "./rules";
import { computeSheet } from "./sheet";

const real = loadBundledRules();
const perk = (id: string, effects: Effect[]): Perk => ({
  id, name: id, kind: "perk", category: "general", requirements: [],
  description: "", source: { page: 1 }, effects,
});
const fixtures = [
  perk("strFloor", [{ type: "clamp", stat: "ability.strength", min: 6 }]),
  perk("apUp", [{ type: "modifier", stat: "apMax", value: 2 }, { type: "modifier", stat: "ap", value: 10 }]),
  perk("apBig", [{ type: "modifier", stat: "ap", value: 10 }]),
  perk("acDown", [{ type: "modifier", stat: "ac", value: -3 }]),
  perk("acFree", [{ type: "modifier", stat: "ac", value: -3 }, { type: "clamp", stat: "ac", min: 0 }]),
];
const rules: Rules = {
  ...real,
  perkById: new Map([...real.perkById, ...fixtures.map((p) => [p.id, p] as const)]),
};
const sheet = (patch: Partial<Character>) => computeSheet({ ...newCharacter("t"), ...patch }, rules);
const withPerks = (...ids: string[]) => ({ perks: ids.map((id) => ({ id, level: 1 })) });
const withStr = (strength: number) => ({ abilities: { ...newCharacter("t").abilities, strength } });

describe("clamp effects", () => {
  it("raises STR to 6 and shows the clamp; derived stats read the clamped score", () => {
    const s = sheet({ ...withStr(3), ...withPerks("strFloor") });
    expect(s.abilities.strength.value).toBe(6);
    expect(s.abilities.strength.breakdown.at(-1)).toMatchObject({ source: "clamp", value: 3 });
    expect(s.derived.carryLoad.value).toBe(60);
  });
  it("does nothing when the score is already inside the bound", () => {
    const s = sheet({ ...withStr(8), ...withPerks("strFloor") });
    expect(s.abilities.strength.breakdown).toHaveLength(1);
  });
});

describe("AP and AC", () => {
  it("caps AP at 15 with the clamp in the breakdown", () => {
    const s = sheet({ ...withPerks("apBig") });
    expect(s.derived.ap.value).toBe(15);
    expect(s.derived.ap.breakdown.at(-1)).toMatchObject({ source: "clamp" });
  });
  it("lets an apMax modifier raise the cap", () => {
    const s = sheet({ ...withPerks("apUp") });
    expect(s.derived.apMax.value).toBe(17);
    expect(s.derived.ap.value).toBe(17);
  });
  it("floors AC at 10 and shows the clamp", () => {
    const s = sheet({ ...withPerks("acDown") });
    expect(s.derived.ac.value).toBe(10);
    expect(s.derived.ac.breakdown.at(-1)).toMatchObject({ source: "clamp", value: 3 });
  });
  it("lets a clamp effect replace the AC floor", () => {
    expect(sheet({ ...withPerks("acFree") }).derived.ac.value).toBe(7);
  });
});

describe("manual overrides", () => {
  it("appear with their note, and are clamped after", () => {
    const s = sheet({ manualOverrides: [{ stat: "ac", value: 4, note: "cover" }, { stat: "skill.sneak", value: 2, note: "boots" }] });
    expect(s.derived.ac.value).toBe(14);
    expect(s.derived.ac.breakdown.at(-1)).toEqual({ source: "manual override", label: "Manual: cover", value: 4 });
    expect(s.skills.sneak.breakdown.at(-1)).toMatchObject({ source: "manual override", value: 2 });
    const neg = sheet({ manualOverrides: [{ stat: "ac", value: -5, note: "x" }] });
    expect(neg.derived.ac.value).toBe(10);
  });
  it("reports an override on a stat the character lacks", () => {
    const s = sheet({ race: { id: "robot", variants: [], subtype: "" }, manualOverrides: [{ stat: "radiationDc", value: 1, note: "" }] });
    expect(s.problems.join()).toContain("radiationDc");
  });
});

describe("override validation", () => {
  it("reports an unknown skill id", () => {
    const s = sheet({ manualOverrides: [{ stat: "skill.bogus" as never, value: 1, note: "" }] });
    expect(s.problems.join()).toContain("skill.bogus");
  });
});

describe("ability range", () => {
  it.each([0, 11])("score %i is a problem and the value is unchanged", (n) => {
    const s = sheet(withStr(n));
    expect(s.abilities.strength.value).toBe(n);
    expect(s.problems.some((p) => p.includes("strength"))).toBe(true);
  });
});

describe("temporary modifiers", () => {
  const temp = (active: boolean, stat: "ac" | "ability.strength" | "skill.guns" = "ability.strength", value = -2) =>
    ({ temporaryModifiers: [{ stat, value, label: "Stealth field", active }] });
  it("changes the stat and shows up as temporary when active", () => {
    const s = sheet(temp(true));
    expect(s.abilities.strength.value).toBe(3);
    expect(s.abilities.strength.breakdown.at(-1)).toMatchObject({ source: "temporary", value: -2 });
    expect(s.derived.carryLoad.value).toBe(30);
  });
  it("does nothing when inactive", () => {
    const s = sheet(temp(false));
    expect(s.abilities.strength.value).toBe(5);
    expect(s.abilities.strength.breakdown.some((c) => c.source === "temporary")).toBe(false);
  });
  it("is subject to clamps", () => {
    const s = sheet({ ...temp(true), ...withPerks("strFloor"), ...withStr(6) });
    expect(s.abilities.strength.value).toBe(6);
    expect(s.abilities.strength.breakdown.at(-1)).toMatchObject({ source: "clamp", value: 2 });
    expect(sheet(temp(true, "ac", -5)).derived.ac.value).toBe(10);
  });
  it("flags an active modifier on a stat the character lacks", () => {
    expect(sheet(temp(true, "ability.strength")).problems).toEqual([]);
    expect(sheet({ race: { id: "ghoul", variants: [] }, temporaryModifiers: [{ stat: "radiationDc", value: 1, label: "x", active: true }] }).problems)
      .toHaveLength(1);
  });
});
