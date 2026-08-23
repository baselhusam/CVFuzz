import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const command = process.argv[2];
if (command !== "dev" && command !== "start") {
  console.error("Usage: node scripts/run-next.mjs <dev|start> [Next.js options]");
  process.exit(1);
}

const projectDir = fileURLToPath(new URL("..", import.meta.url));
loadEnvConfig(projectDir, command === "dev");

const portText = process.env.PORT ?? "3000";
const port = Number(portText);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be an integer between 1 and 65535");
  process.exit(1);
}

const nextBinary = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const child = spawn(
  process.execPath,
  [nextBinary, command, "--port", String(port), ...process.argv.slice(3)],
  { cwd: projectDir, env: process.env, stdio: "inherit" },
);

child.on("error", (error) => {
  console.error(`Unable to start Next.js: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
