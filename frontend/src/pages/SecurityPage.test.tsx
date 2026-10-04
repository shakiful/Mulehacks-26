import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMockApi } from "../api/mock";
import { ApiError } from "../api/errors";
import type { SecurityResult } from "../api/types";
import { ApiProvider, useApi } from "../context/ApiContext";
import SecurityPage from "./SecurityPage";

const example: SecurityResult = {
  risk_level: "HIGH", summary: "The message has warning signs consistent with phishing.",
  reasons: [{ code: "URGENCY", description: "Pressures you to act immediately" }],
  recommendation: "Verify through a known official channel.",
  limitations: "No link was visited. Safety is not guaranteed. LOW does not mean safe.",
  analysis_mode: "LLM",
};
function AccountSwitch() {
  const { user, signOut, signIn } = useApi();
  return <><span>{user?.username}</span><button onClick={async () => {
    await signOut(); await signIn("afsana", "fixture-only");
  }}>Sign in as Afsana</button></>;
}
async function setup(mockMode = false) {
  const api = createMockApi({ initialUser: { id: 1, name: "Rafi", username: "rafi" }, delayMs: 0 });
  const analyzeSecurity = vi.fn(api.analyzeSecurity).mockResolvedValue(example);
  const createPost = vi.fn(api.createPost);
  const mounted = render(<ApiProvider client={{ ...api, analyzeSecurity, createPost }} mockMode={mockMode}>
    <AccountSwitch /><SecurityPage />
  </ApiProvider>);
  await screen.findByText("rafi");
  return { analyzeSecurity, createPost, mounted, user: userEvent.setup() };
}
describe("private security assessment", () => {
  it("shows privacy and validates empty/oversized input before calling the API", async () => {
    const { analyzeSecurity, user } = await setup();
    expect(screen.getByText(/Online analysis sends the text to Gemini/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready when you are." })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Assess risk" }));
    expect(screen.getByRole("textbox", { name: "Message or URL text" })).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByRole("textbox", { name: "Message or URL text" }), { target: { value: "x".repeat(8001) } });
    await user.click(screen.getByRole("button", { name: "Assess risk" }));
    expect(screen.getByText("Enter between 1 and 8,000 characters.")).toBeInTheDocument();
    expect(analyzeSecurity).not.toHaveBeenCalled();
  });

  it("renders evidence, guidance and limitations without creating posts or clickable submitted links", async () => {
    const { analyzeSecurity, createPost, user } = await setup();
    const message = 'Your account expires today. https://login-example.test <img src=x onerror=alert(1)>';
    fireEvent.change(screen.getByRole("textbox", { name: "Message or URL text" }), { target: { value: message } });
    await user.click(screen.getByRole("button", { name: "Assess risk" }));
    await screen.findByRole("heading", { name: "HIGH risk" });
    expect(analyzeSecurity).toHaveBeenCalledWith(message);
    expect(screen.getByText("Analysis mode: llm")).toBeInTheDocument();
    expect(screen.getByText("Pressures you to act immediately")).toBeInTheDocument();
    expect(screen.getByText(/Safety is not guaranteed/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(createPost).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Clear analysis" }));
    expect(screen.getByRole("textbox", { name: "Message or URL text" })).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Security assessment" })).not.toBeInTheDocument();
  });

  it("labels heuristic and LOW results without calling them safe", async () => {
    const { analyzeSecurity, user } = await setup();
    analyzeSecurity.mockResolvedValue({ ...example, risk_level: "LOW", reasons: [], analysis_mode: "HEURISTIC",
      limitations: example.limitations + " Gemini is unavailable; a rule-based fallback was used." });
    await user.type(screen.getByRole("textbox", { name: "Message or URL text" }), "Hello campus");
    await user.click(screen.getByRole("button", { name: "Assess risk" }));
    await screen.findByRole("heading", { name: "LOW risk" });
    expect(screen.getByText("Analysis mode: heuristic")).toBeInTheDocument();
    expect(screen.getByText(/No supported warning signs/)).toBeInTheDocument();
    expect(screen.getByText(/rule-based fallback/)).toBeInTheDocument();
  });

  it("shows loading, prevents duplicate submissions, and preserves text on failure for retry", async () => {
    const { analyzeSecurity, user } = await setup();
    let reject: (reason: unknown) => void = () => {};
    analyzeSecurity.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    await user.type(screen.getByRole("textbox", { name: "Message or URL text" }), "Synthetic private message");
    await user.click(screen.getByRole("button", { name: "Assess risk" }));
    expect(screen.getByRole("status")).toHaveTextContent("Assessing text");
    expect(screen.getByRole("button", { name: "Assessing message…" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Message or URL text" })).toBeDisabled();
    await act(async () => reject(new ApiError(503, { error: { code: "PROVIDER_UNAVAILABLE", message: "Provider unavailable", details: [] } })));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider unavailable");
    expect(screen.getByRole("textbox", { name: "Message or URL text" })).toHaveValue("Synthetic private message");
    analyzeSecurity.mockResolvedValue(example);
    await user.click(screen.getByRole("button", { name: "Assess risk" }));
    await screen.findByRole("heading", { name: "HIGH risk" });
    expect(analyzeSecurity).toHaveBeenCalledTimes(2);
  });

  it("clears private drafts and ignores late results after logout and account change", async () => {
    const { analyzeSecurity, user } = await setup();
    let resolve: (value: SecurityResult) => void = () => {};
    analyzeSecurity.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await user.type(screen.getByRole("textbox", { name: "Message or URL text" }), "Private synthetic draft");
    await user.click(screen.getByRole("button", { name: "Assess risk" }));
    await user.click(screen.getByRole("button", { name: "Sign in as Afsana" }));
    await screen.findByText("afsana");
    expect(screen.getByRole("textbox", { name: "Message or URL text" })).toHaveValue("");
    await act(async () => resolve(example));
    expect(screen.queryByRole("region", { name: "Security assessment" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assess risk" })).toBeEnabled();
  });

  it("removes stale results when the message is edited and keeps no draft after remount", async () => {
    const { user, mounted } = await setup();
    await user.type(screen.getByRole("textbox", { name: "Message or URL text" }), "Synthetic message");
    await user.click(screen.getByRole("button", { name: "Assess risk" }));
    await screen.findByRole("heading", { name: "HIGH risk" });
    await user.type(screen.getByRole("textbox", { name: "Message or URL text" }), " changed");
    expect(screen.queryByRole("region", { name: "Security assessment" })).not.toBeInTheDocument();
    mounted.unmount();
    await setup();
    expect(screen.getByRole("textbox", { name: "Message or URL text" })).toHaveValue("");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ready when you are." })).toBeInTheDocument());
  });

  it("labels fixture mode as a canned assessment", async () => {
    await setup(true);
    expect(screen.getByText(/Mock mode returns a canned example/)).toBeInTheDocument();
    expect(screen.queryByText(/Online analysis sends/)).not.toBeInTheDocument();
  });
});
