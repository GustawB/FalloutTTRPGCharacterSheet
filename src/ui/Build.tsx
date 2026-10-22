import type { SkillId } from "../engine/vocab";
import { SKILLS } from "../engine/vocab";
import type { Character } from "../engine/character";
import type { Rules } from "../engine/rules";
import { variantConflict } from "../engine/race";
import { MAX_TRAITS } from "../engine/traits";
import { EntryPicker } from "./EntryPicker";
import { EntryTooltip } from "./EntryTooltip";

const label = (id: string) => id.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/** Race, background and trait selection. Changes go straight to the character; the sheet recomputes. */
export function Build({ character, rules, onChange }: { character: Character; rules: Rules; onChange: (c: Character) => void }) {
  const race = rules.raceById.get(character.race.id);
  const subtype = race?.subtypes?.find((s) => s.id === character.race.subtype);
  const toolChoice = subtype?.toolChoice;
  const setRace = (patch: Partial<Character["race"]>) => onChange({ ...character, race: { ...character.race, ...patch } });

  const background = rules.backgroundById.get(character.background.id);
  const skillOptions: readonly SkillId[] = background?.skills ?? SKILLS;
  const setSkill = (i: number, s: SkillId) => {
    const skills = [...character.background.skills] as Character["background"]["skills"];
    skills[i] = s;
    onChange({ ...character, background: { ...character.background, skills } });
  };

  const setTrait = (i: number, patch: Partial<Character["traits"][number]>) =>
    onChange({ ...character, traits: character.traits.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  return (
    <section aria-label="Build">
      <h2>Race</h2>
      <label>
        Race{" "}
        <select
          value={character.race.id}
          onChange={(e) => {
            const next = rules.raceById.get(e.target.value as Character["race"]["id"]);
            // Subtype, variants and tools belong to the old race.
            onChange({ ...character, race: { id: next?.id ?? character.race.id, variants: [] } });
          }}
        >
          {rules.races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      {race?.subtypes && race.subtypes.length > 0 && (
        <div>
          <label>
            Subtype{" "}
            <select
              value={character.race.subtype ?? ""}
              onChange={(e) => {
                const { tools: _tools, subtype: _subtype, ...rest } = character.race;
                onChange({ ...character, race: e.target.value ? { ...rest, subtype: e.target.value } : rest });
              }}
            >
              <option value="">Choose a subtype…</option>
              {race.subtypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {!subtype && <span role="note"> {race.name} requires a subtype</span>}
        </div>
      )}
      {toolChoice && (
        <fieldset>
          <legend>{subtype!.name} tools ({toolChoice.count})</legend>
          <p>{toolChoice.description}</p>
          {Array.from({ length: toolChoice.count }, (_, i) => (
            <label key={i}>
              Tool {i + 1}{" "}
              <select
                value={character.race.tools?.[i] ?? ""}
                // Tools are stored as a packed list, so fill the slots in order.
                disabled={i > (character.race.tools?.length ?? 0)}
                onChange={(e) => {
                  const tools = Array.from({ length: toolChoice.count }, (_, j) => character.race.tools?.[j] ?? "");
                  tools[i] = e.target.value;
                  setRace({ tools: tools.every(Boolean) ? tools : tools.filter(Boolean) });
                }}
              >
                <option value="">Choose a tool…</option>
                {toolChoice.options.map((o) => <option key={o.id} value={o.id} title={o.text}>{o.name}</option>)}
              </select>
            </label>
          ))}
        </fieldset>
      )}
      {race && race.variants.length > 0 && (
        <fieldset>
          <legend>Variants</legend>
          {race.variants.map((v) => {
            const checked = character.race.variants.includes(v.id);
            const conflict = checked ? null : variantConflict(race, character.race.variants, v.id);
            return (
              <div key={v.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={conflict !== null}
                    onChange={(e) =>
                      setRace({
                        variants: e.target.checked
                          ? [...character.race.variants, v.id]
                          : character.race.variants.filter((x) => x !== v.id),
                      })
                    }
                  />{" "}
                  {v.name}
                </label>
                {conflict && <span role="note"> {conflict}</span>}
              </div>
            );
          })}
        </fieldset>
      )}

      <h2>Background</h2>
      <label>
        Background{" "}
        <select
          value={character.background.id}
          onChange={(e) => {
            const next = rules.backgroundById.get(e.target.value);
            // Keep picks that are still allowed, fill the rest from the new list.
            const allowed = next?.skills ?? null;
            const kept = character.background.skills.map((s) => (allowed && !allowed.includes(s) ? null : s));
            const fill = (allowed ?? SKILLS).filter((s) => !kept.includes(s));
            const skills = kept.map((s) => s ?? fill.shift()!) as Character["background"]["skills"];
            onChange({ ...character, background: { id: e.target.value, skills } });
          }}
        >
          {rules.backgrounds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      {[0, 1, 2].map((i) => (
        <label key={i}>
          {" "}Background skill {i + 1}{" "}
          <select value={character.background.skills[i]} onChange={(e) => setSkill(i, e.target.value as SkillId)}>
            {skillOptions.map((s) => (
              <option key={s} value={s} disabled={character.background.skills.some((x, j) => j !== i && x === s)}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
      ))}

      <h2>Traits</h2>
      {character.traits.map((t, i) => {
        const trait = rules.traitById.get(t.id);
        const variants = trait?.wildWasteland ?? [];
        return (
          <div key={t.id}>
            {trait ? <EntryTooltip entry={trait} /> : <strong>{t.id}</strong>}{" "}
            {variants.length > 0 && (
              <label>
                <input type="checkbox" checked={t.wildWasteland} onChange={(e) => setTrait(i, { wildWasteland: e.target.checked })} />{" "}
                Wild Wasteland ({trait!.name})
              </label>
            )}
            {t.wildWasteland && variants.length > 1 && (
              <label>
                {" "}Variant{" "}
                <select value={t.variant ?? 0} onChange={(e) => setTrait(i, { variant: Number(e.target.value) })}>
                  {variants.map((v, k) => <option key={k} value={k}>{v.label ?? `Option ${k + 1}`}</option>)}
                </select>
              </label>
            )}{" "}
            <button type="button" onClick={() => onChange({ ...character, traits: character.traits.filter((_, j) => j !== i) })}>
              Remove {trait?.name ?? t.id}
            </button>
          </div>
        );
      })}
      <EntryPicker kind="trait" label="Add trait" character={character} rules={rules}
        blocked={character.traits.length >= MAX_TRAITS ? `Maximum of ${MAX_TRAITS} traits` : null}
        onPick={(id) => character.traits.length < MAX_TRAITS && onChange({ ...character, traits: [...character.traits, { id, wildWasteland: false }] })} />
    </section>
  );
}
