#!/usr/bin/env python3
"""Validate data/*.json against the schema in CLAUDE.md.

Usage: python3 scripts/validate_rules.py [--data data] [--quiet]

Checks every entry's shape, every effect against the Effect union, ids against
the closed vocabularies in data/vocab.json (listed in CLAUDE.md),
cross-references (grantPerk targets, background traits, variant `replaces`), and
that data/overrides/*.json agrees with the generated files it patches. Exits 1
on any error. Without --quiet it also prints encoding progress.

Needs no PDF and no third-party packages, so it runs in CI.
"""

import argparse
import json
import sys
from pathlib import Path


def load_vocab(path: Path) -> dict:
    """Closed id lists from data/vocab.json (the single source, shared with the TS types)."""
    return json.loads(path.read_text())


EXPR_ARITY = {"add": (2, None), "mul": (2, None), "min": (2, None), "max": (2, None),
              "sub": (2, 2), "div": (2, 2), "floor": (1, 1)}

TRAIT_CATEGORIES = ["race", "background", "character"]
SIZES = ["small", "medium", "large"]


class Checker:
    def __init__(self, vocab: dict) -> None:
        self.abilities = vocab["abilities"]
        self.skills = vocab["skills"]
        self.races = vocab["races"]
        self.stats = (set(vocab["derived"]) | {f"ability.{a}" for a in self.abilities}
                      | {f"skill.{s}" for s in self.skills})
        self.defense_targets = ({f"damage.{d}" for d in vocab["damageTypes"]}
                                | {f"condition.{c}" for c in vocab["conditions"]}
                                | {"radiationLevels"})
        self.rolls = (self.stats | set(vocab["rolls"]) | {f"check.{a}" for a in self.abilities})
        self.expr_refs = ({"level", "rank", "skillPointGrants"}
                          | {f"ability.{a}" for a in self.abilities}
                          | {f"mod.{a}" for a in self.abilities})
        self.perk_categories = ["general", "race", *self.abilities]
        self.errors: list[str] = []
        self.perk_ids: set[str] = set()

    def err(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    # ------------------------------------------------------------------ helpers

    def keys(self, where: str, obj, required: set[str], optional: set[str] = frozenset()) -> bool:
        if not isinstance(obj, dict):
            self.err(where, f"expected an object, got {type(obj).__name__}")
            return False
        for k in sorted(required - obj.keys()):
            self.err(where, f"missing key {k!r}")
        for k in sorted(obj.keys() - required - optional):
            self.err(where, f"unknown key {k!r}")
        return True

    def string(self, where: str, value) -> None:
        if not isinstance(value, str) or not value.strip():
            self.err(where, "expected a non-empty string")

    def int_(self, where: str, value, lo: int | None = None, hi: int | None = None) -> None:
        if not isinstance(value, int) or isinstance(value, bool):
            self.err(where, f"expected an integer, got {value!r}")
        elif (lo is not None and value < lo) or (hi is not None and value > hi):
            self.err(where, f"{value} outside [{lo}, {hi}]")

    def one_of(self, where: str, value, allowed) -> None:
        if value not in allowed:
            self.err(where, f"{value!r} is not one of the known ids (see CLAUDE.md)")

    def source(self, where: str, src) -> None:
        if self.keys(where, src, {"page"}):
            self.int_(f"{where}.page", src["page"], 1, 179)

    def needs_review(self, where: str, obj: dict) -> None:
        if "needsReview" in obj and obj["needsReview"] is not True:
            self.err(f"{where}.needsReview", "must be true or absent")

    # ------------------------------------------------------------- expressions

    def expr(self, where: str, e, allow_rank: bool) -> None:
        if isinstance(e, bool) or not isinstance(e, (int, float, dict)):
            self.err(where, f"expected a number or an expression object, got {e!r}")
        elif isinstance(e, dict) and "ref" in e:
            if self.keys(where, e, {"ref"}):
                self.one_of(f"{where}.ref", e["ref"], self.expr_refs)
                if e["ref"] == "rank" and not allow_rank:
                    self.err(where, "ref 'rank' is only meaningful on perks")
        elif isinstance(e, dict):
            if not self.keys(where, e, {"op", "args"}):
                return
            if e["op"] not in EXPR_ARITY:
                self.err(f"{where}.op", f"unknown op {e['op']!r}")
                return
            if not isinstance(e["args"], list):
                self.err(f"{where}.args", "expected a list")
                return
            lo, hi = EXPR_ARITY[e["op"]]
            n = len(e["args"])
            if n < lo or (hi is not None and n > hi):
                self.err(f"{where}.args", f"{e['op']} takes {lo}{'' if hi == lo else '+' if hi is None else f'-{hi}'} args, got {n}")
            for i, a in enumerate(e["args"]):
                self.expr(f"{where}.args[{i}]", a, allow_rank)

    # ----------------------------------------------------------------- effects

    def effect(self, where: str, eff, allow_rank: bool) -> None:
        if not isinstance(eff, dict) or "type" not in eff:
            self.err(where, "expected an object with a 'type'")
            return
        t = eff["type"]
        if t == "modifier":
            if self.keys(where, eff, {"type", "stat", "value"}):
                self.one_of(f"{where}.stat", eff["stat"], self.stats | {"skill.*"})
                self.expr(f"{where}.value", eff["value"], allow_rank)
        elif t == "clamp":
            if self.keys(where, eff, {"type", "stat"}, {"min", "max"}):
                self.one_of(f"{where}.stat", eff["stat"], self.stats)
                if "min" not in eff and "max" not in eff:
                    self.err(where, "clamp needs min, max or both")
                for k in ("min", "max"):
                    if k in eff:
                        self.int_(f"{where}.{k}", eff[k])
                if isinstance(eff.get("min"), int) and isinstance(eff.get("max"), int) \
                        and eff["min"] > eff["max"]:
                    self.err(where, "min > max")
        elif t == "rollMode":
            if self.keys(where, eff, {"type", "roll", "mode"}):
                self.one_of(f"{where}.roll", eff["roll"], self.rolls)
                self.one_of(f"{where}.mode", eff["mode"], {"advantage", "disadvantage"})
        elif t in ("immunity", "resistance", "vulnerability"):
            if self.keys(where, eff, {"type", "to"}):
                self.one_of(f"{where}.to", eff["to"], self.defense_targets)
        elif t == "grantPerk":
            if self.keys(where, eff, {"type", "perkId"}) and eff["perkId"] not in self.perk_ids:
                self.err(f"{where}.perkId", f"no perk with id {eff['perkId']!r}")
        elif t == "countsAsRace":
            if self.keys(where, eff, {"type", "race", "for"}):
                self.one_of(f"{where}.race", eff["race"], self.races)
                self.one_of(f"{where}.for", eff["for"], {"perkRequirements"})
        elif t == "note":
            if self.keys(where, eff, {"type", "text"}):
                self.string(f"{where}.text", eff["text"])
        else:
            self.err(f"{where}.type", f"unknown effect type {t!r}")

    def effects(self, where: str, effs, allow_rank: bool = False) -> None:
        if not isinstance(effs, list):
            self.err(where, "expected a list")
            return
        for i, eff in enumerate(effs):
            self.effect(f"{where}[{i}]", eff, allow_rank)

    # ------------------------------------------------------------ requirements

    def requirement(self, where: str, req) -> None:
        kind = req.get("kind") if isinstance(req, dict) else None
        if kind == "ability":
            if self.keys(where, req, {"kind", "ability"}, {"min", "max"}):
                self.one_of(f"{where}.ability", req["ability"], self.abilities)
                if "min" not in req and "max" not in req:
                    self.err(where, "ability requirement needs min, max or both")
                for k in ("min", "max"):
                    if k in req:
                        self.int_(f"{where}.{k}", req[k], 1, 10)
        elif kind == "anyAbility":
            if self.keys(where, req, {"kind", "max"}):
                self.int_(f"{where}.max", req["max"], 1, 10)
        elif kind == "race":
            if self.keys(where, req, {"kind", "anyOf"}):
                if not isinstance(req["anyOf"], list) or not req["anyOf"]:
                    self.err(f"{where}.anyOf", "expected a non-empty list")
                else:
                    for i, r in enumerate(req["anyOf"]):
                        self.one_of(f"{where}.anyOf[{i}]", r, self.races)
        elif kind == "level":
            if self.keys(where, req, {"kind", "min"}):
                self.int_(f"{where}.min", req["min"], 1, 30)
        elif kind == "condition":
            if self.keys(where, req, {"kind", "text"}):
                self.string(f"{where}.text", req["text"])
        else:
            self.err(where, f"unknown requirement kind {kind!r}")

    def requirements(self, where: str, reqs) -> None:
        if not isinstance(reqs, list):
            self.err(where, "expected a list")
            return
        for i, r in enumerate(reqs):
            self.requirement(f"{where}[{i}]", r)

    # ----------------------------------------------------------------- entries

    def perk(self, where: str, p: dict) -> None:
        if not self.keys(where, p, {"id", "name", "kind", "category", "requirements", "description",
                                    "source", "effects"},
                         {"requirementText", "repeat", "needsReview"}):
            return
        self.one_of(f"{where}.kind", p["kind"], {"perk"})
        self.one_of(f"{where}.category", p["category"], self.perk_categories)
        for k in ("name", "description"):
            self.string(f"{where}.{k}", p[k])
        self.requirements(f"{where}.requirements", p["requirements"])
        self.source(f"{where}.source", p["source"])
        self.effects(f"{where}.effects", p["effects"], allow_rank=True)
        self.needs_review(where, p)
        if "repeat" in p and self.keys(f"{where}.repeat", p["repeat"], {"text"}, {"max", "scope"}):
            rep = p["repeat"]
            if "max" in rep and rep["max"] is not None:
                self.int_(f"{where}.repeat.max", rep["max"], 1)
            if "scope" in rep:
                self.one_of(f"{where}.repeat.scope", rep["scope"], {"party"})

    def trait(self, where: str, t: dict) -> None:
        if not self.keys(where, t, {"id", "name", "kind", "category", "requirements", "description",
                                    "source", "effects"},
                         {"requirementText", "wildWasteland", "needsReview"}):
            return
        self.one_of(f"{where}.kind", t["kind"], {"trait"})
        self.one_of(f"{where}.category", t["category"], TRAIT_CATEGORIES)
        for k in ("name", "description"):
            self.string(f"{where}.{k}", t[k])
        self.requirements(f"{where}.requirements", t["requirements"])
        self.source(f"{where}.source", t["source"])
        self.effects(f"{where}.effects", t["effects"])
        self.needs_review(where, t)
        for i, ww in enumerate(t.get("wildWasteland", [])):
            w = f"{where}.wildWasteland[{i}]"
            if self.keys(w, ww, {"description", "effects"}, {"label", "requirementText", "requirements"}):
                self.string(f"{w}.description", ww["description"])
                self.effects(f"{w}.effects", ww["effects"])
                if "requirements" in ww:
                    self.requirements(f"{w}.requirements", ww["requirements"])

    def background(self, where: str, b: dict, traits: dict[str, dict]) -> None:
        if not self.keys(where, b, {"id", "name", "skills", "traitId", "description", "source",
                                    "startingEquipment"}):
            return
        for k in ("name", "description"):
            self.string(f"{where}.{k}", b[k])
        self.source(f"{where}.source", b["source"])
        if b["skills"] is not None:
            if not isinstance(b["skills"], list) or len(b["skills"]) < 3:
                self.err(f"{where}.skills", "expected null or a list of at least 3 skills")
            else:
                for i, s in enumerate(b["skills"]):
                    self.one_of(f"{where}.skills[{i}]", s, self.skills)
        if b["traitId"] is not None:
            if b["traitId"] not in traits:
                self.err(f"{where}.traitId", f"no trait with id {b['traitId']!r}")
            elif traits[b["traitId"]]["category"] != "background":
                self.err(f"{where}.traitId", f"{b['traitId']!r} is not a background trait")
        for i, eq in enumerate(b["startingEquipment"]):
            w = f"{where}.startingEquipment[{i}]"
            if self.keys(w, eq, {"races", "label", "items"}):
                for j, r in enumerate(eq["races"]):
                    self.one_of(f"{w}.races[{j}]", r, self.races)
                self.string(f"{w}.items", eq["items"])

    def features(self, where: str, feats) -> set[str]:
        ids = set()
        for i, f in enumerate(feats):
            w = f"{where}[{i}]"
            if self.keys(w, f, {"id", "name", "description", "effects"}, {"needsReview"}):
                if f["id"] in ids:
                    self.err(w, f"duplicate feature id {f['id']!r}")
                ids.add(f["id"])
                for k in ("name", "description"):
                    self.string(f"{w}.{k}", f[k])
                self.effects(f"{w}.effects", f["effects"])
                self.needs_review(w, f)
        return ids

    def race(self, where: str, r: dict) -> None:
        if not self.keys(where, r, {"id", "name", "source", "size", "hasRadiationDc", "features",
                                    "variants"}, {"subtypes"}):
            return
        self.one_of(f"{where}.id", r["id"], self.races)
        self.source(f"{where}.source", r["source"])
        for i, s in enumerate(r["size"]):
            self.one_of(f"{where}.size[{i}]", s, SIZES)
        if not isinstance(r["hasRadiationDc"], bool):
            self.err(f"{where}.hasRadiationDc", "expected a boolean")
        base = self.features(f"{where}.features", r["features"])
        for i, st in enumerate(r.get("subtypes", [])):
            w = f"{where}.subtypes[{i}]"
            if not self.keys(w, st, {"id", "name", "source", "features"}, {"toolChoice"}):
                continue
            self.source(f"{w}.source", st["source"])
            self.features(f"{w}.features", st["features"])
            if "toolChoice" in st:
                tc = st["toolChoice"]
                if self.keys(f"{w}.toolChoice", tc, {"count", "description", "options"},
                             {"needsReview"}):
                    self.int_(f"{w}.toolChoice.count", tc["count"], 1)
                    self.needs_review(f"{w}.toolChoice", tc)
                    for j, o in enumerate(tc["options"]):
                        self.keys(f"{w}.toolChoice.options[{j}]", o, {"id", "name", "text"})
        for i, v in enumerate(r["variants"]):
            w = f"{where}.variants[{i}]"
            if self.keys(w, v, {"id", "name", "replaces", "features"}):
                for j, rep in enumerate(v["replaces"]):
                    if rep not in base:
                        self.err(f"{w}.replaces[{j}]", f"no base feature {rep!r} on {r['id']}")
                self.features(f"{w}.features", v["features"])

    # --------------------------------------------------------------- overrides

    def overrides(self, path: Path, generated: dict[str, dict]) -> None:
        """Every override must already be applied to the generated file (CLAUDE.md, CI rule)."""
        if not path.exists():
            return
        data = json.loads(path.read_text())
        for id_, patch in data.items():
            where = f"{path.name}#{id_}"
            if id_ not in generated:
                self.err(where, "override for an unknown id")
                continue
            for key, value in patch.items():
                actual = generated[id_].get(key)
                if key == "wildWasteland" and isinstance(value, list) and isinstance(actual, list):
                    for i, vpatch in enumerate(value):
                        for k, v in vpatch.items():
                            if i >= len(actual) or actual[i].get(k) != v:
                                self.err(f"{where}.wildWasteland[{i}].{k}",
                                         "differs from the generated file; re-run the extraction "
                                         "or apply the same patch there")
                elif actual != value:
                    self.err(f"{where}.{key}", "differs from the generated file; re-run the "
                                               "extraction or apply the same patch there")


def load(path: Path) -> list[dict]:
    data = json.loads(path.read_text())
    if not isinstance(data, list):
        sys.exit(f"{path}: expected a top-level list")
    return data


def index(c: Checker, name: str, entries: list[dict]) -> dict[str, dict]:
    by_id: dict[str, dict] = {}
    for i, e in enumerate(entries):
        id_ = e.get("id") if isinstance(e, dict) else None
        if not isinstance(id_, str) or not id_:
            c.err(f"{name}[{i}]", "missing id")
        elif id_ in by_id:
            c.err(f"{name}#{id_}", "duplicate id")
        else:
            by_id[id_] = e
    return by_id


def progress(perks: list[dict], traits: list[dict]) -> None:
    for name, entries in (("perks", perks), ("traits", traits)):
        encoded = sum(1 for e in entries if e.get("effects"))
        review = sum(1 for e in entries if e.get("needsReview"))
        print(f"{name}: {encoded}/{len(entries)} with effects, {review} need review")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=Path(__file__).resolve().parent.parent / "data")
    ap.add_argument("--quiet", action="store_true", help="print errors only")
    args = ap.parse_args()

    c = Checker(load_vocab(args.data / "vocab.json"))
    perks, traits = load(args.data / "perks.json"), load(args.data / "traits.json")
    backgrounds, races = load(args.data / "backgrounds.json"), load(args.data / "races.json")
    perks_by_id, traits_by_id = index(c, "perks", perks), index(c, "traits", traits)
    backgrounds_by_id = index(c, "backgrounds", backgrounds)
    index(c, "races", races)
    c.perk_ids = set(perks_by_id)

    for id_, p in perks_by_id.items():
        c.perk(f"perks#{id_}", p)
    for id_, t in traits_by_id.items():
        c.trait(f"traits#{id_}", t)
    for id_, b in backgrounds_by_id.items():
        c.background(f"backgrounds#{id_}", b, traits_by_id)
    for r in races:
        c.race(f"races#{r.get('id')}", r)
    for name, by_id in (("perks", perks_by_id), ("traits", traits_by_id),
                        ("backgrounds", backgrounds_by_id)):
        c.overrides(args.data / "overrides" / f"{name}.json", by_id)

    for e in c.errors:
        print(e, file=sys.stderr)
    if not args.quiet:
        progress(perks, traits)
    if c.errors:
        sys.exit(f"{len(c.errors)} error(s)")
    if not args.quiet:
        print("ok")


if __name__ == "__main__":
    main()
