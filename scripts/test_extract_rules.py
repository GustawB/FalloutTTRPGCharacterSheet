#!/usr/bin/env python3
"""Tests for extract_rules.py and the curated data: python3 -m unittest discover scripts"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_rules  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "data"


def by_id(name: str) -> dict:
    return dict((e["id"], e) for e in json.loads((DATA / (name + ".json")).read_text()))


class ExtractorTest(unittest.TestCase):
    def test_repeat_sentence_is_not_a_requirement_text(self) -> None:
        raw = dict(name="Deadeye", page=32, body=[
            "Whenever you roll attack, add 2.",
            "Requirements: You can take this perk up to a maximum of three times.",
        ])
        entry = extract_rules.build_entry(raw, "perk", False)
        self.assertEqual(entry["requirements"], [])
        self.assertNotIn("requirementText", entry)
        self.assertEqual(entry["repeat"]["max"], 3)

    def test_real_requirement_text_is_kept(self) -> None:
        raw = dict(name="X", page=32, body=["Requirements: Strength 6.", "Text."])
        entry = extract_rules.build_entry(raw, "perk", False)
        self.assertEqual(entry["requirementText"], "Strength 6")


class CuratedDataTest(unittest.TestCase):
    def test_curated_fixes(self) -> None:
        perks, traits = by_id("perks"), by_id("traits")
        for id_ in ("deadeye", "duelist"):
            self.assertNotIn("requirementText", perks[id_])
            self.assertEqual(perks[id_]["repeat"]["max"], 3)
        self.assertEqual(perks["here-and-now"]["repeat"]["max"], 1)
        self.assertEqual(perks["here-and-now"]["repeat"]["scope"], "party")
        self.assertEqual(traits["skilled"]["wildWasteland"][0]["requirements"],
                         [dict(kind="anyAbility", max=1)])


if __name__ == "__main__":
    unittest.main()
