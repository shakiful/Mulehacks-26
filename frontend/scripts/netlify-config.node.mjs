// Node's test runner keeps deployment-tool checks separate from browser UI tests.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { netlifyConfig } from "./netlify-config.mjs";

test("Netlify's TOML permits the UI to choose first-deploy fixtures for production", () => {
  // TOML variables override UI variables; production must not hardcode this switch.
  const config = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
  const defaults = config.split("[context.deploy-preview.environment]")[0];
  assert.doesNotMatch(defaults, /^\s*VITE_USE_MOCKS\s*=/m);
  assert.match(config, /\[context\.deploy-preview\.environment\]\s*VITE_USE_MOCKS = "true"/);
});

test("live routes preserve the API prefix before SPA fallback and keep static assets", () => {
  assert.equal(netlifyConfig({ BACKEND_URL: "https://connecthub-api.onrender.com/" }).redirects,
    "/api https://connecthub-api.onrender.com/api 200!\n/api/* https://connecthub-api.onrender.com/api/:splat 200!\n/* /index.html 200\n");
});

test("missing backend never silently builds a localhost client or switches to fixtures", () => {
  assert.throws(() => netlifyConfig({}), /BACKEND_URL/);
  assert.throws(() => netlifyConfig({ BACKEND_URL: "https://api.example.com", VITE_API_BASE_URL: "http://localhost:8000/api" }), /VITE_API_BASE_URL/);
});

test("explicit fixture previews do not forward requests to the production database", () => {
  const result = netlifyConfig({ VITE_USE_MOCKS: "true", BACKEND_URL: "https://live-api.example.com" });
  assert.equal(result.mode, "true");
  assert.match(result.redirects, /^\/api \/api-unavailable\.json 404!/);
  assert.doesNotMatch(result.redirects, /live-api/);
  assert.throws(() => netlifyConfig({ VITE_USE_MOCKS: "maybe" }), /VITE_USE_MOCKS/);
});

test("proxy destinations reject credentials, paths, local addresses and redirect injection", () => {
  for (const BACKEND_URL of ["http://api.example.com", "https://localhost", "https://api.localhost", "https://127.0.0.1",
    "https://api.example.com/api", "https://api.example.com?token=secret", "https://api.example.com/#hash",
    "https://user:secret@api.example.com", "https://api.example.com\n/* /wrong 200", "https:\\\\api.example.com",
    "https://project.netlify.app", "https://api.example.com/%0aanything"])
    assert.throws(() => netlifyConfig({ BACKEND_URL }), /BACKEND_URL/);
});

test("custom site domains cannot proxy recursively into themselves", () => {
  for (const key of ["URL", "DEPLOY_URL", "DEPLOY_PRIME_URL"])
    assert.throws(() => netlifyConfig({ BACKEND_URL: "https://campus.example.com", [key]: "https://campus.example.com" }), /BACKEND_URL/);
});

test("backend secrets cannot become public Vite settings, while the public MapTiler key works", () => {
  for (const key of ["VITE_GEMINI_API_KEY", "VITE_GOOGLE_API_KEY", "VITE_OPENAI_API_KEY", "VITE_RAFI_LOGIN_PASSWORD", "VITE_SESSION_TOKEN"])
    assert.throws(() => netlifyConfig({ VITE_USE_MOCKS: "true", [key]: "synthetic-secret-value" }), /credentials/);
  assert.equal(netlifyConfig({ VITE_USE_MOCKS: "true", VITE_MAPTILER_API_KEY: "synthetic-public-key" }).mode, "true");
});
