import type { Character } from "../engine/character";

export type CharacterSummary = { id: string; name: string; level: number };

/** Client for the local save server (server/app.ts). The server has no delete. */
export type Api = {
  list(): Promise<CharacterSummary[]>;
  get(id: string): Promise<Character>;
  put(character: Character): Promise<void>;
};

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  let detail = "";
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "error" in body) detail = `: ${String(body.error)}`;
  } catch {
    // no JSON body
  }
  throw new Error(`server returned ${res.status}${detail}`);
}

export function createHttpApi(base = "/api/characters"): Api {
  return {
    async list() {
      return (await check(await fetch(base))).json() as Promise<CharacterSummary[]>;
    },
    async get(id) {
      return (await check(await fetch(`${base}/${encodeURIComponent(id)}`))).json() as Promise<Character>;
    },
    async put(character) {
      await check(
        await fetch(`${base}/${encodeURIComponent(character.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(character),
        }),
      );
    },
  };
}
