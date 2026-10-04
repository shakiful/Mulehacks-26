import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockApi } from "../api/mock";
import { ApiProvider, useApi } from "./ApiContext";

function Mode() {
  return <span>{useApi().isMock ? "fixture" : "live"}</span>;
}
afterEach(() => vi.unstubAllEnvs());
describe("provider selection", () => {
  it.each([undefined, "false", ""])("uses the live backend when mock mode is %s", (value) => {
    vi.stubEnv("VITE_USE_MOCKS", value);
    render(<ApiProvider client={createMockApi({ delayMs: 0 })}><Mode /></ApiProvider>);
    expect(screen.getByText("live")).toBeInTheDocument();
  });
  it("retains explicit fixture mode", () => {
    vi.stubEnv("VITE_USE_MOCKS", "true");
    render(<ApiProvider client={createMockApi({ delayMs: 0 })}><Mode /></ApiProvider>);
    expect(screen.getByText("fixture")).toBeInTheDocument();
  });
});
