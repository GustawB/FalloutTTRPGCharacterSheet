import { useEffect, useState } from "react";
import type { Character } from "../engine/character";
import type { Api } from "./api";
import { useAutosave } from "./useAutosave";

/** Shell for one character: loads it and autosaves edits. Sheet contents come in later issues. */
export function SheetPage({ api, id, onBack }: { api: Api; id: string; onBack: () => void }) {
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
      {character && <Loaded api={api} initial={character} />}
    </section>
  );
}

function Loaded({ api, initial }: { api: Api; initial: Character }) {
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
    </div>
  );
}
