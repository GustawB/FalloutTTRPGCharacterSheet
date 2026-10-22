import { useEffect, useState } from "react";
import type { Character } from "../engine/character";
import type { Rules } from "../engine/rules";
import { computePartySheet } from "../engine/party";
import type { StatResult } from "../engine/sheet";
import type { Api } from "./api";
import { Breakdown } from "./Breakdown";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Stat({ stat }: { stat: StatResult | null }) {
  return stat ? <Breakdown value={stat.value} lines={stat.breakdown} /> : <span>—</span>;
}

/** Loads every saved character, assigns them to parties via `partyId`, and shows one party's stats. */
export function PartyView({ api, rules, onOpen }: { api: Api; rules: Rules; onOpen: (id: string) => void }) {
  const [all, setAll] = useState<Character[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [extra, setExtra] = useState<string[]>([]);
  const [newParty, setNewParty] = useState("");

  useEffect(() => {
    let live = true;
    api
      .list()
      .then((rows) => Promise.all(rows.map((r) => api.get(r.id))))
      .then(
        (cs) => live && setAll(cs),
        (e: unknown) => live && setError(`Could not load characters: ${errorText(e)}`),
      );
    return () => {
      live = false;
    };
  }, [api]);

  const parties = [...new Set([...(all ?? []).flatMap((c) => (c.partyId ? [c.partyId] : [])), ...extra])];
  const current = parties.includes(selected) ? selected : (parties[0] ?? "");
  const members = (all ?? []).filter((c) => c.partyId === current && current !== "");
  const party = computePartySheet(members, rules);

  async function assign(c: Character, partyId: string) {
    const { partyId: _old, ...rest } = c;
    const next: Character = partyId ? { ...rest, partyId } : rest;
    try {
      await api.put(next);
      setError(null);
      setAll((cs) => cs && cs.map((x) => (x.id === c.id ? next : x)));
    } catch (e) {
      setError(`Could not save ${c.name || "character"}: ${errorText(e)}`);
    }
  }

  return (
    <section aria-label="Party">
      <h2>Party</h2>
      {error && <p role="alert">{error}</p>}
      {all === null && !error && <p>Loading…</p>}
      {all && (
        <>
          <label>
            Party{" "}
            <select value={current} onChange={(e) => setSelected(e.target.value)}>
              {parties.length === 0 && <option value="">(no parties)</option>}
              {parties.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = newParty.trim();
              if (!name) return;
              setExtra((x) => (x.includes(name) ? x : [...x, name]));
              setSelected(name);
              setNewParty("");
            }}
          >
            <label>
              New party <input value={newParty} onChange={(e) => setNewParty(e.target.value)} />
            </label>{" "}
            <button type="submit">Add party</button>
          </form>

          <div>Party nerve <span data-testid="party-partyNerve"><Stat stat={party.party.partyNerve} /></span></div>
          <div>Group sneak <span data-testid="party-groupSneak"><Stat stat={party.party.groupSneak} /></span></div>

          {members.length === 0 ? (
            <p>No members in this party.</p>
          ) : (
            <table aria-label="Members">
              <thead>
                <tr><th>Name</th><th>Level</th><th>HP</th><th>SP</th><th>AC</th><th>Sneak</th><th>Death save</th></tr>
              </thead>
              <tbody>
                {members.map((c, i) => {
                  const s = party.sheets[i]!;
                  return (
                    <tr key={c.id} data-testid={`member-${c.id}`}>
                      <td><button type="button" onClick={() => onOpen(c.id)}>{c.name || "(unnamed)"}</button></td>
                      <td>{c.level}</td>
                      <td><Stat stat={s.derived.hp} /></td>
                      <td><Stat stat={s.derived.sp} /></td>
                      <td><Stat stat={s.derived.ac} /></td>
                      <td><Stat stat={s.skills.sneak} /></td>
                      <td><Stat stat={s.derived.deathSave} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <h3>Assign characters</h3>
          {all.length === 0 && <p>No characters yet.</p>}
          <ul>
            {all.map((c) => (
              <li key={c.id}>
                <label>
                  Party of {c.name || "(unnamed)"}{" "}
                  <select value={c.partyId ?? ""} onChange={(e) => void assign(c, e.target.value)}>
                    <option value="">(none)</option>
                    {parties.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
