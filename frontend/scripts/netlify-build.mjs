import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { netlifyConfig } from "./netlify-config.mjs";

try {
  const config = netlifyConfig(process.env);
  const root = fileURLToPath(new URL("../", import.meta.url));
  const { values } = parseArgs({ options: {
    outDir: { type: "string", default: "dist" },
    configLoader: { type: "string", default: "runner" },
  } });
  if (!["bundle", "native", "runner"].includes(values.configLoader)) throw new Error("Invalid Vite config loader.");
  const output = resolve(root, values.outDir);
  const env = { ...process.env, VITE_API_BASE_URL: "/api", VITE_USE_MOCKS: config.mode };
  for (const args of [["node_modules/typescript/bin/tsc", "-b"],
    ["node_modules/vite/bin/vite.js", "build", "--outDir", output, "--configLoader", values.configLoader]]) {
    const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
    if (result.error) throw new Error("Could not run the frontend build. Install dependencies with npm ci.");
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  writeFileSync(resolve(output, "_redirects"), config.redirects);
  writeFileSync(resolve(output, "api-unavailable.json"), JSON.stringify({
    error: { code: "API_UNAVAILABLE", message: "This deploy uses synthetic fixtures and has no live API.", details: [] },
  }));
  console.log(`Netlify build ready: ${config.mode === "true" ? "synthetic fixture preview" : "live API proxy"}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Netlify configuration is invalid.");
  process.exit(1);
}
