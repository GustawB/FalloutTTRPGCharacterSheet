import { useEffect, useRef, useState } from "react";
import type { Character } from "../engine/character";
import type { Api } from "./api";

export type SaveState = { status: "saved" } | { status: "saving" } | { status: "error"; message: string };

/** Saves `character` through `api` shortly after it changes (not for the first value, which is already on disk). */
export function useAutosave(api: Api, character: Character, delayMs = 400): SaveState {
  const [state, setState] = useState<SaveState>({ status: "saved" });
  const last = useRef(character);
  const latest = useRef(0);
  const pending = useRef<Character | null>(null);
  const apiRef = useRef(api);
  apiRef.current = api;

  // An edit still waiting for its timer when the page closes (e.g. "back") is saved now.
  useEffect(
    () => () => {
      if (pending.current) void apiRef.current.put(pending.current).catch(() => {});
    },
    [],
  );

  useEffect(() => {
    if (character === last.current) return;
    setState({ status: "saving" });
    const ticket = ++latest.current;
    pending.current = character;
    const timer = setTimeout(() => {
      pending.current = null;
      last.current = character;
      api.put(character).then(
        () => ticket === latest.current && setState({ status: "saved" }),
        (e: unknown) =>
          ticket === latest.current &&
          setState({ status: "error", message: e instanceof Error ? e.message : String(e) }),
      );
    }, delayMs);
    return () => clearTimeout(timer);
  }, [api, character, delayMs]);

  return state;
}
