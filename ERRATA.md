# Errata and rulings

The rulebook (Arcane Arcade "Fallout TTRPG v2.0") contradicts itself in places.
This file is the single source of truth for how the app resolves each case.
**The engine implements these rulings, not the raw text.** If code and this file
disagree, the code is wrong. New ambiguities go here first. An agent may
make a ruling marked `**Status:** Provisional (agent, #<issue>)` and flag it
in its PR, and the maintainer confirms or overrules it in review. Entries
without a status are confirmed.

Page numbers are printed page numbers, which equal PDF page indices.

## Core rules

### E1. Ability modifier is `score − 5`
- **Text (p4 step 3, p21):** "Your modifier is equal to 5 minus your score."
- **Contradiction:** the example right after it (Luck 7 → +2, Strength 3 → −2)
  and the Score/Modifier table on p20 (1 → −4 … 10 → +5) both give `score − 5`.
- **Ruling:** `mod(score) = score − 5`.

### E2. Level-up table, level 8, INT modifier −1: 3 skill points, not 6
- **Text (p6):** the level 8 row shows `6 | 4 | 5`.
- **Contradiction:** the text on p5 grants points only at levels 5, 9, 13, …,
  so level 8 must equal level 7 (`3 | 4 | 5`).
- **Ruling:** typo. Level 8 = `3 | 4 | 5`.

### E3. Level-up table, level 9 HP: `+END mod ×5`, not ×4
- **Text (p6):** level 9 shows "30 SP +AGI mod x5" but "30 HP +END mod x4".
- **Contradiction:** the HP and SP rules on p5 are identical, and every other
  row has matching multipliers.
- **Ruling:** typo. Level 9 HP = `30 + END mod × 5`.

### E4. Skill points are keyed by INT modifier
- **Text:** p5 keys skill points by INT *score* (≤4 / 5 / ≥6), while the p6
  table keys them by INT *modifier* (−1 / 0 / +1).
- **Ruling:** the two are equivalent under E1. Canonical form, per grant:
  `modINT ≤ −1 → 3`, `modINT = 0 → 4`, `modINT ≥ +1 → 5`.
  Grants happen at levels 5, 9, 13, 17, 21, 25 and 29.
- If INT changes, the total is recomputed retroactively ("gain or lose Skill
  Points equal to the total available at your level", p5).

### E5. Perk points: none at levels 5, 9, 13, 17, 21, 25, 29 (not 19)
- **Text (p5):** "1 perk point at each level except for 5th, 9th, 13th, 17th,
  and 19th level." The p6 table agrees (14 at level 18, 14 at level 19,
  25 at level 30).
- **Contradiction:** every other progression in the book runs every 4 levels
  (skill points at 5, 9, …, 29), and 19 breaks that pattern.
- **Ruling (maintainer, 2026-10-20):** typo. No perk point at the skill-point
  levels 5, 9, 13, 17, 21, 25, 29.
  `perkPoints(L) = L − (L ≥ 5 ? floor((L − 5) / 4) + 1 : 0)`, giving
  15 at level 19, 16 at level 20 and 23 at level 30. Don't test against the
  p6 table's perk column from level 19 on.

### E6. SP/HP progression is retroactive in the modifier
- **Text (p5):** +5 + mod at levels 3, 5, …, 29, and if the modifier changes
  "as though you had the new modifier from 1st level".
- **Ruling:** closed form with `k = floor((L − 1) / 2)`:
  - `sp = 10 + 5k + modAGI × (k + 1)`
  - `hp = 10 + 5k + modEND × (k + 1)`
  This matches every row of the p6 table once E3 is applied.

## Rounding and unstated details

E7–E13 were confirmed by the maintainer on 2026-10-20. All of these use
`Math.floor`, i.e. toward −∞, which is what "rounded down" means for
negative values.

### E7. Luck skill bonus
- **Text:** p4 step 5 says "half your Luck modifier (rounded down)". p25 adds:
  "If your Luck has a negative modifier, all your skill bonuses are subtracted
  by 1 regardless of your modifier."
- **Ruling:** `luckSkillBonus = modLCK < 0 ? −1 : floor(modLCK / 2)`.

### E8. Healing Rate rounding
- **Text (p4, p22):** "(level + Endurance score) … then halved". No rounding
  is stated.
- **Ruling:** `healingRate = floor((level + END) / 2)`.

### E9. Party Nerve rounding
- **Text:** p23 says "rounded down", p4 omits it.
- **Ruling:** `partyNerve = floor(Σ modCHA over all PCs / 2)`.

### E10. Group Sneak rounding
- **Text (p4, p24):** the mean of all PCs' Sneak skill bonuses. No rounding is
  stated.
- **Ruling:** `groupSneak = floor(Σ skill.sneak / pcCount)`.

### E11. Skills with two possible abilities
- **Text:** the p20 list gives Breach (PER or INT), Intimidation (STR or CHA)
  and Medicine (PER or INT). The prose then names a different default in
  different places: Intimidation defaults to CHA on p21 but to STR on p23, and
  Medicine to INT on p22 but to PER on p24.
- **Ruling:** the player chooses the ability per skill. It is stored on the
  character as `skillAbility.<skill>`, and the default is the first ability in
  the p20 list (Breach → PER, Intimidation → STR, Medicine → PER).

### E12. Caps and floors stated elsewhere
- AP max is 15 (p24): `ap = min(15, 10 + modAGI + …)`, unless an effect raises
  the cap through `apMax`.
- AC never drops below 10 unless an effect says otherwise (p4 step 17).
- Ability scores range from 1 to 10 for PCs (p21). A score of 0 means death.
  The UI warns but never blocks.

### E13. Combat Sequence bonus = Perception modifier
- **Text:** never stated outright on the character-creation pages. p127 says
  combat sequence is "a Perception check", and the Synth race (p13) calls it
  "your Combat Sequence bonus".
- **Ruling:** `combatSequence = modPER + effects`.

## Races

### E14. Handy robots get three tools
- **Text (p11):** "Handy's are built with three special tools that are
  attached and built into three of their arms … Choose one tool or weapon
  from the following list that is attached to your arm." The Gripper entry
  says "if you do not have at least two of these tools", which implies
  several picks.
- **Ruling:** pick 3 tools (one per arm), with duplicates allowed (e.g. three
  Grippers, which p11 mentions explicitly). Confirmed 2026-10-22.

## Perks

### E15. Educated adds one skill point per grant
- **Text (perks, p32–50):** "You gain 4 skill points when you reach 5th, 9th, … level
  instead of 3. Additionally, you gain a number of skill points equal to the
  total available at your level as if your Intelligence ability score is equal
  to 5."
- **Ruling:** the perk requires INT ≤ 4 (modINT ≤ −1, 3 points per grant by
  E4), so it is encoded as `skillPoints + skillPointGrants` (4 per grant). The
  retroactive clause is covered because the total is computed from the current
  level. If INT later rises to 5 or more, the engine should instead take
  `max(base, 4)` per grant; revisit with the engine's skill-point stage.
- **Status:** Provisional (agent, #8)

### E16. Blind Devil: advantage on combat sequence
- **Text (perks, p32–50):** "you have advantage on all your combat sequence rolls".
- **Ruling:** encoded as `rollMode` on the `combatSequence` stat id.
- **Status:** Provisional (agent, #8)

### E17. Alertness: bonus is Perception score or double the modifier?
- **Text (perks, p32–50):** "you gain a bonus to your passive sense equal to
  your Perception ability score. (Simply put, your passive sense is equal to
  12 + double your Perception ability modifier)".
- **Contradiction:** a bonus of the PER score gives `12 + modPER + PER`, which
  is not `12 + 2·modPER` (the two differ by 5).
- **Ruling:** the parenthetical states the intended result, so the bonus is
  `modPER`, i.e. passive sense becomes `12 + 2·modPER`. Conditional (needs 10
  minutes in place), so it stays a `note`.
- **Status:** Provisional (agent, #10)

### E18. Grit: second rank gives 2 AP in total
- **Text (perks, p32–50):** rank 1 gives "an additional action point" while
  dying; the repeat text says "If you take this perk again, you gain 2
  additional action points".
- **Ruling:** 2 additional AP in total at rank 2, not 1 + 2. Note only.
- **Status:** Provisional (agent, #11)

### E19. Beyond the Sea: direction of the water-movement change
- **Text (perks, p32–50):** "you can spend 1 action point to move 5 feet
  instead of 10". Read literally that is a penalty.
- **Ruling:** a perk wouldn't penalise, so the intent is 10 feet per AP
  instead of 5. Note only.
- **Status:** Provisional (agent, #11)

### E20. "In addition to this trait's effects" Wild Wasteland variants restate the base
- **Text (p29–31):** several Wild Wasteland variants (Fast Shot, Feral, Brawny,
  Small Frame, Hot Blooded, Loose Cannon) open with "In addition to this
  trait's effects".
- **Ruling:** a Wild Wasteland variant replaces the base effects (CLAUDE.md), so
  these variants restate the base effects plus the extra ones. For Brawny and
  Small Frame the repeated bonus/penalty stacks, giving 2× level.
- **Status:** Provisional (agent, #18)

### E21. Gifted: "skill check bonuses" and Discount
- **Text (p30):** "you decrease all your skill check bonuses by 3".
- **Ruling:** encoded as `skill.*` −3 (6 for Wild Wasteland). Extra Discount uses
  are a note.
- **Status:** Provisional (agent, #18)

### E22. Addiction traits: roll mode and the addicted condition
- **Text (p29–30):** Enhancement Reliant gives disadvantage, and Enhancement
  Resistant advantage, on Endurance checks to resist becoming addicted.
  Enhancement Resistant's Wild Wasteland variant grants "immune to the addicted
  condition".
- **Ruling:** the check modes are `rollMode` on `addiction`. There is no
  `addicted` condition id, so the immunity, the rest-ends-addiction clauses and
  the chem duration changes are notes.
- **Status:** Provisional (agent, #18)

### E23. Hoarder (Wild Wasteland): immune to Encumbered
- **Text (p30):** "You are immune to the Encumbered condition".
- **Ruling:** `immunity` to `condition.encumbered` only. Heavily Encumbered is a
  separate condition and is not covered.
- **Status:** Provisional (agent, #18)

### E24. Level-up bonus HP/SP traits apply from level 3
- **Text (p27):** Long Days, Long Nights and Hardened by the Earth (Wild Wasteland)
  give an extra point "whenever your stamina/hit points increase from leveling
  up".
- **Ruling:** HP and SP increase at levels 3, 5, ..., so the bonus is
  `k = floor((L − 1) / 2)` points per extra point, not `k + 1`. Encoded as
  `sp`/`hp` modifiers of `k` (2k for Long Days' Wild Wasteland variant).
- **Status:** Provisional (agent, #19)

### E25. Recluse and Talented change perk points, not perks directly
- **Text (p27–28):** Recluse swaps the 1st-level perk for skill bonuses;
  Talented grants extra perks at 1st level.
- **Ruling:** encoded as `perkPoints` modifiers (−1 / +1; Wild Wasteland
  −min(L, 2) / +2). Recluse's WW variant, "all skill modifiers +2", is
  `skill.*` +2, and Talented's WW "all −2" is `skill.* −2`.
- **Status:** Provisional (agent, #19)

### E26. Race traits that cancel race features are notes
- **Text (p26):** Activated Actinides removes the Ghoul's radiation immunity;
  Endure the Battle removes Luck/END (and Party Nerve) from death saves.
- **Ruling:** the effect schema cannot remove an existing contribution, so only
  the additive part is encoded (radiation resistance and advantage) and the
  removal is a note. The Ghoul Evolution immunity is therefore still applied by
  the engine until a removal mechanism exists.
- **Status:** Provisional (agent, #19)

### E27. Fast Metabolism (Wild Wasteland) drops the Radiation DC penalty
- **Text (p25):** the Wild Wasteland variant gives Healing Rate +level and a
  larger Radiation DC increase on a successful check. It doesn't repeat the
  base trait's +3 Radiation DC and doesn't say "in addition to this trait's effects".
- **Ruling:** a Wild Wasteland variant replaces the base effects (CLAUDE.md), so
  the flat +3 `radiationDc` is not applied. Only the Healing Rate modifier and a
  note remain.
- **Status:** Provisional (agent, #19)

### E28. Manual overrides add to the value
- **Text:** CLAUDE.md pipeline stage 6 says manual overrides are
  `{ stat, value, note }`, "always shown as such". It doesn't say whether
  `value` replaces the stat or adjusts it.
- **Ruling:** `value` is added to the stat (a signed adjustment), so a breakdown
  still sums to the stat's value. It appears as a `manual override` line with
  the note. Clamps (AP ≤ apMax, AC ≥ 10, `clamp` effects) apply after it. A
  clamp effect with a `min` (or `max`) replaces the default floor (or cap) of
  that stat, e.g. AC's 10.
- **Status:** Provisional (agent, #29)

## Editorial (no ruling needed, just don't trust these references)
- p4 steps 7 and 23 say traits are on "pg. 20". They're on p25.
- p5 says the perk list is on "page 27". It's on p32.
- p5 says "use the Level Up Table on pg." with no number. It's p6.
- Several "see page 1" references (dying condition, tracking, crafting tables)
  are placeholder links.
- Educated says "Use the Level Up table on page #". The table is on p6.

### E29. Party-scoped perk limits: the later party member loses the pick
- **Text (p32):** Here and Now "cannot be taken again by any other player
  characters" once taken.
- **Ruling:** "first" is the member's position in the list given to
  `computePartySheet`. The later member's pick is a `problem` and gives no
  effects. Only picks (not grants) at or below the member's level count.
- **Status:** Provisional (agent, #32)
