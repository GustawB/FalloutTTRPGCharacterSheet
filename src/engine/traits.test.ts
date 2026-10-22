import { describe, expect, it } from "vitest";
import { newCharacter } from "./character";
import type { Character } from "./character";
import { loadBundledRules } from "./data";
import type { Rules, Trait } from "./rules";
import { computeSheet } from "./sheet";

const real = loadBundledRules();

const fixture: Trait = {
  id: "fixture", name: "Fixture", kind: "trait", category: "character",
  requirements: [], description: "", source: { page: 1 },
  effects: [{ type: "modifier", stat: "healingRate", value: 2 }],
  wildWasteland: [
    { description: "", effects: [{ type: "modifier", stat: "healingRate", value: 5 }] },
    {
      description: "", requirements: [{ kind: "level", min: 3 }],
      effects: [{ type: "modifier", stat: "carryLoad", value: 7 }],
    },
  ],
};
const rules: Rules = {
  ...real,
  traitById: new Map([...real.traitById, ["fixture", fixture], ["fixture2", { ...fixture, id: "fixture2" }]]),
};
const withTraits = (traits: Character["traits"]): Character => ({ ...newCharacter("t"), traits });
const healing = (c: Character) => computeSheet(c, rules).derived.healingRate;

describe("traits", () => {
  it("applies base effects with the trait as source", () => {
    const hr = healing(withTraits([{ id: "fixture", wildWasteland: false }]));
    expect(hr.breakdown).toContainEqual({ source: "Trait: Fixture", label: "Fixture", value: 2 });
  });

  it("Wild Wasteland replaces, not adds to, the base effects", () => {
    const base = healing(withTraits([])).value;
    const hr = healing(withTraits([{ id: "fixture", wildWasteland: true }]));
    expect(hr.value).toBe(base + 5);
    expect(hr.breakdown.map((b) => b.value)).not.toContain(2);
  });

  it("picks the variant by index and uses its requirements", () => {
    const s = computeSheet(withTraits([{ id: "fixture", wildWasteland: true, variant: 1 }]), rules);
    expect(s.derived.carryLoad.breakdown.at(-1)).toMatchObject({ value: 7 });
    expect(s.problems).toEqual(["Trait Fixture requires level 3+"]);
  });

  it("reports a missing variant", () => {
    const s = computeSheet(withTraits([{ id: "fixture", wildWasteland: true, variant: 4 }]), rules);
    expect(s.problems).toEqual(["Trait Fixture has no Wild Wasteland variant 4"]);
  });

  it("reports more than 2 traits", () => {
    const s = computeSheet(
      withTraits([
        { id: "fixture", wildWasteland: false },
        { id: "fixture2", wildWasteland: false },
        { id: "bruiser", wildWasteland: false },
      ]),
      rules,
    );
    expect(s.problems.some((p) => p.includes("3 traits"))).toBe(true);
  });

  it("reports unknown and duplicate traits", () => {
    const s = computeSheet(
      withTraits([{ id: "nope", wildWasteland: false }, { id: "fixture", wildWasteland: false }, { id: "fixture", wildWasteland: false }]),
      rules,
    );
    expect(s.problems).toContain("Unknown trait: nope");
    expect(s.problems).toContain("Trait Fixture is chosen more than once");
  });

  it("reports unmet race requirements", () => {
    const s = computeSheet(withTraits([{ id: "cheaper-parts", wildWasteland: false }]), real);
    expect(s.problems.some((p) => p.includes("Cheaper Parts requires race robot"))).toBe(true);
  });

  it("real data: an encoded trait shows up in breakdowns", () => {
    const s = computeSheet(withTraits([{ id: "fast-metabolism", wildWasteland: false }]), real);
    expect(s.problems).toEqual([]);
    expect(s.derived.healingRate.breakdown.at(-1)).toMatchObject({ source: "Trait: Fast Metabolism", value: 2 });
    expect(s.derived.radiationDc?.breakdown.at(-1)).toMatchObject({ source: "Trait: Fast Metabolism", value: 3 });
    const ww = computeSheet(withTraits([{ id: "fast-metabolism", wildWasteland: true }]), real);
    expect(ww.derived.radiationDc?.value).toBe(12);
    expect(ww.derived.healingRate.breakdown.at(-1)).toMatchObject({ value: 1 });
  });
});
