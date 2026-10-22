import { useEffect, useState } from "react";
import { loadBundledRules } from "../engine/data";
import { createHttpApi, type Api } from "./api";
import { CharacterList } from "./CharacterList";
import { PartyView } from "./PartyView";
import { SheetPage } from "./SheetPage";

const defaultApi = createHttpApi();
const rules = loadBundledRules();

/** Hash routes: `#/` is the list, `#/c/<id>` a character, `#/party` the party view. */
function idFromHash(): string | null {
  const m = /^#\/c\/([A-Za-z0-9_-]+)$/.exec(window.location.hash);
  return m?.[1] ?? null;
}

const isPartyHash = () => window.location.hash === "#/party";

export function App({ api = defaultApi }: { api?: Api }) {
  const [id, setId] = useState(idFromHash);
  const [party, setParty] = useState(isPartyHash);

  useEffect(() => {
    const onChange = () => {
      setId(idFromHash());
      setParty(isPartyHash());
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return (
    <main>
      <h1>Fallout TTRPG Character Sheet</h1>
      {id ? (
        <SheetPage api={api} rules={rules} id={id} onBack={() => (window.location.hash = "#/")} />
      ) : party ? (
        <>
          <button type="button" onClick={() => (window.location.hash = "#/")}>
            ← Characters
          </button>
          <PartyView api={api} rules={rules} onOpen={(cid) => (window.location.hash = `#/c/${cid}`)} />
        </>
      ) : (
        <CharacterList api={api} rules={rules} onOpen={(cid) => (window.location.hash = `#/c/${cid}`)} />
      )}
    </main>
  );
}
