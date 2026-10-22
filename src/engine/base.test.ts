import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import type { Character } from "./character";
import { loadBundledRules } from "./data";
import { computeSheet } from "./sheet";
import type { RaceId } from "./vocab";

const rules = loadBundledRules();

/**
 * p6 level-up table, with E2/E3 applied. Per level: the constant part of
 * HP/SP and the multiplier of the END/AGI modifier ("30 + END mod × 5"), and
 * the cumulative skill points for INT modifier −1 / 0 / +1.
 */
const TABLE: [level: number, base: number, mult: number, sp: [number, number, number]][] = [
  [1, 10, 1, [0, 0, 0]], [2, 10, 1, [0, 0, 0]], [3, 15, 2, [0, 0, 0]], [4, 15, 2, [0, 0, 0]],
  [5, 20, 3, [3, 4, 5]], [6, 20, 3, [3, 4, 5]], [7, 25, 4, [3, 4, 5]], [8, 25, 4, [3, 4, 5]],
  [9, 30, 5, [6, 8, 10]], [10, 30, 5, [6, 8, 10]], [11, 35, 6, [6, 8, 10]], [12, 35, 6, [6, 8, 10]],
  [13, 40, 7, [9, 12, 15]], [14, 40, 7, [9, 12, 15]], [15, 45, 8, [9, 12, 15]], [16, 45, 8, [9, 12, 15]],
  [17, 50, 9, [12, 16, 20]], [18, 50, 9, [12, 16, 20]], [19, 55, 10, [12, 16, 20]], [20, 55, 10, [12, 16, 20]],
  [21, 60, 11, [15, 20, 25]], [22, 60, 11, [15, 20, 25]], [23, 65, 12, [15, 20, 25]], [24, 65, 12, [15, 20, 25]],
  [25, 70, 13, [18, 24, 30]], [26, 70, 13, [18, 24, 30]], [27, 75, 14, [18, 24, 30]], [28, 75, 14, [18, 24, 30]],
  [29, 80, 15, [21, 28, 35]], [30, 80, 15, [21, 28, 35]],
];

type Patch = Omit<Partial<Character>, "abilities"> & { abilities?: Partial<Character["abilities"]> };
const make = (patch: Patch = {}) => {
  const c = newCharacter("t");
  return { ...c, ...patch, abilities: { ...c.abilities, ...patch.abilities } } as Character;
};
const sheet = (patch?: Patch) => computeSheet(make(patch), rules);

describe("level-up table (p6 + errata)", () => {
  for (const [level, base, mult, sp] of TABLE) {
    it(`level ${level}`, () => {
      for (const m of [-1, 0, 1]) {
        const s = sheet({ level, abilities: { endurance: 5 + m, agility: 5 + m, intelligence: 5 + m } });
        expect(s.derived.hp.value).toBe(base + m * mult);
        expect(s.derived.sp.value).toBe(base + m * mult);
        expect(s.derived.skillPoints.value).toBe(sp[m + 1]);
      }
    });
  }

  it("covers the whole modifier range via the closed form", () => {
    for (const [level, base, mult] of TABLE) {
      for (let end = 1; end <= 10; end++) {
        expect(sheet({ level, abilities: { endurance: end } }).derived.hp.value).toBe(base + (end - 5) * mult);
      }
    }
  });
});

describe("perk points (E5)", () => {
  const pp = (level: number) => sheet({ level }).derived.perkPoints.value;
  it("skips the skill-point levels, not 19", () => {
    expect(pp(1)).toBe(1);
    expect(pp(4)).toBe(4);
    expect(pp(5)).toBe(4);
    expect(pp(18)).toBe(14);
    expect(pp(19)).toBe(15);
    expect(pp(20)).toBe(16);
    expect(pp(30)).toBe(23);
  });
});

describe("other base stats", () => {
  it("rounds healing rate down (E8)", () => {
    expect(sheet({ level: 1, abilities: { endurance: 5 } }).derived.healingRate.value).toBe(3);
    expect(sheet({ level: 2, abilities: { endurance: 5 } }).derived.healingRate.value).toBe(3);
    expect(sheet({ level: 4, abilities: { endurance: 5 } }).derived.healingRate.value).toBe(4);
  });

  it("computes carry load, passive sense and combat sequence", () => {
    const s = sheet({ abilities: { strength: 7, perception: 3 } });
    expect(s.derived.carryLoad.value).toBe(70);
    expect(s.derived.passiveSense.value).toBe(10);
    expect(s.derived.combatSequence.value).toBe(-2);
  });

  it("gives a second karma cap at Luck 10", () => {
    expect(sheet({ abilities: { luck: 9 } }).derived.karmaCaps.value).toBe(1);
    expect(sheet({ abilities: { luck: 10 } }).derived.karmaCaps.value).toBe(2);
  });

  it("uses the higher of LCK and END for death saves by default, or the chosen one", () => {
    const abilities = { luck: 8, endurance: 4 };
    expect(sheet({ abilities }).derived.deathSave.value).toBe(3);
    expect(sheet({ abilities, deathSaveAbility: "endurance" }).derived.deathSave.value).toBe(-1);
    expect(sheet({ abilities: { luck: 2, endurance: 6 } }).derived.deathSave.value).toBe(1);
  });

  it("caps AP at apMax", () => {
    const s = sheet({ abilities: { agility: 10 } });
    expect(s.derived.apMax.value).toBe(15);
    expect(s.derived.ap.value).toBe(15);
    expect(sheet({ abilities: { agility: 3 } }).derived.ap.value).toBe(8);
  });

  it("has a radiation DC only for races with hasRadiationDc", () => {
    for (const [id, race] of rules.raceById) {
      const s = sheet({ race: { id: id as RaceId, variants: [] }, abilities: { endurance: 7 } });
      if (race.hasRadiationDc) expect(s.derived.radiationDc?.value).toBe(10);
      else expect(s.derived.radiationDc).toBeNull();
    }
    expect(rules.raceById.get("human")?.hasRadiationDc).toBe(true);
  });

  it("applies perk-point ability increases up to the current level", () => {
    const c = make({
      level: 4,
      abilityIncreases: [{ ability: "strength", level: 2 }, { ability: "strength", level: 6 }],
    });
    const s = computeSheet(c, rules);
    expect(s.abilities.strength.value).toBe(6);
    expect(s.derived.carryLoad.value).toBe(60);
  });
});

describe("ability increases", () => {
  it("never raise a score past 10", () => {
    const c = make({
      abilities: { strength: 9 },
      abilityIncreases: [1, 2, 3].map((level) => ({ ability: "strength" as const, level })),
      level: 5,
    });
    expect(computeSheet(c, rules).abilities.strength.value).toBe(10);
  });
});

describe("breakdowns", () => {
  it("every derived value is non-empty and sums to its value", () => {
    for (const level of [1, 2, 3, 20, 30]) {
      const s = sheet({ level, abilities: { luck: 10, agility: 10 } });
      const stats = [
        ...Object.values(s.abilities),
        ...Object.values(s.derived).filter((x) => x !== null),
      ];
      for (const stat of stats) {
        expect(stat.breakdown.length).toBeGreaterThan(0);
        expect(stat.breakdown.reduce((a, c) => a + c.value, 0)).toBe(stat.value);
        for (const c of stat.breakdown) {
          expect(c.source).not.toBe("");
          expect(c.label).not.toBe("");
        }
      }
    }
  });
});
