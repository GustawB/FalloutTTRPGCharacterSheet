import { describe, expect, it } from "vitest";
import vocabJson from "../../data/vocab.json";
import { loadBundledRules } from "./data";
import { loadRules, type Effect, type Expr, type Feature, type Requirement } from "./rules";
import {
  ABILITIES, CONDITIONS, DAMAGE_TYPES, DERIVED, RACES, ROLLS, SKILLS,
} from "./vocab";

const rules = loadBundledRules();

describe("vocab.ts", () => {
  it("matches data/vocab.json", () => {
    expect([...ABILITIES]).toEqual(vocabJson.abilities);
    expect([...SKILLS]).toEqual(vocabJson.skills);
    expect([...DERIVED]).toEqual(vocabJson.derived);
    expect([...RACES]).toEqual(vocabJson.races);
    expect([...DAMAGE_TYPES]).toEqual(vocabJson.damageTypes);
    expect([...CONDITIONS]).toEqual(vocabJson.conditions);
    expect([...ROLLS]).toEqual(vocabJson.rolls);
  });
});

const abilities = new Set<string>(ABILITIES);
const stats = new Set<string>([
  ...DERIVED,
  ...ABILITIES.map((a) => `ability.${a}`),
  ...SKILLS.map((s) => `skill.${s}`),
]);
const rolls = new Set<string>([...stats, ...ROLLS, ...ABILITIES.map((a) => `check.${a}`)]);
const targets = new Set<string>([
  ...DAMAGE_TYPES.map((d) => `damage.${d}`),
  ...CONDITIONS.map((c) => `condition.${c}`),
  "radiationLevels",
]);
const refs = new Set<string>([
  "level", "rank", "skillPointGrants",
  ...ABILITIES.flatMap((a) => [`ability.${a}`, `mod.${a}`]),
]);

function checkExpr(e: Expr, where: string): void {
  if (typeof e === "number") return;
  if ("ref" in e) {
    expect(refs.has(e.ref), `${where}: ref ${e.ref}`).toBe(true);
  } else {
    for (const a of e.args) checkExpr(a, where);
  }
}

function checkEffect(e: Effect, where: string): void {
  switch (e.type) {
    case "modifier":
      expect(e.stat === "skill.*" || stats.has(e.stat), `${where}: stat ${e.stat}`).toBe(true);
      checkExpr(e.value, where);
      break;
    case "clamp":
      expect(stats.has(e.stat), `${where}: stat ${e.stat}`).toBe(true);
      break;
    case "rollMode":
      expect(rolls.has(e.roll), `${where}: roll ${e.roll}`).toBe(true);
      break;
    case "immunity":
    case "resistance":
    case "vulnerability":
      expect(targets.has(e.to), `${where}: to ${e.to}`).toBe(true);
      break;
    case "grantPerk":
      expect(rules.perkById.has(e.perkId), `${where}: perk ${e.perkId}`).toBe(true);
      break;
    case "countsAsRace":
      expect(RACES).toContain(e.race);
      break;
    case "note":
      break;
  }
}

function checkRequirement(r: Requirement, where: string): void {
  if (r.kind === "ability") expect(abilities.has(r.ability), `${where}: ${r.ability}`).toBe(true);
  if (r.kind === "race") for (const id of r.anyOf) expect(RACES, where).toContain(id);
}

function checkFeatures(features: Feature[], where: string): void {
  for (const f of features) for (const e of f.effects) checkEffect(e, `${where}/${f.id}`);
}

describe("loadRules", () => {
  it("loads every data file with the expected counts", () => {
    expect(rules.backgrounds).toHaveLength(21);
    expect(rules.traits).toHaveLength(48);
    expect(rules.perks).toHaveLength(173);
    expect(rules.races).toHaveLength(5);
    expect(rules.perkById.size).toBe(173);
    expect(rules.raceById.get("human")?.name).toBe("Human");
    expect([...rules.raceById.keys()].sort()).toEqual([...RACES].sort());
  });

  it("rejects duplicate ids", () => {
    const perk = rules.perks[0]!;
    expect(() => loadRules({ ...rules, perks: [perk, perk] })).toThrow(/duplicate id/);
  });

  it("uses only vocab ids in effects", () => {
    for (const p of rules.perks) for (const e of p.effects) checkEffect(e, p.id);
    for (const t of rules.traits) {
      for (const e of t.effects) checkEffect(e, t.id);
      for (const w of t.wildWasteland ?? []) for (const e of w.effects) checkEffect(e, `${t.id}/ww`);
    }
    for (const r of rules.races) {
      checkFeatures(r.features, r.id);
      for (const v of r.variants) checkFeatures(v.features, `${r.id}/${v.id}`);
      for (const s of r.subtypes ?? []) checkFeatures(s.features, `${r.id}/${s.id}`);
    }
  });

  it("uses valid categories and requirement ids", () => {
    const perkCategories = new Set<string>(["general", "race", ...ABILITIES]);
    for (const p of rules.perks) {
      expect(perkCategories.has(p.category), `${p.id}: category ${p.category}`).toBe(true);
      for (const r of p.requirements) checkRequirement(r, p.id);
    }
    for (const t of rules.traits) {
      expect(["race", "background", "character"]).toContain(t.category);
      for (const r of t.requirements) checkRequirement(r, t.id);
      for (const w of t.wildWasteland ?? []) for (const r of w.requirements ?? []) checkRequirement(r, t.id);
    }
    for (const b of rules.backgrounds) for (const s of b.skills ?? []) expect(SKILLS).toContain(s);
  });
});
