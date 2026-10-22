#!/usr/bin/env python3
"""Extract perks, traits and backgrounds from the Fallout TTRPG v2.0 rulebook PDF.

Usage: python3 scripts/extract_rules.py <rulebook.pdf> [--out data]

Requires poppler's `pdftotext` on PATH. The book is laid out in two columns,
so every page is cropped into a left and right column and read in that order.

Hand-curated data (effects, requirement fixes) lives in data/overrides/*.json
and is merged over the extracted entries by id, so re-running this script
never destroys curation work.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

PAGE_W, PAGE_H = 612, 792
COL_W = PAGE_W // 2

TRAIT_PAGES = range(25, 33)
PERK_PAGES = range(32, 51)
BACKGROUND_PAGES = range(14, 20)

ABILITIES = ["strength", "perception", "endurance", "charisma", "intelligence", "agility", "luck"]
RACES = {"human": "human", "ghoul": "ghoul", "synth": "synth", "gen-2 synth": "synth",
         "robot": "robot", "super mutant": "superMutant"}
SKILLS = {
    "barter": "barter", "breach": "breach", "crafting": "crafting",
    "energy weapons": "energyWeapons", "explosives": "explosives", "guns": "guns",
    "intimidation": "intimidation", "medicine": "medicine", "melee weapons": "meleeWeapons",
    "science": "science", "sneak": "sneak", "speech": "speech", "survival": "survival",
    "unarmed": "unarmed",
    "melee": "meleeWeapons",  # Pit Fighter abbreviates it
}
WORD_NUMBERS = {"once": 1, "twice": 2, "two": 2, "three": 3, "four": 4, "five": 5}

# Short, unpunctuated lines that look like headings but are table cells.
NOT_HEADINGS = {"Luck", "Check", "Effect"}

PERK_SECTION = re.compile(
    r"^(General|Strength|Perception|Endurance|Charisma|Intelligence|Agility|Luck|Race"
    r"|Human|Ghoul|Robot|Synth|Super Mutant) Perks\.?$")
REQ_LINE = re.compile(r"^(Requirements?|Prerequisite):?\s+(.*)$")  # colon is missing once
WW_LINE = re.compile(r"^Wild Wasteland(?:,\s*([^:]+))?:\s*(.*)$")
PAGE_MARK = re.compile(r"^### (\d+)[LR]$")


# --------------------------------------------------------------------------- PDF


def column_text(pdf: Path, page: int, right: bool) -> str:
    out = subprocess.run(
        ["pdftotext", "-f", str(page), "-l", str(page),
         "-x", str(COL_W if right else 0), "-y", "0", "-W", str(COL_W), "-H", str(PAGE_H),
         str(pdf), "-"],
        check=True, capture_output=True, text=True,
    ).stdout
    return out.replace("\f", "")


def flow(pdf: Path, pages: range) -> list[str]:
    """Reading-order lines with `### <page><L|R>` markers; page-number lines dropped."""
    lines = []
    for page in pages:
        for right in (False, True):
            lines.append(f"### {page}{'R' if right else 'L'}")
            for line in column_text(pdf, page, right).splitlines():
                line = line.strip()
                if re.fullmatch(r"\d+", line):
                    continue
                lines.append(line)
    return lines


# ----------------------------------------------------------------------- helpers


def slug(name: str) -> str:
    name = name.replace("’", "").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def join_lines(lines: list[str]) -> str:
    text = ""
    for line in lines:
        if not line:
            continue
        if text.endswith("-") and not text.endswith(" -"):
            text += line          # hyphen at column edge, e.g. "Rad-" / "Tastic"
        else:
            text += (" " if text else "") + line
    return text.strip()


def is_terminal(line: str) -> bool:
    return bool(re.search(r"[.!?\"”)]$", line))


def looks_like_name(line: str, strict: bool = True) -> bool:
    if not line or len(line) > 40 or line in NOT_HEADINGS:
        return False
    if not re.match(r"[A-Z]", line) or REQ_LINE.match(line):
        return False
    if re.match(r"(Repeat|Wild Wasteland|Starting Equipment|Skills|Trait)\b", line):
        return False
    if not strict:  # e.g. "How do you do, fellow Ghouls?", vouched for by a following Requirements line
        return True
    long_words = [w for w in re.findall(r"[A-Za-z][A-Za-z'’-]*", line) if len(w) > 3]
    return all(w[0].isupper() for w in long_words)


def parse_repeat(text: str) -> dict:
    t = text.lower()
    rep: dict = {"text": text}
    if "as many times" in t:
        rep["max"] = None  # unbounded (or bounded by something narrative)
    else:
        m = re.search(r"maximum of (\w+)", t) or re.search(r"be taken (\w+)", t)
        word = m.group(1) if m else ""
        if word in WORD_NUMBERS or word.isdigit():
            rep["max"] = WORD_NUMBERS.get(word) or int(word)
        elif "take this perk again" in t:
            rep["max"] = 2  # describes exactly one extra pick
        elif re.search(r"cannot be taken by any other", t):
            rep["max"] = 1
    if re.search(r"only by one player character|any other (player )?characters?|total of two player",
                 t):
        rep["scope"] = "party"
    return rep


def parse_races(text: str) -> list[str] | None:
    parts = [p.strip().lower() for p in re.split(r",\s*(?:or\s+)?|\s+or\s+", text) if p.strip()]
    if parts and all(p in RACES for p in parts):
        return [RACES[p] for p in parts]
    return None


def parse_requirements(text: str) -> tuple[list[dict], dict | None]:
    """Turn 'Strength 6.' / 'Robot or Synth, Level 10.' / ... into structured requirements.

    Returns (requirements, repeat). Some perks (Deadeye, Duelist) put their repeat
    rule in the Requirements line instead of a Repeat line.
    """
    text = text.strip().rstrip(".")
    if re.search(r"take this perk up to", text, re.I):
        return [], parse_repeat(text)

    reqs: list[dict] = []
    m = re.search(r",?\s*Level (\d+)$", text)
    if m:
        reqs.append({"kind": "level", "min": int(m.group(1))})
        text = text[: m.start()].strip()

    races = parse_races(text)
    if races:
        reqs.insert(0, {"kind": "race", "anyOf": races})
        return reqs, None

    m = re.fullmatch(r"(\w+) (\d+)( or lower)?", text)
    if m and m.group(1).lower() in ABILITIES:
        ability, value = m.group(1).lower(), int(m.group(2))
        reqs.insert(0, {"kind": "ability", "ability": ability,
                        ("max" if m.group(3) else "min"): value})
        return reqs, None

    m = re.fullmatch(r"An ability score equal to or lower than (\d+)", text, re.I)
    if m:
        reqs.insert(0, {"kind": "anyAbility", "max": int(m.group(1))})
        return reqs, None

    if ", " in text:  # compound, e.g. "Human, Endurance 5"
        parts = [parse_requirements(part)[0] for part in text.split(", ")]
        if all(p and p[0]["kind"] != "condition" for p in parts):
            return [r for p in parts for r in p] + reqs, None

    if text:
        reqs.insert(0, {"kind": "condition", "text": text})
    return reqs, None


# --------------------------------------------------------------- entry parsing


def split_entries(lines: list[str], start: str, stop: str | None) -> list[dict]:
    """Group a flow of lines into raw entries: {name, page, section, body: [lines]}."""
    try:
        i = lines.index(start)
    except ValueError:
        sys.exit(f"section heading {start!r} not found")
    entries: list[dict] = []
    current: dict | None = None
    section: str | None = None
    page = next(int(m.group(1)) for l in reversed(lines[:i]) if (m := PAGE_MARK.match(l)))
    prev = ""  # last non-blank content line, for heading detection

    def next_content(j: int) -> str:
        for line in lines[j + 1:]:
            if line and not PAGE_MARK.match(line):
                return line
        return ""

    for j in range(i + 1, len(lines)):
        line = lines[j]
        if (m := PAGE_MARK.match(line)):
            page = int(m.group(1))
            continue
        if stop and line == stop:
            break
        if not line:
            if current:
                current["body"].append("")
            continue
        if (m := PERK_SECTION.match(line)):
            section = m.group(1)
            current = None
            prev = line
            continue

        nxt = next_content(j)
        heading = (REQ_LINE.match(nxt) and looks_like_name(line, strict=False)) or (
            looks_like_name(line)
            and not is_terminal(line.rstrip("!"))
            and (is_terminal(prev) or current is None)
            and not line.startswith(("“", '"', "- "))
        )
        # Section intros (quote + flavour paragraph) precede the first entry and are
        # dropped because `current` is None until the first heading.
        if heading:
            current = {"name": line.rstrip("."), "page": page, "section": section, "body": []}
            entries.append(current)
        elif current is not None:
            current["body"].append(line)
        prev = line
    return entries


def parse_body(body: list[str], wild_wasteland: bool) -> dict:
    """Split an entry body into requirement / description / repeat / wild wasteland parts.

    The requirement line usually comes first but sometimes trails the description
    (Deadeye, Duelist), and may wrap onto a second line.
    """
    req_text, desc, repeat = None, [], []
    variants: list[dict] = []
    target = desc
    wrapping_req = False
    for line in body:
        if not line:
            continue
        if (m := REQ_LINE.match(line)) and req_text is None and target is desc:
            req_text = m.group(2)
            wrapping_req = not req_text.endswith(".")
            continue
        if wrapping_req:
            wrapping_req = False
            if len(line) < 40 and line[0].islower() or re.fullmatch(r"[\w ,]+\.", line) and len(line) < 25:
                req_text += " " + line
                continue
        if line.startswith("Repeat:"):
            target = repeat
            line = line[len("Repeat:"):].strip()
        elif wild_wasteland and (m := WW_LINE.match(line)):
            variants.append({"label": m.group(1), "lines": []})
            target = variants[-1]["lines"]
            line = m.group(2)
        target.append(line)

    ww = []
    for v in variants:
        text = join_lines(v["lines"])
        variant = {}
        if v["label"]:
            variant["label"] = v["label"].strip()
        m = re.match(r"Prerequisite:\s*([^.]+)\.\s*", text)
        if m:  # Skilled's WW variant has its own prerequisite
            variant["requirementText"] = m.group(1)
            text = text[m.end():]
        variant["description"] = text
        ww.append(variant)
    description = join_lines(desc)
    if not repeat and " Repeat: " in description:  # "Repeat:" not at a line start
        description, inline = description.split(" Repeat: ", 1)
        repeat = [inline]
    return {
        "requirementText": req_text,
        "description": description,
        "repeatText": join_lines(repeat) or None,
        "wildWasteland": ww,
    }


def build_entry(raw: dict, kind: str, wild_wasteland: bool) -> dict:
    parts = parse_body(raw["body"], wild_wasteland)
    reqs, repeat = parse_requirements(parts["requirementText"] or "")
    if parts["repeatText"]:
        repeat = parse_repeat(parts["repeatText"])
    entry = {
        "id": slug(raw["name"]),
        "name": raw["name"],
        "kind": kind,
        "requirements": reqs,
        "description": parts["description"],
        "source": {"page": raw["page"]},
        "effects": [],
    }
    if parts["requirementText"] and not (repeat and not reqs):
        # Deadeye/Duelist: the "requirement" line is really the repeat sentence
        entry["requirementText"] = parts["requirementText"].rstrip(".")
    if repeat:
        entry["repeat"] = repeat
    if wild_wasteland and parts["wildWasteland"]:
        entry["wildWasteland"] = [{**v, "effects": []} for v in parts["wildWasteland"]]
    return entry


# ------------------------------------------------------------------ sections


def extract_backgrounds(pdf: Path) -> list[dict]:
    content = [l for l in flow(pdf, BACKGROUND_PAGES) if l]
    out: list[dict] = []
    page = 0
    i = 0
    while i < len(content):
        line = content[i]
        if (m := PAGE_MARK.match(line)):
            page = int(m.group(1))
            i += 1
            continue
        nxt = content[i + 1] if i + 1 < len(content) else ""
        if nxt.startswith("Skills:") and looks_like_name(line):
            out.append({"name": line, "page": page, "body": []})
        elif out:
            out[-1]["body"].append(line)
        i += 1

    backgrounds = []
    for raw in out:
        skills_line = next(l for l in raw["body"] if l.startswith("Skills:"))
        skills = [SKILLS[s.strip().lower()] for s in
                  re.split(r",\s*(?:and\s+)?|\s+and\s+", skills_line.split("+2 to", 1)[1].rstrip("."))
                  if s.strip().lower() in SKILLS]
        trait = next((l.split(":", 1)[1].strip() for l in raw["body"] if l.startswith("Trait:")), None)
        desc, equipment, current = [], [], None
        in_equipment = False
        for l in raw["body"]:
            if l.startswith(("Skills:", "Trait:")) or PAGE_MARK.match(l):
                continue
            if l.startswith("Starting Equipment"):
                in_equipment = True
                rest = l.split(":", 1)[1].strip() if ":" in l else ""
                if rest:
                    desc.append("Starting Equipment: " + rest)
                    in_equipment = False
                continue
            if in_equipment:
                if l.startswith("•"):
                    label = l.lstrip("• ").rstrip(".")
                    races_text = re.sub(rf"\s*{re.escape(raw['name'])}$", "", label, flags=re.I)
                    current = {"races": parse_races(races_text) or [], "label": label, "items": []}
                    equipment.append(current)
                elif current:
                    current["items"].append(l)
            else:
                desc.append(l)
        for e in equipment:
            e["items"] = join_lines(e["items"])
        backgrounds.append({
            "id": slug(raw["name"]),
            "name": raw["name"],
            "skills": skills if len(skills) == 3 else None,  # None = choose any three
            "traitId": slug(trait) if trait else None,
            "description": join_lines(desc),
            "startingEquipment": equipment,
            "source": {"page": raw["page"]},
        })
    return backgrounds


def extract_traits(pdf: Path, background_trait_ids: set[str]) -> list[dict]:
    lines = flow(pdf, TRAIT_PAGES)
    traits = []
    for raw in split_entries(lines, "Traits", stop="Perks"):
        entry = build_entry(raw, "trait", wild_wasteland=True)
        if any(r["kind"] == "race" for r in entry["requirements"]):
            entry["category"] = "race"
        elif entry["id"] in background_trait_ids:
            entry["category"] = "background"
        else:
            entry["category"] = "character"
        traits.append(entry)
    return traits


def extract_perks(pdf: Path) -> list[dict]:
    lines = flow(pdf, PERK_PAGES)
    perks = []
    for raw in split_entries(lines, "Perks", stop=None):
        section = (raw["section"] or "General").lower()
        entry = build_entry(raw, "perk", wild_wasteland=False)
        if section in ABILITIES:
            entry["category"] = section
        elif section == "general":
            entry["category"] = "general"
        else:
            entry["category"] = "race"
        perks.append(entry)
    return perks


# --------------------------------------------------------------------- output


def apply_overrides(entries: list[dict], path: Path) -> list[dict]:
    if not path.exists():
        return entries
    overrides = json.loads(path.read_text())
    by_id = {e["id"]: e for e in entries}
    unknown = sorted(set(overrides) - set(by_id))
    if unknown:
        print(f"warning: {path} has overrides for unknown ids: {unknown}", file=sys.stderr)
    for id_, patch in overrides.items():
        if id_ not in by_id:
            continue
        for key, value in patch.items():
            # wildWasteland overrides are matched to extracted variants by index
            if key == "wildWasteland" and isinstance(value, list) and "wildWasteland" in by_id[id_]:
                for variant, vpatch in zip(by_id[id_]["wildWasteland"], value):
                    variant.update(vpatch)
            else:
                by_id[id_][key] = value
    return entries


def check_duplicates(entries: list[dict], label: str) -> None:
    seen: dict[str, int] = {}
    for e in entries:
        seen[e["id"]] = seen.get(e["id"], 0) + 1
    dupes = [k for k, v in seen.items() if v > 1]
    if dupes:
        sys.exit(f"duplicate {label} ids: {dupes}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "data")
    args = ap.parse_args()

    backgrounds = extract_backgrounds(args.pdf)
    traits = extract_traits(args.pdf, {b["traitId"] for b in backgrounds if b["traitId"]})
    perks = extract_perks(args.pdf)

    args.out.mkdir(parents=True, exist_ok=True)
    for name, entries in (("backgrounds", backgrounds), ("traits", traits), ("perks", perks)):
        check_duplicates(entries, name)
        entries = apply_overrides(entries, args.out / "overrides" / f"{name}.json")
        (args.out / f"{name}.json").write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n")
        print(f"{name}: {len(entries)}")


if __name__ == "__main__":
    main()
