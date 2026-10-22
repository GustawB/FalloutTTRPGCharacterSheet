# Roadmap and agent workflow

How the rest of this app gets built, mostly by `@claude` working from GitHub
issues. Read `CLAUDE.md` (architecture, schema, formulas) and `ERRATA.md`
(rulings) first. This file says *what* to build and *how to work*; it doesn't
repeat them.

## How to work

- **One issue → one branch → one PR.** The PR body says `Closes #<n>`. Don't
  bundle other issues' work. If you find something out of scope, open a new
  issue for it (or list it in the PR) instead of fixing it on the side.
- **Small PRs.** About 400 lines of hand-written code at most. Generated data
  and test fixtures don't count. If an issue turns out bigger, split it and
  say so in the PR.
- **Green before review.** Run these before you open the PR. CI runs them too.
  - `python3 -m unittest discover -s scripts`
  - `python3 scripts/validate_rules.py`
  - once the TS project exists: `npm run typecheck` and `npm test`
- **Rulings: decide, record, flag.** If a rule is unclear, don't stop and
  wait. Pick the most plausible reading, add an ERRATA.md entry marked
  `**Status:** Provisional (agent, #<issue>)`, and list it in the PR under
  "Rulings to confirm". The maintainer confirms or overrules in review.
- **Don't edit `.github/workflows/`.** The action's token can't push workflow
  changes. If one is needed, describe the change in the PR.
- **No PDF in CI.** Anything that needs the rulebook PDF (re-extraction,
  items) is marked *local only* below. Don't attempt it from an issue. For data
  fixes, follow the "no PDF" rule in CLAUDE.md: patch the override *and* the
  generated file, and fix `scripts/extract_rules.py` when the bug is in it.
- **Keep docs true.** If you change a schema, a stat id or a convention,
  update CLAUDE.md in the same PR.

### Issue format

Every issue created from this roadmap uses:

```
Title: [P<phase>.<n>] <imperative summary>

## Context      why, and links to CLAUDE.md / ERRATA.md sections
## Task         concrete steps
## Acceptance   checklist the PR must satisfy, including tests
## Depends on   #issues that must be merged first (or "none")
## Out of scope what not to touch
```

Labels: `data`, `engine`, `ui`, `infra`, `docs`, plus `phase-<n>`. Create any
that are missing. **Don't put `@claude` in issue bodies.** The maintainer
triggers each issue by commenting `@claude` once its dependencies are merged.
That comment doubles as the review gate.

## Phases

The bullets are a plan, not a contract. The planning step turns them into
issues and may split or merge them, as long as each one stays PR-sized.

### Phase 0: known data defects (one PR)

- `deadeye` and `duelist`: `requirementText` holds the repeat sentence. These
  perks have no requirements. Fix the extractor, then patch the data (no PDF,
  so both files).
- `here-and-now`: add `repeat: { text, max: 1, scope: "party" }`. The
  description says no other PC can take it once it's taken.
- `skilled`: the Wild Wasteland variant gets `requirements:
  [{ kind: "anyAbility", max: 1 }]`. The text says "one ability score equal to
  1", and scores can't go below 1.
- Educated says "Level Up table on page #". Add an Editorial ERRATA entry: it's
  p6.

### Phase 1: encode perk and trait effects (data)

One issue per batch: general (12), then strength, perception, endurance,
charisma, intelligence, agility and luck perks (18–19 each), race perks (33),
character traits (23), background and race traits (25).

The first batch (general) also adds an **"Encoding conventions"** section to
CLAUDE.md, and every later batch follows it. Minimum content:
- Computable, unconditional numbers become `modifier`s.
- Anything conditional, situational, reactive (Karma Cap flips, "when you hit
  …", "against insects") or about AP costs becomes a `note`, plus a
  `modifier` for the computable part if there is one.
- Per-rank scaling uses `{ ref: "rank" }`. Don't repeat the effect per rank.
- Choices made at pick time ("increase one skill by 5", "+3 points to any
  abilities") become a `note` for now and get listed in the PR. The engine
  will need a "choice" mechanism, which is its own issue.
- `needsReview: true` on anything where you were less than sure.
- Need a new id (damage type, condition, roll)? Add it to CLAUDE.md and the
  validator in the same PR.

Phase 1 doesn't depend on phases 2–5 and can run in parallel with them.

### Phase 2: TypeScript scaffold

- npm + Vite + React + TS strict + Vitest. Scripts: `dev`, `build`,
  `typecheck`, `test`. Add `package.json` scripts and README usage. CI for
  `npm` is a workflow change, so describe it in the PR (see above).
- `src/engine/rules.ts`: TS types for every schema in CLAUDE.md, plus a loader
  for `data/*.json`, with a test that loads all of it.
- Move the closed vocabularies (abilities, skills, derived stats, races,
  damage types, conditions, rolls) into `data/vocab.json`. The Python validator
  and the TS types both read from it, so they can't drift. Update CLAUDE.md.

### Phase 3: engine (pure, fully tested)

Roughly one issue each, in this order:
1. `Character` type (finalise the CLAUDE.md proposal) and the `Breakdown`
   type, the result shape `(character, rules) → sheet`.
2. Base formulas for every derived stat. Tests reproduce the p6 level-up
   table with ERRATA applied, for every level 1–30 and INT/END/AGI modifier
   combination the table covers.
3. Race stage: base features, subtype, variants with `replaces`, Handy tool
   choice.
4. Background (+2 to three skills) and skill totals (E7, E11, allocations).
5. Trait stage, including the Wild Wasteland replacement.
6. Perk stage: rank, `grantPerk` semantics, `repeat` limits, ability
   increases from perk points.
7. Clamps (stat clamps from effects, AP ≤ apMax, AC ≥ 10) and manual
   overrides, both visible in breakdowns.
8. Requirement checking (eligibility plus the reason when unmet) and the
   "choice" mechanism for pick-time choices from phase 1.
9. Perk proposals: eligible perks plus "1 SPECIAL point away", ranked
   deterministically (see CLAUDE.md UI requirements).
10. Party stats (partyNerve, groupSneak, party-scoped repeat limits).
11. Temporary modifiers, for example Nightkin's PER penalty, which is a `note`
    today.

### Phase 4: local save server

`server/`: list, GET and PUT `characters/<id>.json`, with schema-version
checks. `npm run dev` starts it alongside Vite.

### Phase 5: UI

Roughly one issue each:
1. App shell, character list, create, load, save.
2. Sheet view: abilities, skills, derived stats with breakdown-on-hover.
3. Race/background/trait selection.
4. Trait/perk picker combobox (eligible first, greyed with a reason, hide
   toggle) and perk/trait tooltips everywhere.
5. Perk proposals panel.
6. Trackers: current HP/SP/AP, rads, hunger/dehydration/exhaustion, karma
   caps, skill/perk points spent vs available.
7. Inventory and unlimited weapons.
8. Party view.

### Phase 6: items (local only)

Extract weapons and armor from p51+ into `data/items.json`. Armor feeds `ac`
and `dt`. Needs the PDF, so the maintainer runs it in a local session.

## Known open items

- `claude.yml` permissions must be `write` for this workflow to work. That's a
  maintainer task.
- Branch protection on `main` should require the `validate` check.
