import type { Effect, Expr } from "./rules";
import type { Contribution, Defense, RollModeResult, SheetNote } from "./sheet";
import type { AbilityId, RaceId } from "./vocab";
import { mod } from "./math";
import { skillPointGrants } from "./base";
import { ABILITIES, SKILLS } from "./vocab";

/** What an `Expr` can refer to. `rank` is only set for perks. */
export type ExprContext = {
  level: number;
  /** Ability scores the effects see (before any effect adds to them). */
  abilities: Record<AbilityId, number>;
  rank?: number;
  /** Stored picks of the perk or trait whose effects are applied, by choice id. */
  picks?: Record<string, string[]>;
};

/** Everything effects have produced so far. */
export type EffectAccumulator = {
  /** Contributions per target stat id (`hp`, `ability.strength`, `skill.sneak`, ...). */
  modifiers: Map<string, Contribution[]>;
  rollModes: RollModeResult[];
  resistances: Defense[];
  immunities: Defense[];
  vulnerabilities: Defense[];
  notes: SheetNote[];
  countsAsRace: { race: RaceId; source: string }[];
  /** `clamp` effects, applied last by the clamp stage. */
  clamps: { stat: string; min?: number; max?: number; source: string }[];
  /** Free perks granted by `grantPerk` effects, with where each came from. */
  grants: { perkId: string; source: string }[];
};

export const newAccumulator = (): EffectAccumulator => ({
  modifiers: new Map(),
  rollModes: [],
  resistances: [],
  immunities: [],
  vulnerabilities: [],
  notes: [],
  countsAsRace: [],
  clamps: [],
  grants: [],
});

/** Evaluates an expression. Throws on a ref that has no value (e.g. `rank` outside perks). */
export function evalExpr(expr: Expr, ctx: ExprContext): number {
  if (typeof expr === "number") return expr;
  if ("ref" in expr) {
    const { ref } = expr;
    if (ref === "level") return ctx.level;
    if (ref === "skillPointGrants") return skillPointGrants(ctx.level);
    if (ref === "rank") {
      if (ctx.rank === undefined) throw new Error("ref rank is only valid on perks");
      return ctx.rank;
    }
    if (ref.startsWith("ability.")) return ctx.abilities[ref.slice(8) as AbilityId];
    return mod(ctx.abilities[ref.slice(4) as AbilityId]);
  }
  const args = expr.args.map((a) => evalExpr(a, ctx));
  const [first = 0, ...rest] = args;
  switch (expr.op) {
    case "add": return args.reduce((a, b) => a + b, 0);
    case "sub": return rest.reduce((a, b) => a - b, first);
    case "mul": return args.reduce((a, b) => a * b, 1);
    case "div": return rest.reduce((a, b) => a / b, first);
    case "min": return Math.min(...args);
    case "max": return Math.max(...args);
    case "floor": return Math.floor(first);
  }
}

const addModifier = (acc: EffectAccumulator, stat: string, c: Contribution) => {
  const list = acc.modifiers.get(stat) ?? [];
  list.push(c);
  acc.modifiers.set(stat, list);
};

/**
 * Applies effects to the accumulator. `source` is shown in breakdowns and notes.
 * `clamp` is recorded in `acc.clamps` for the clamp stage. `grantPerk`
 * is recorded in `acc.grants` for the perk stage. Modifier values are
 * multiplied by `scale` (a perk's rank).
 * Problems (a bad expression) are reported, never thrown.
 */
export function applyEffects(
  effects: Effect[],
  source: string,
  label: string,
  ctx: ExprContext,
  acc: EffectAccumulator,
  problems: string[],
  scale = 1,
): void {
  for (const e of effects) {
    switch (e.type) {
      case "modifier": {
        let value: number;
        try {
          value = evalExpr(e.value, ctx);
        } catch (err) {
          problems.push(`${source}: ${(err as Error).message}`);
          break;
        }
        if ("choice" in e) {
          const { id, of, count = 1 } = e.choice;
          const valid: readonly string[] = of === "skill" ? SKILLS : ABILITIES;
          const picks = [...new Set(ctx.picks?.[id] ?? [])].filter((p) => valid.includes(p)).slice(0, count);
          if (picks.length < count) problems.push(`${source}: choice "${id}" needs ${count} ${of} pick(s), has ${picks.length}`);
          for (const p of picks) {
            addModifier(acc, `${of}.${p}`, { source, label: `${label} (choice: ${p})`, value: value * scale });
          }
          break;
        }
        const targets = e.stat === "skill.*" ? SKILLS.map((s) => `skill.${s}`) : [e.stat];
        for (const stat of targets) addModifier(acc, stat, { source, label, value: value * scale });
        break;
      }
      case "abilityPoints": {
        let points: number;
        try {
          points = evalExpr(e.points, ctx);
        } catch (err) {
          problems.push(`${source}: ${(err as Error).message}`);
          break;
        }
        const all = ctx.picks?.[e.choice] ?? [];
        const picks = all.filter((p) => (ABILITIES as readonly string[]).includes(p));
        if (picks.length < all.length) problems.push(`${source}: choice "${e.choice}" has ${all.length - picks.length} pick(s) that are not abilities`);
        if (picks.length > points) problems.push(`${source}: choice "${e.choice}" spends ${picks.length} point(s), only ${points} available`);
        for (const p of picks.slice(0, Math.max(0, points))) {
          addModifier(acc, `ability.${p}`, { source, label: `${label} (choice: ${p})`, value: 1 });
        }
        break;
      }
      case "abilityTransfer": {
        const [from, to, amountText] = ctx.picks?.[e.choice] ?? [];
        const amount = Number(amountText);
        const valid = (a: string | undefined): a is string => a !== undefined && (ABILITIES as readonly string[]).includes(a);
        if (!valid(from) || !valid(to) || from === to || !Number.isInteger(amount) || amount < 1 || amount > e.max) {
          problems.push(`${source}: choice "${e.choice}" needs two different abilities and an amount from 1 to ${e.max}`);
          break;
        }
        addModifier(acc, `ability.${from}`, { source, label: `${label} (choice: ${from})`, value: -amount * scale });
        addModifier(acc, `ability.${to}`, { source, label: `${label} (choice: ${to})`, value: (amount + e.bonus) * scale });
        break;
      }
      case "rollMode":
        acc.rollModes.push({ roll: e.roll, mode: e.mode, source });
        break;
      case "resistance":
        acc.resistances.push({ to: e.to, source });
        break;
      case "immunity":
        acc.immunities.push({ to: e.to, source });
        break;
      case "vulnerability":
        acc.vulnerabilities.push({ to: e.to, source });
        break;
      case "countsAsRace":
        acc.countsAsRace.push({ race: e.race, source });
        break;
      case "note":
        acc.notes.push({ source, text: e.text });
        break;
      case "grantPerk":
        acc.grants.push({ perkId: e.perkId, source });
        break;
      case "clamp":
        acc.clamps.push({ stat: e.stat, min: e.min, max: e.max, source });
        break;
    }
  }
}
