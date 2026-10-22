// `npm run dev`: start the local save server and Vite together.
import { spawn } from "node:child_process";

const procs = [
  spawn(process.execPath, ["server/index.ts"], { stdio: "inherit" }),
  spawn("npx", ["vite"], { stdio: "inherit", shell: process.platform === "win32" }),
];
const stop = () => procs.forEach((p) => p.kill());
procs.forEach((p) => p.on("exit", (code) => { stop(); process.exit(code ?? 0); }));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
