# CLAUDE.md

Guidance for AI agents (and humans) working in this repo. Read `ERRATA.md`
before you touch any rules logic. It overrides the rulebook text.

## What this is

A local, persistent character-sheet app for the Arcane Arcade **"Fallout TTRPG
v2.0"** homebrew system (a d20/D&D-like fan game, **not** Modiphius' 2d20
Fallout). It replaces the paper sheet: it auto-calculates derived stats,
applies perk and trait effects, and proposes perks.

## Stack and layout

TypeScript (strict) + React + Vite, run locally with `npm run dev`. A tiny
local Node server (no Tauri) persists characters as JSON files on disk.
`localStorage` is never the source of truth.

```
data/                 rules as data (extracted from the PDF, committed)
  backgrounds.json    21 entries
  traits.json         48 entries
  perks.json          173 entries
  overrides/<file>.json   hand curation, merged over extraction by id
scripts/extract_rules.py  PDF → data/*.json (needs poppler `pdftotext`)
src/engine/           pure TS: no React, no I/O, no Date.now(); fully unit-tested
src/ui/               React components
server/               local Node server: GET/PUT characters/<id>.json
characters/           saved characters (gitignored)
```

Tests use Vitest (`npm test`). Engine tests are mandatory for any rules
change. At minimum, check the derived HP/SP/perk/skill-point totals against
the p6 level-up table, with the corrections from ERRATA.md applied.

## Ground rules for agents

- **Never edit `data/{backgrounds,traits,perks}.json` by hand.** They are
  generated. Curation goes in `data/overrides/<file>.json`, then re-run
  `python3 scripts/extract_rules.py <rulebook.pdf>`. If you don't have the
  PDF (CI doesn't), edit the override *and* apply the identical patch to the
  generated file, and say so in the PR.
- The engine must stay deterministic and pure: `(character, rules) → sheet`.
  No LLM calls anywhere in the app.
- Every derived number carries a **breakdown**: a list of
  `{ source, label, value }` contributions that the UI shows on hover. A number
  without a breakdown is a bug.
- An unclear rule gets a new ERRATA.md entry marked **Open**, and you ask in
  the PR or issue. Don't silently pick an interpretation.
- One issue, one PR. Keep PRs small.

## Engine pipeline

Contributions are applied in this order, and every stage appends to the
breakdowns:

1. **base** – formulas below, from abilities and level
2. **race**
3. **background** – +2 to the three chosen skills
4. **traits** – the Wild Wasteland variant's effects *replace* the base
   trait's effects when toggled
5. **perks** – effects × rank for repeatable perks, unless an effect says
   otherwise
6. **manual overrides** – user-entered `{ stat, value, note }`, always shown
   as such

Clamps (AP ≤ `apMax`, AC ≥ 10) are applied last, and the clamp itself shows up
in the breakdown.

## Base formulas (after errata)

`mod(x) = x − 5`. `L` = level. `k = floor((L − 1) / 2)`.

| Stat id | Formula | Source |
|---|---|---|
| `hp` (max) | `10 + 5k + modEND·(k+1)` | p5, E3, E6 |
| `sp` (max) | `10 + 5k + modAGI·(k+1)` | p5, E6 |
| `ap` | `min(apMax, 10 + modAGI)` | p4, p24, E12 |
| `apMax` | `15` | p24 |
| `ac` | `max(10, 10 + armor + effects)` | p4 step 17 |
| `dt` | `0 + armor + effects` | p4 step 18 |
| `healingRate` | `floor((L + END) / 2)` | p22, E8 |
| `carryLoad` | `STR × 10` | p21 |
| `passiveSense` | `12 + modPER` | p22 |
| `combatSequence` | `modPER` | p127, E13 |
| `radiationDc` | `12 − modEND`, **humans only** (absent for other races) | p23 |
| `karmaCaps` | `1 + (LCK = 10 ? 1 : 0)` | p24–25 |
| `deathSave` | `max(modLCK, modEND) + partyNerve` (player picks LCK or END; default is the higher) | p22 |
| `skill.<id>` | `mod(skillAbility) + luckSkillBonus + background(2) + allocatedSkillPoints + effects` | p4, p21, E7, E11 |
| `skillPoints` | `Σ grants at L ∈ {5,9,…,29}`, 3/4/5 by modINT | p5, E2, E4 |
| `perkPoints` | `L − |{5,9,13,17,19} ∩ [1,L]|` | p5, E5 |
| `partyNerve` (party) | `floor(Σ modCHA / 2)` | p23, E9 |
| `groupSneak` (party) | `floor(mean skill.sneak)` | p24, E10 |

`luckSkillBonus = modLCK < 0 ? −1 : floor(modLCK / 2)` (E7).

Party stats need every PC in the party. The app has a "party" view that loads
all saved characters, and a single sheet shows party stats only when its party
is known. Otherwise it shows them as "—".

Spending a perk point on an ability increase raises the ability score by 1
(max 10), and everything derived from it updates retroactively.

### Stat ids

Abilities: `strength perception endurance charisma intelligence agility luck`
(the effect target `ability.<id>` adds to the *score*).

Skills (`skill.<id>`): `barter breach crafting energyWeapons explosives guns
intimidation medicine meleeWeapons science sneak speech survival unarmed`.

Skill → default ability (p20, E11): barter CHA, breach PER (or INT), crafting
INT, energyWeapons PER, explosives PER, guns AGI, intimidation STR (or CHA),
medicine PER (or INT), meleeWeapons STR, science INT, sneak AGI, speech CHA,
survival END, unarmed STR.

Derived: `hp sp ap apMax ac dt healingRate carryLoad passiveSense
combatSequence radiationDc karmaCaps deathSave skillPoints perkPoints
partyNerve groupSneak`.

Race ids: `human ghoul synth robot superMutant` (Gen-2 synth maps to
`synth`).

New stat ids must be added here first.

## Data schema

Shared shapes (TS notation):

```ts
type Source = { page: number };

type Requirement =
  | { kind: "ability"; ability: AbilityId; min?: number; max?: number }
  | { kind: "anyAbility"; max: number }          // some ability score ≤ max
  | { kind: "race"; anyOf: RaceId[] }
  | { kind: "level"; min: number }
  | { kind: "condition"; text: string };         // not machine-checkable; shown, assumed met

type Repeat = {
  text: string;
  max?: number | null;   // absent = 1 pick; null = unbounded/narrative
  scope?: "party";       // limit applies to the whole party, not one PC
};

type Expr =
  | number
  | { ref: "level" | `ability.${AbilityId}` | `mod.${AbilityId}` | "rank" }
  | { op: "add" | "sub" | "mul" | "div" | "min" | "max"; args: Expr[] }
  | { op: "floor"; args: [Expr] };

type Effect =
  | { type: "modifier"; stat: StatId; value: Expr }
  | { type: "rollMode"; roll: StatId | "attack" | "abilityCheck" | string;
      mode: "advantage" | "disadvantage" }
  | { type: "immunity"; to: string }             // e.g. "radiation", "condition.bleeding"
  | { type: "note"; text: string };              // situational: shown on the sheet, never computed
```

Entries:

```ts
type Perk = {
  id: string; name: string; kind: "perk";
  category: "general" | AbilityId | "race";
  requirements: Requirement[];    // all must hold (AND)
  requirementText?: string;       // original text, shown in tooltips
  repeat?: Repeat;
  description: string; source: Source;
  effects: Effect[];
  needsReview?: true;             // hand-encoded effect a human should double-check
};

type Trait = Omit<Perk, "kind" | "category" | "repeat"> & {
  kind: "trait";
  category: "race" | "background" | "character";
  wildWasteland?: { description: string; effects: Effect[]; requirements?: Requirement[] }[];
};

type Background = {
  id: string; name: string;
  skills: SkillId[] | null;       // pick 3 of these for +2 (null = custom: any 3)
  traitId: string | null;         // background-exclusive trait
  description: string; source: Source;
  startingEquipment: { races: RaceId[]; label: string; items: string }[];
};
```

Override files are `{ "<id>": { ...fields to replace } }`. A `wildWasteland`
array is patched element-wise by index, and every other key replaces the
field wholesale.

Effects are **all empty** right now. Encoding them is tracked as a separate
task. Anything an effect can't express exactly becomes a `note`, plus a
`modifier` for the part that is computable.

## Character file (proposed; finalised by the first engine PR)

```ts
type Character = {
  id: string; name: string; schemaVersion: 1;
  race: RaceId; level: number; xp: number;
  abilities: Record<AbilityId, number>;       // after creation-point allocation (pre-perk)
  background: { id: string; skills: [SkillId, SkillId, SkillId] };
  traits: { id: string; wildWasteland: boolean }[];   // 0–2
  perks: { id: string; level: number }[];             // one row per pick; repeats = multiple rows
  abilityIncreases: { ability: AbilityId; level: number }[];  // perk points spent on +1
  skillPointAllocations: Partial<Record<SkillId, number>>;
  skillAbility: Partial<Record<"breach" | "intimidation" | "medicine", AbilityId>>;
  manualOverrides: { stat: StatId; value: number; note: string }[];
  current: { hp: number; sp: number; ap: number; rads: number;
             hunger: number; dehydration: number; exhaustion: number;
             karmaCapsFlipped: number };
  inventory: { name: string; qty: number; notes?: string }[];
  partyId?: string;
};
```

## UI requirements

- **Trait/perk picker:** a searchable combobox. Eligible entries come first.
  Ineligible ones are greyed out with the unmet requirement as the reason,
  and a toggle hides them.
- **Tooltips:** anywhere a perk or trait name appears, show the full
  description, requirements, repeat rule and page on hover.
- **Breakdown on hover** for every derived number.
- **Perk proposals:** eligible perks plus perks that are "1 SPECIAL point
  away", ranked by fit with the character's highest abilities and invested
  skills. Deterministic.
- Track current vs max HP/SP/AP, skill and perk points (spent vs available),
  karma caps, inventory and an unlimited number of weapons. The paper sheet
  lacks all of these.

## Reference

- Rulebook PDF (not in repo, copyright Arcane Arcade): page map: creation p4,
  level-up p5–6, races p7–13, backgrounds p14–19, abilities/skills p20–25,
  traits p25–31, perks p32–50, items p51+.
- The PDF is two-column. Crop each column (`pdftotext -x 0|306 -W 306 -H 792`)
  instead of using `-layout`. See `scripts/extract_rules.py`.
- Licensing: code is MIT; data text belongs to Arcane Arcade (see `NOTICE`).
