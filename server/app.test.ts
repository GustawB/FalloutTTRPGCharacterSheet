import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHARACTER_SCHEMA_VERSION, newCharacter } from "../src/engine/character";
import { createServer, SUPPORTED_SCHEMA_VERSION } from "./app";

let dir: string;
let server: Server;
let base: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "chars-"));
  server = createServer(dir);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

const put = (id: string, body: unknown) =>
  fetch(`${base}/api/characters/${id}`, { method: "PUT", body: JSON.stringify(body) });

describe("save server", () => {
  it("supports the engine's schema version", () => {
    expect(SUPPORTED_SCHEMA_VERSION).toBe(CHARACTER_SCHEMA_VERSION);
  });

  it("round-trips a character and leaves no temp files", async () => {
    const c = newCharacter("abc", "Vera");
    expect((await put("abc", c)).status).toBe(200);
    const res = await fetch(`${base}/api/characters/abc`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(c);
    expect(await readdir(dir)).toEqual(["abc.json"]);
  });

  it("lists saved characters", async () => {
    expect(await (await fetch(`${base}/api/characters`)).json()).toEqual([]);
    await put("b", { ...newCharacter("b", "Bea"), level: 3 });
    await put("a", newCharacter("a", "Al"));
    expect(await (await fetch(`${base}/api/characters`)).json()).toEqual([
      { id: "a", name: "Al", race: "human", level: 1 },
      { id: "b", name: "Bea", race: "human", level: 3 },
    ]);
  });

  it("omits files whose names are not valid ids from the list", async () => {
    await writeFile(join(dir, "a.b.json"), JSON.stringify(newCharacter("a.b")));
    await put("ok", newCharacter("ok", "Ok"));
    const ids = ((await (await fetch(`${base}/api/characters`)).json()) as { id: string }[]).map((c) => c.id);
    expect(ids).toEqual(["ok"]);
  });

  it("rejects an unknown schemaVersion with 409", async () => {
    const res = await put("abc", { ...newCharacter("abc"), schemaVersion: 99 });
    expect(res.status).toBe(409);
    expect((await fetch(`${base}/api/characters/abc`)).status).toBe(404);
  });

  it("rejects bad ids and mismatched bodies", async () => {
    expect((await fetch(`${base}/api/characters/..%2Fx`)).status).toBe(400);
    expect((await put("..%2Fx", newCharacter("x"))).status).toBe(400);
    expect((await put("a.b", newCharacter("a.b"))).status).toBe(400);
    expect((await put("abc", newCharacter("other"))).status).toBe(422);
    expect((await fetch(`${base}/api/characters/abc`, { method: "PUT", body: "{" })).status).toBe(400);
  });

  it("returns 404 for a missing id and unknown routes", async () => {
    expect((await fetch(`${base}/api/characters/nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/other`)).status).toBe(404);
  });
});
