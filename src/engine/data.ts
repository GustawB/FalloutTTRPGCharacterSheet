// The only module that imports the JSON files; the engine itself does no I/O.
import backgrounds from "../../data/backgrounds.json";
import perks from "../../data/perks.json";
import races from "../../data/races.json";
import traits from "../../data/traits.json";
import { loadRules, type Rules, type RulesData } from "./rules";

/** The rules bundled with the app. The JSON is validated by scripts/validate_rules.py. */
export function loadBundledRules(): Rules {
  return loadRules({ perks, traits, backgrounds, races } as unknown as RulesData);
}
