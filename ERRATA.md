# Errata and rulings

The rulebook (Arcane Arcade "Fallout TTRPG v2.0") contradicts itself in places.
This file is the single source of truth for how the app resolves each case.
**The engine implements these rulings, not the raw text.** If code and this file
disagree, the code is wrong. New ambiguities go here first and get a ruling
from the maintainer before an implementation PR picks a side.

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

### E5. Perk points: none at levels 5, 9, 13, 17 **and 19**
- **Text (p5):** "1 perk point at each level except for 5th, 9th, 13th, 17th,
  and 19th level." The p6 table agrees (14 at level 18, 14 at level 19,
  25 at level 30).
- **Suspicion:** 19 breaks the every-4-levels pattern (21 would fit).
- **Ruling:** rules as written. Text and table agree, so this isn't treated as
  a typo. `perkPoints(L) = L − |{5, 9, 13, 17, 19} ∩ [1, L]|`.
  **Open:** the maintainer may switch this to 21/25/29.

### E6. SP/HP progression is retroactive in the modifier
- **Text (p5):** +5 + mod at levels 3, 5, …, 29, and if the modifier changes
  "as though you had the new modifier from 1st level".
- **Ruling:** closed form with `k = floor((L − 1) / 2)`:
  - `sp = 10 + 5k + modAGI × (k + 1)`
  - `hp = 10 + 5k + modEND × (k + 1)`
  This matches every row of the p6 table once E3 is applied.

## Rounding and unstated details

All of these use `Math.floor`, i.e. toward −∞, which is what "rounded down"
means for negative values.

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

## Editorial (no ruling needed, just don't trust these references)
- p4 steps 7 and 23 say traits are on "pg. 20". They're on p25.
- p5 says the perk list is on "page 27". It's on p32.
- p5 says "use the Level Up Table on pg." with no number. It's p6.
- Several "see page 1" references (dying condition, tracking, crafting tables)
  are placeholder links.
