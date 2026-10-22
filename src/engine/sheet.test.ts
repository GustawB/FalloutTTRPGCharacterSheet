import { describe, expect, it } from "vitest";
import { CHARACTER_SCHEMA_VERSION, newCharacter } from "./character";
import { loadBundledRules } from "./data";
import { computeSheet } from "./sheet";
import { ABILITIES, RACES, SKILLS } from "./vocab";

const rules = loadBundledRules();

describe("newCharacter", () => {
  it("is valid and has schemaVersion 1", () => {
    const c = newCharacter("c1", "Test");
    expect(c.schemaVersion).toBe(1);
    expect(CHARACTER_SCHEMA_VERSION).toBe(1);
    expect(RACES).toContain(c.race.id);
    expect(rules.raceById.has(c.race.id)).toBe(true);
    expect(rules.backgroundById.has(c.background.id)).toBe(true);
    expect(new Set(c.background.skills).size).toBe(3);
    for (const s of c.background.skills) expect(SKILLS).toContain(s);
    for (const a of ABILITIES) expect(c.abilities[a]).toBeGreaterThanOrEqual(1);
    expect(c.level).toBe(1);
  });

  it("returns independent objects", () => {
    expect(newCharacter("a").abilities).not.toBe(newCharacter("a").abilities);
  });
});

describe("computeSheet", () => {
  it("is deterministic and does not mutate its input", () => {
    const c = newCharacter("c1");
    const before = structuredClone(c);
    const first = computeSheet(c, rules);
    const second = computeSheet(c, rules);
    expect(second).toEqual(first);
    expect(c).toEqual(before);
  });

  it("returns every stat with a breakdown and unknown party stats as null", () => {
    const s = computeSheet(newCharacter("c1"), rules);
    expect(Object.keys(s.abilities)).toEqual([...ABILITIES]);
    expect(Object.keys(s.skills)).toEqual([...SKILLS]);
    expect(s.derived.hp.breakdown).toEqual([]);
    expect(s.party).toEqual({ partyNerve: null, groupSneak: null });
    expect(s.problems).toEqual([]);
  });
});
