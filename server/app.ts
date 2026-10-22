import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import { createServer as createHttpServer, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";

/** Must equal CHARACTER_SCHEMA_VERSION in src/engine/character.ts (a test checks). */
export const SUPPORTED_SCHEMA_VERSION = 1;

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_BODY_BYTES = 5_000_000;

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req: AsyncIterable<Buffer | string>): Promise<string> {
  return (async () => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > MAX_BODY_BYTES) throw new HttpError(413, "body too large");
      chunks.push(buf);
    }
    return Buffer.concat(chunks).toString("utf8");
  })();
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Serves `GET /api/characters`, `GET|PUT /api/characters/:id`, storing `<dir>/<id>.json`. */
export function createServer(dir: string): Server {
  const fileFor = (id: string) => join(dir, `${id}.json`);

  async function handle(method: string, path: string, req: AsyncIterable<Buffer | string>, res: ServerResponse) {
    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "api" || parts[1] !== "characters" || parts.length > 3) {
      throw new HttpError(404, "not found");
    }
    const id = parts[2];

    if (id === undefined) {
      if (method !== "GET") throw new HttpError(405, "method not allowed");
      const files = await readdir(dir).catch((e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return [] as string[];
        throw e;
      });
      const list: { id: string; name: unknown; level: unknown }[] = [];
      for (const file of files.filter((f) => f.endsWith(".json") && ID_PATTERN.test(f.slice(0, -5))).sort()) {
        try {
          const c: unknown = JSON.parse(await readFile(join(dir, file), "utf8"));
          if (isRecord(c)) list.push({ id: file.slice(0, -5), name: c.name, level: c.level });
        } catch {
          // skip unreadable or corrupt files
        }
      }
      return send(res, 200, list);
    }

    if (!ID_PATTERN.test(id)) throw new HttpError(400, "invalid character id");

    if (method === "GET") {
      let text: string;
      try {
        text = await readFile(fileFor(id), "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(404, "character not found");
        throw e;
      }
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(text),
      });
      return void res.end(text);
    }

    if (method === "PUT") {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(400, "body is not valid JSON");
      }
      if (!isRecord(body)) throw new HttpError(400, "body must be a JSON object");
      if (body.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
        throw new HttpError(409, `unsupported schemaVersion ${JSON.stringify(body.schemaVersion)}; expected ${SUPPORTED_SCHEMA_VERSION}`);
      }
      if (body.id !== id) throw new HttpError(422, "body id does not match the URL");
      await mkdir(dir, { recursive: true });
      const tmp = join(dir, `.${id}.${randomUUID()}.tmp`);
      try {
        await writeFile(tmp, JSON.stringify(body, null, 2) + "\n");
        await rename(tmp, fileFor(id));
      } catch (e) {
        await rm(tmp, { force: true });
        throw e;
      }
      return send(res, 200, { id });
    }

    throw new HttpError(405, "method not allowed");
  }

  return createHttpServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    handle(req.method ?? "GET", path, req, res).catch((e: unknown) => {
      if (res.headersSent) return void res.end();
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: "internal error" });
    });
  });
}
