import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import type { Character } from "./character";
import { loadBundledRules } from "./data";
import { computePartySheet } from "./party";
import { computeSheet } from "./sheet";

const rules = loadBundledRules();

const pc = (id: string, over: Partial<Omit<Character, "abilities">> & { abilities?: Partial<Character["abilities"]> } = {}): Character => {
  const c = newCharacter(id);
  return { ...c, ...over, abilities: { ...c.abilities, ...over.abilities } };
};

describe("computePartySheet", () => {
  it("floors Party Nerve toward −∞ with negative modifiers (E9)", () => {
    // CHA 4 → −1, CHA 5 → 0: sum −1, floor(−1 / 2) = −1.
    const r = computePartySheet([pc("a", { abilities: { charisma: 4 } }), pc("b", { abilities: { charisma: 5 } })], rules);
    expect(r.party.partyNerve!.value).toBe(-1);
    expect(r.party.partyNerve!.breakdown.reduce((s, c) => s + c.value, 0)).toBe(-1);
    // CHA 7 and 6 → +2 +1 = 3 → 1.
    const p = computePartySheet([pc("a", { abilities: { charisma: 7 } }), pc("b", { abilities: { charisma: 6 } })], rules);
    expect(p.party.partyNerve!.value).toBe(1);
  });

  it("floors Group Sneak toward −∞ with negative values (E10)", () => {
    const cs = [pc("a", { abilities: { agility: 1, luck: 1 } }), pc("b", { abilities: { agility: 6, luck: 1 } })];
    const sneaks = cs.map((c) => computeSheet(c, rules).skills.sneak.value);
    const sum = sneaks[0]! + sneaks[1]!;
    expect(sum % 2).not.toBe(0);
    expect(sum).toBeLessThan(0);
    const r = computePartySheet(cs, rules);
    expect(r.party.groupSneak!.value).toBe(Math.floor(sum / 2));
    expect(r.party.groupSneak!.value).toBeLessThan(sum / 2);
    expect(r.party.groupSneak!.breakdown.reduce((s, c) => s + c.value, 0)).toBe(r.party.groupSneak!.value);
    expect(r.sheets[0]!.party.groupSneak).toEqual(r.party.groupSneak);
  });

  it("adds Party Nerve to every member's death save, and not without a party", () => {
    const cs = [pc("a", { abilities: { charisma: 9 } }), pc("b", { abilities: { charisma: 9 } })];
    const solo = computeSheet(cs[0]!, rules);
    expect(solo.derived.deathSave.breakdown.some((c) => c.label === "Party Nerve")).toBe(false);
    const r = computePartySheet(cs, rules);
    expect(r.party.partyNerve!.value).toBe(4);
    for (const s of r.sheets) {
      expect(s.derived.deathSave.value).toBe(solo.derived.deathSave.value + 4);
      expect(s.derived.deathSave.breakdown).toContainEqual({ source: "party", label: "Party Nerve", value: 4 });
    }
  });

  it("flags here-and-now taken by two PCs on the later pick", () => {
    const hn = { id: "here-and-now", level: 3 };
    const a = pc("a", { level: 3, perks: [hn] });
    const b = pc("b", { level: 3, perks: [hn] });
    const r = computePartySheet([a, b], rules);
    expect(r.sheets[0]!.problems.filter((p) => p.includes("another party member"))).toEqual([]);
    expect(r.sheets[1]!.problems.some((p) => p.includes("Here and Now") && p.includes("another party member"))).toBe(true);
    expect(r.sheets[1]!.perkRanks["here-and-now"]).toBeUndefined();
    // Alone, there's no problem.
    expect(computeSheet(b, rules).problems).toEqual([]);
  });

  it("leaves party stats null on a single computeSheet and for an empty party", () => {
    expect(computeSheet(pc("a"), rules).party).toEqual({ partyNerve: null, groupSneak: null });
    expect(computePartySheet([], rules)).toEqual({ sheets: [], party: { partyNerve: null, groupSneak: null } });
  });
});
