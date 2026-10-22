import { useEffect, useState } from "react";
import { newCharacter } from "../engine/character";
import type { Rules } from "../engine/rules";
import type { RaceId } from "../engine/vocab";
import type { Api, CharacterSummary } from "./api";

export function CharacterList({
  api,
  rules,
  onOpen,
}: {
  api: Api;
  rules: Rules;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<CharacterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [race, setRace] = useState<RaceId>("human");

  useEffect(() => {
    let live = true;
    api.list().then(
      (r) => live && setRows(r),
      (e: unknown) => live && setError(`Could not load characters: ${e instanceof Error ? e.message : String(e)}`),
    );
    return () => {
      live = false;
    };
  }, [api]);

  const raceName = (id?: string) => {
    const r = rules.races.find((x) => x.id === id);
    return r ? `${r.name}, ` : "";
  };

  async function create() {
    const c = newCharacter(crypto.randomUUID(), name.trim());
    const subtype = rules.races.find((r) => r.id === race)?.subtypes?.[0]?.id;
    c.race = { id: race, variants: [], ...(subtype && { subtype }) };
    try {
      await api.put(c);
      onOpen(c.id);
    } catch (e) {
      setError(`Could not create character: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <section>
      <h2>Characters</h2>
      <p>
        <a href="#/party">Party view</a>
      </p>
      {error && <p role="alert">{error}</p>}
      {rows === null && !error && <p>Loading…</p>}
      {rows?.length === 0 && <p>No characters yet.</p>}
      {rows && rows.length > 0 && (
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onOpen(r.id)}>
                {r.name || "(unnamed)"}
              </button>{" "}
              — {raceName(r.race)}level {r.level}
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <h3>New character</h3>
        <label>
          Name <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>{" "}
        <label>
          Race{" "}
          <select value={race} onChange={(e) => setRace(e.target.value as RaceId)}>
            {rules.races.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="submit">Create</button>
      </form>
    </section>
  );
}
