#!/usr/bin/env python3
"""Tests for validate_rules.py: python3 -m unittest discover scripts"""

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "validate_rules.py"
DATA = Path(__file__).resolve().parent.parent / "data"
FILES = ("perks", "traits", "backgrounds", "races")


class ValidateRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.vocab = json.loads((DATA / "vocab.json").read_text())
        cls.real = {f: json.loads((DATA / f"{f}.json").read_text()) for f in FILES}

    def run_on(self, data: dict, overrides: dict | None = None,
               vocab: dict | None = None) -> subprocess.CompletedProcess:
        with tempfile.TemporaryDirectory() as tmp:
            for f, entries in data.items():
                (Path(tmp) / f"{f}.json").write_text(json.dumps(entries))
            (Path(tmp) / "vocab.json").write_text(json.dumps(vocab or self.vocab))
            if overrides:
                (Path(tmp) / "overrides").mkdir()
                for f, o in overrides.items():
                    (Path(tmp) / "overrides" / f"{f}.json").write_text(json.dumps(o))
            return subprocess.run([sys.executable, str(SCRIPT), "--data", tmp, "--quiet"],
                                  capture_output=True, text=True)

    def assert_error(self, mutate, expected: str, overrides: dict | None = None) -> None:
        data = copy.deepcopy(self.real)
        mutate(data)
        result = self.run_on(data, overrides)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn(expected, result.stderr)

    def perk(self, data: dict, id_: str = "adaptive-reflexes") -> dict:
        return next(p for p in data["perks"] if p["id"] == id_)

    def test_vocab_contents(self) -> None:
        v = self.vocab
        self.assertEqual(v["abilities"], ["strength", "perception", "endurance", "charisma",
                                          "intelligence", "agility", "luck"])
        self.assertEqual(len(v["skills"]), 14)
        self.assertEqual(set(v["skills"]), {
            "barter", "breach", "crafting", "energyWeapons", "explosives", "guns", "intimidation",
            "medicine", "meleeWeapons", "science", "sneak", "speech", "survival", "unarmed"})
        self.assertEqual(set(v["skillAbilities"]), set(v["skills"]))
        for skill, a in v["skillAbilities"].items():
            for ability in [a["default"], *a.get("alternates", [])]:
                self.assertIn(ability, v["abilities"], skill)
        self.assertEqual({k: x["alternates"] for k, x in v["skillAbilities"].items()
                          if "alternates" in x},
                         {"breach": ["intelligence"], "intimidation": ["charisma"],
                          "medicine": ["intelligence"]})
        self.assertEqual(v["races"], ["human", "ghoul", "synth", "robot", "superMutant"])
        self.assertEqual(len(v["damageTypes"]), 14)  # p132's 13 plus radiation
        self.assertIn("radiation", v["damageTypes"])
        self.assertEqual(len(v["conditions"]), 30)
        self.assertEqual(set(v["derived"]), {
            "hp", "sp", "ap", "apMax", "ac", "dt", "healingRate", "carryLoad", "passiveSense",
            "combatSequence", "radiationDc", "karmaCaps", "deathSave", "skillPoints",
            "perkPoints", "partyNerve", "groupSneak"})
        self.assertEqual(v["rolls"], ["attack", "damage", "abilityCheck", "radiation", "addiction"])

    def test_no_hardcoded_vocab_constants(self) -> None:
        src = SCRIPT.read_text()
        for name in ("ABILITIES", "SKILLS", "DERIVED", "RACES", "DAMAGE_TYPES", "CONDITIONS"):
            self.assertNotRegex(src, rf"^{name}\s*=", name)

    def test_id_missing_from_vocab_is_rejected(self) -> None:
        # Real data uses 'sneak'; drop it from vocab.json and the validator must object.
        vocab = copy.deepcopy(self.vocab)
        vocab["skills"].remove("sneak")
        data = copy.deepcopy(self.real)
        self.perk(data)["effects"].append({"type": "modifier", "stat": "skill.sneak", "value": 1})
        result = self.run_on(data, vocab=vocab)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("'skill.sneak'", result.stderr)

    def test_real_data_passes(self) -> None:
        result = self.run_on(self.real)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_valid_effects_pass(self) -> None:
        data = copy.deepcopy(self.real)
        self.perk(data)["effects"] = [
            {"type": "modifier", "stat": "hp",
             "value": {"op": "mul", "args": [{"ref": "rank"}, {"ref": "mod.endurance"}]}},
            {"type": "modifier", "stat": "skill.*", "value": 1},
            {"type": "clamp", "stat": "ability.strength", "min": 6},
            {"type": "rollMode", "roll": "check.luck", "mode": "advantage"},
            {"type": "immunity", "to": "condition.stunned"},
            {"type": "grantPerk", "perkId": "stitched-together"},
            {"type": "note", "text": "Situational."},
        ]
        result = self.run_on(data)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_unknown_stat(self) -> None:
        self.assert_error(lambda d: self.perk(d)["effects"].append(
            {"type": "modifier", "stat": "skill.lockpick", "value": 1}), "'skill.lockpick'")

    def test_unknown_effect_type(self) -> None:
        self.assert_error(lambda d: self.perk(d)["effects"].append({"type": "buff"}),
                          "unknown effect type 'buff'")

    def test_extra_key(self) -> None:
        self.assert_error(lambda d: self.perk(d)["effects"].append(
            {"type": "note", "text": "x", "stat": "hp"}), "unknown key 'stat'")

    def test_bad_expr_arity(self) -> None:
        self.assert_error(lambda d: self.perk(d)["effects"].append(
            {"type": "modifier", "stat": "hp", "value": {"op": "floor", "args": [1, 2]}}),
            "floor takes 1 args, got 2")

    def test_rank_outside_perk(self) -> None:
        def mutate(d):
            d["traits"][0]["effects"].append(
                {"type": "modifier", "stat": "hp", "value": {"ref": "rank"}})
        self.assert_error(mutate, "only meaningful on perks")

    def test_unknown_damage_type(self) -> None:
        self.assert_error(lambda d: self.perk(d)["effects"].append(
            {"type": "resistance", "to": "damage.psychic"}), "'damage.psychic'")

    def test_grant_unknown_perk(self) -> None:
        self.assert_error(lambda d: self.perk(d)["effects"].append(
            {"type": "grantPerk", "perkId": "nope"}), "no perk with id 'nope'")

    def test_clamp_without_bounds(self) -> None:
        self.assert_error(lambda d: self.perk(d)["effects"].append(
            {"type": "clamp", "stat": "ac"}), "clamp needs min, max or both")

    def test_duplicate_id(self) -> None:
        self.assert_error(lambda d: d["perks"].append(copy.deepcopy(d["perks"][0])),
                          "duplicate id")

    def test_variant_replaces_unknown_feature(self) -> None:
        def mutate(d):
            race = next(r for r in d["races"] if r["variants"])
            race["variants"][0]["replaces"].append("ghost-feature")
        self.assert_error(mutate, "no base feature 'ghost-feature'")

    def test_override_not_applied(self) -> None:
        overrides = {"perks": {"adaptive-reflexes": {"effects": [{"type": "note", "text": "x"}]}}}
        self.assert_error(lambda d: None, "differs from the generated file", overrides)

    def test_override_applied_passes(self) -> None:
        data = copy.deepcopy(self.real)
        self.perk(data)["effects"] = [{"type": "note", "text": "x"}]
        result = self.run_on(data, {"perks": {"adaptive-reflexes": {"effects": [{"type": "note", "text": "x"}]}}})
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
