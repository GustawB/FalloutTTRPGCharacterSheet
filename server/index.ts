import { resolve } from "node:path";
import { createServer } from "./app.ts";

const dir = resolve(process.env.CHARACTERS_DIR ?? "characters");
const port = Number(process.env.PORT ?? 5174);

createServer(dir).listen(port, "127.0.0.1", () => {
  console.log(`Save server on http://127.0.0.1:${port}, characters in ${dir}`);
});
