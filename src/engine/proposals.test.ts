import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import type { Character } from "./character";
import { loadBundledRules } from "./data";
import { proposePerks } from "./proposals";
import { loadRules } from "./rules";
import type { Perk } from "./rules";

const real = loadBundledRules();
const perk = (id: string, patch: Partial<Perk> = {}): Perk => ({
  id, name: id, kind: "perk", category: "general", requirements: [],
  description: "", source: { page: 1 }, effects: [], ...patch,
});
const str = (min: number) => [{ kind: "ability" as const, ability: "strength" as const, min }];
const rulesWith = (perks: Perk[]) => loadRules({ ...real, perks });
const make = (patch: Partial<Character> = {}): Character => ({
  ...newCharacter("t"),
  abilities: { ...newCharacter("t").abilities, strength: 5 },
  ...patch,
});
const ids = (c: Character, perks: Perk[]) => proposePerks(c, rulesWith(perks)).map((p) => p.perkId);

describe("proposePerks", () => {
  it("returns a perk short by exactly 1 as near, but not one short by 2", () => {
    const perks = [perk("one", { requirements: str(6) }), perk("two", { requirements: str(7) })];
    const r = proposePerks(make(), rulesWith(perks));
    expect(r.map((p) => p.perkId)).toEqual(["one"]);
    expect(r[0]).toMatchObject({ eligible: false, missing: [{ ability: "strength", have: 5, need: 6 }] });
  });

  it("does not treat two shortfalls of 1 as near", () => {
    const both = perk("both", {
      requirements: [...str(6), { kind: "ability", ability: "luck", min: 6 }],
    });
    const c = make({ abilities: { ...make().abilities, luck: 5 } });
    expect(ids(c, [both])).toEqual([]);
  });

  it("excludes maxed, owned and granted perks but keeps repeatable ones with ranks left", () => {
    const perks = [
      perk("once"),
      perk("giver", { effects: [{ type: "grantPerk", perkId: "granted" }] }),
      perk("granted"),
      perk("twice", { repeat: { text: "", max: 2 } }),
      perk("free"),
    ];
    const c = make({ perks: [{ id: "once", level: 1 }, { id: "giver", level: 1 }, { id: "twice", level: 1 }] });
    expect(ids(c, perks)).toEqual(["free", "twice"]);
    const maxed = make({ perks: [{ id: "twice", level: 1 }, { id: "twice", level: 1 }] });
    expect(ids(maxed, [perks[3]!])).toEqual([]);
  });

  it("ranks higher-fit perks first, eligible before near", () => {
    const perks = [
      perk("a-plain"),
      perk("b-skill", { effects: [{ type: "modifier", stat: "skill.guns", value: 1 }] }),
      perk("c-str", { category: "strength", requirements: str(5) }),
      perk("d-near", { category: "strength", requirements: str(6) }),
    ];
    const c = make({ skillPointAllocations: { guns: 4 } });
    const r = proposePerks(c, rulesWith(perks));
    expect(r.map((p) => p.perkId)).toEqual(["c-str", "b-skill", "a-plain", "d-near"]);
    expect(r[0]!.score).toBe(10);
    expect(r[1]!.score).toBe(4);
    expect(r[0]!.reasons.length).toBe(2);
  });

  it("is stable across calls, input order and ties", () => {
    const perks = ["z", "m", "a", "q"].map((id) => perk(id));
    const first = proposePerks(make(), rulesWith(perks));
    expect(first.map((p) => p.perkId)).toEqual(["a", "m", "q", "z"]);
    expect(proposePerks(make(), rulesWith(perks))).toEqual(first);
    expect(proposePerks(make(), rulesWith([...perks].reverse()))).toEqual(first);
  });

  it("does not depend on the key order of the character's maps", () => {
    const perks = [
      perk("a", { category: "strength", requirements: str(5) }),
      perk("b", { effects: [{ type: "modifier", stat: "skill.guns", value: 1 }] }),
      perk("c", { effects: [{ type: "modifier", stat: "skill.sneak", value: 1 }] }),
    ];
    const c = make({ skillPointAllocations: { guns: 3, sneak: 3 } });
    const abilities = Object.fromEntries(Object.entries(c.abilities).reverse()) as Character["abilities"];
    const alloc = { sneak: 3, guns: 3 };
    const d = { ...c, abilities, skillPointAllocations: alloc };
    expect(proposePerks(d, rulesWith(perks))).toEqual(proposePerks(c, rulesWith(perks)));
  });

  it("works on the bundled rules", () => {
    const r = proposePerks(make(), real);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => p.eligible || p.missing?.length === 1)).toBe(true);
  });
});
