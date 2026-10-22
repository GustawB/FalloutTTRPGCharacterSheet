import { useEffect, useState } from "react";
import type { Character } from "../engine/character";
import type { Api } from "./api";
import type { Rules } from "../engine/rules";
import { partyContextFor } from "../engine/party";
import { Sheet } from "./Sheet";
import { useAutosave } from "./useAutosave";

/** Shell for one character: loads it and autosaves edits. */
export function SheetPage({ api, rules, id, onBack }: { api: Api; rules: Rules; id: string; onBack: () => void }) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [roster, setRoster] = useState<(Character | null)[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setCharacter(null);
    setRoster([]);
    setError(null);
    api.get(id).then(
      (c) => live && setCharacter(c),
      (e: unknown) => live && setError(`Could not load character: ${e instanceof Error ? e.message : String(e)}`),
    );
    return () => {
      live = false;
    };
  }, [api, id]);

  // Party members (list order, this character included) for the party stats; a failure leaves them as "—".
  const partyId = character?.partyId;
  useEffect(() => {
    if (!partyId) return;
    let live = true;
    api
      .list()
      .then((rows) => Promise.all(rows.filter((r) => r.partyId === partyId).map((r) => (r.id === id ? null : api.get(r.id)))))
      .then(
        (cs) => live && setRoster(cs),
        () => {},
      );
    return () => {
      live = false;
    };
  }, [api, id, partyId]);

  return (
    <section>
      <button type="button" onClick={onBack}>
        ← Characters
      </button>
      {error && <p role="alert">{error}</p>}
      {!character && !error && <p>Loading…</p>}
      {character && <Loaded api={api} rules={rules} initial={character} roster={roster} />}
    </section>
  );
}

/** `roster` is the saved party in list order, with `null` in this character's slot. */
function Loaded({ api, rules, initial, roster }: { api: Api; rules: Rules; initial: Character; roster: (Character | null)[] }) {
  const [character, setCharacter] = useState(initial);
  const save = useAutosave(api, character);
  // The edited character stands in for its saved copy, so party stats follow edits live.
  const members = roster.map((m) => m ?? character);
  const party = character.partyId && members.length > 0 ? partyContextFor(members, roster.indexOf(null), rules) : undefined;
  return (
    <div>
      <label>
        Name <input value={character.name} onChange={(e) => setCharacter({ ...character, name: e.target.value })} />
      </label>
      <p role="status">
        {save.status === "saved" && "Saved"}
        {save.status === "saving" && "Saving…"}
        {save.status === "error" && `Save failed: ${save.message}`}
      </p>
      <Sheet character={character} rules={rules} party={party} onChange={setCharacter} />
    </div>
  );
}
