import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// Local public map keys must not make automatic preview tests contact a real provider.
beforeEach(() => vi.stubEnv('VITE_MAPTILER_API_KEY', ''));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
