import { useEffect, useState } from "react";
import type { Character } from "../engine/character";
import type { Api } from "./api";
import type { Rules } from "../engine/rules";
import { Sheet } from "./Sheet";
import { useAutosave } from "./useAutosave";

/** Shell for one character: loads it and autosaves edits. */
export function SheetPage({ api, rules, id, onBack }: { api: Api; rules: Rules; id: string; onBack: () => void }) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setCharacter(null);
    setError(null);
    api.get(id).then(
      (c) => live && setCharacter(c),
      (e: unknown) => live && setError(`Could not load character: ${e instanceof Error ? e.message : String(e)}`),
    );
    return () => {
      live = false;
    };
  }, [api, id]);

  return (
    <section>
      <button type="button" onClick={onBack}>
        ← Characters
      </button>
      {error && <p role="alert">{error}</p>}
      {!character && !error && <p>Loading…</p>}
      {character && <Loaded api={api} rules={rules} initial={character} />}
    </section>
  );
}

function Loaded({ api, rules, initial }: { api: Api; rules: Rules; initial: Character }) {
  const [character, setCharacter] = useState(initial);
  const save = useAutosave(api, character);
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
      <Sheet character={character} rules={rules} onChange={setCharacter} />
    </div>
  );
}
