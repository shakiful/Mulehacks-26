import { isIP } from "node:net";

export function netlifyConfig(env) {
  const mode = (env.VITE_USE_MOCKS ?? "false").trim();
  if (!["true", "false"].includes(mode)) throw new Error("VITE_USE_MOCKS must be true or false.");
  if (env.VITE_API_BASE_URL && env.VITE_API_BASE_URL !== "/api")
    throw new Error("Netlify uses VITE_API_BASE_URL=/api so session cookies remain on the site domain.");
  for (const [name, value] of Object.entries(env)) {
    if (value && name !== "VITE_MAPTILER_API_KEY" && /^VITE_.*(?:SECRET|PASSWORD|TOKEN|API_KEY)$/i.test(name))
      throw new Error("Backend credentials must not use VITE_ variables. Store them only on Render.");
  }
  if (mode === "true") return {
    mode,
    redirects: "/api /api-unavailable.json 404!\n/api/* /api-unavailable.json 404!\n/* /index.html 200\n",
  };
  const raw = (env.BACKEND_URL ?? "").trim();
  const invalid = () => new Error("Set BACKEND_URL to your public HTTPS backend origin, such as https://your-api.onrender.com (without /api, a path, or credentials).");
  if (!raw || /[\s\\]/.test(raw)) throw invalid();
  let backend;
  try { backend = new URL(raw); } catch { throw invalid(); }
  const host = backend.hostname;
  if (backend.protocol !== "https:" || backend.username || backend.password || backend.search || backend.hash ||
      backend.pathname !== "/" || isIP(host) || !host.includes(".") ||
      /(?:^|\.)(?:localhost|local|internal|netlify\.app)$/.test(host)) throw invalid();
  for (const site of [env.URL, env.DEPLOY_URL, env.DEPLOY_PRIME_URL]) {
    if (site && new URL(site).origin === backend.origin) throw invalid();
  }
  return {
    mode,
    redirects: `/api ${backend.origin}/api 200!\n/api/* ${backend.origin}/api/:splat 200!\n/* /index.html 200\n`,
  };
}
