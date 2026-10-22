# Fallout TTRPG Character Sheet

A local, persistent digital character sheet for the Arcane Arcade
**Fallout TTRPG v2.0** fan system. It computes derived stats (with a
breakdown of every number), applies perk and trait effects, and suggests perks
you qualify for or are one SPECIAL point away from.

> Status: early. The rules data is extracted; the engine and UI are not built
> yet. See the open issues.

## Usage

```sh
npm ci              # install dependencies (npm install to update the lockfile)
npm run dev         # Vite dev server (the local save server comes later)
npm run build       # typecheck, then production build into dist/
npm run typecheck   # tsc --noEmit, strict
npm test            # Vitest engine unit tests
```

## Repository

| Path | What |
|---|---|
| `data/*.json` | Backgrounds, traits and perks extracted from the rulebook |
| `data/overrides/` | Hand-curated fixes and effects, merged on extraction |
| `scripts/extract_rules.py` | Re-generates `data/` from the rulebook PDF |
| `scripts/validate_rules.py` | Checks `data/` against the schema (runs in CI) |
| `ERRATA.md` | How the app resolves contradictions in the rulebook |
| `CLAUDE.md` | Architecture, formulas and data schema (for contributors and agents) |
| `ROADMAP.md` | Build plan and the workflow for agent-driven issues |

### Re-extracting the rules data

Requires Python 3.10+ and poppler (`pdftotext`):

```sh
python3 scripts/extract_rules.py path/to/Fallout_TTRPG_v2.0.pdf
```

## License

Code: MIT (`LICENSE`). Game text in `data/` belongs to Arcane Arcade, and
Fallout is a trademark of Bethesda Softworks. This project is unofficial and
not affiliated with either. See `NOTICE`.
