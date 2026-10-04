import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import fixtures from "../../../docs/fixtures/api_examples.json";
import { AppRoutes } from "../App";
import { createMockApi } from "../api/mock";
import type { SecurityResult } from "../api/types";
import { ApiProvider } from "../context/ApiContext";

async function setup(text = "Synthetic urgent request: send your password at https://example.invalid/login") {
  const api = createMockApi({ initialUser: { id: 1, name: "Rafi", username: "rafi" }, delayMs: 0 });
  const join = await api.joinPost(7);
  await api.login("afsana", "fixture-only");
  await api.updateJoin(join.id, "ACCEPTED");
  const message = await api.sendMessage("join", join.id, text);
  await api.login("rafi", "fixture-only");
  return { api, join, message };
}
function openChat({ api, join }: Awaited<ReturnType<typeof setup>>) {
  return render(<ApiProvider client={api} mockMode><MemoryRouter initialEntries={[`/messages/join/${join.id}`]}><AppRoutes /></MemoryRouter></ApiProvider>);
}
const result = { ...fixtures.security, analysis_mode: "LLM" } as SecurityResult;

describe("private chat phishing checks", () => {
  it("shows stored message warnings and advice, keeps links/HTML as text, and never automatically requests AI", async () => {
    const data = await setup("<b>send your password</b> javascript:alert(1) https://example.invalid/login");
    await data.api.sendMessage("join", data.join.id, "Synthetic library meeting at six");
    const analyze = vi.spyOn(data.api, "analyzeSecurity");
    const user = userEvent.setup();
    openChat(data);
    const warning = await screen.findByRole("complementary", { name: "Message security warning" });
    expect(warning).toHaveTextContent("Possible phishing · high risk");
    expect(warning).toHaveTextContent("Canned fixture example");
    await user.click(within(warning).getByText("Warning signs and advice"));
    expect(warning).toHaveTextContent("Do not share passwords or verification codes");
    expect(screen.getByRole("log").querySelector("b, a, script")).toBeNull();
    expect(screen.getAllByRole("complementary", { name: "Message security warning" })).toHaveLength(1);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("requires explicit submission after disclosure and sends only the edited text", async () => {
    const data = await setup("Send your password. PRIVATE-SYNTHETIC-DETAIL");
    const analyze = vi.spyOn(data.api, "analyzeSecurity").mockResolvedValue({ ...result, risk_level: "LOW", reasons: [], summary: "Synthetic fewer warning signs" });
    const user = userEvent.setup();
    openChat(data);
    await user.click(await screen.findByRole("button", { name: `Review message ${data.message.id} with AI` }));
    expect(analyze).not.toHaveBeenCalled();
    const panel = screen.getByRole("region", { name: `AI review for message ${data.message.id}` });
    expect(panel).toHaveTextContent("Mock mode returns a canned example");
    await user.clear(within(panel).getByRole("textbox", { name: "Text to check" }));
    await user.type(within(panel).getByRole("textbox", { name: "Text to check" }), "Synthetic: urgently verify your account");
    await user.click(within(panel).getByRole("button", { name: "Analyze selected text" }));
    expect(await screen.findByLabelText("AI message assessment")).toHaveTextContent("Analysis mode: llm");
    expect(screen.getByRole("complementary", { name: "Message security warning" })).toHaveTextContent("Possible phishing · high risk");
    expect(analyze).toHaveBeenCalledExactlyOnceWith("Synthetic: urgently verify your account");
    await user.type(within(panel).getByRole("textbox", { name: "Text to check" }), " edited");
    expect(screen.queryByLabelText("AI message assessment")).not.toBeInTheDocument();
  });

  it("preserves the composer and reviewed text on failure, supports retry, and clears a closed assessment", async () => {
    const data = await setup();
    const analyze = vi.spyOn(data.api, "analyzeSecurity").mockRejectedValueOnce(new Error("Synthetic check unavailable"));
    const user = userEvent.setup();
    openChat(data);
    await user.type(await screen.findByRole("textbox", { name: "Message" }), "Unsent private reply");
    await user.click(screen.getByRole("button", { name: `Review message ${data.message.id} with AI` }));
    await user.click(screen.getByRole("button", { name: "Analyze selected text" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic check unavailable");
    expect(screen.getByRole("textbox", { name: "Text to check" })).toHaveValue(data.message.text);
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Unsent private reply");
    await user.click(screen.getByRole("button", { name: "Analyze selected text" }));
    expect(await screen.findByLabelText("AI message assessment")).toHaveTextContent("canned fixture");
    expect(analyze).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Close AI check" }));
    expect(screen.queryByRole("textbox", { name: "Text to check" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("AI message assessment")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Unsent private reply");
  });

  it.each(["close", "logout"] as const)("ignores a late AI assessment after %s", async (action) => {
    const data = await setup();
    let finish!: (result: SecurityResult) => void;
    const analyze = vi.spyOn(data.api, "analyzeSecurity").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    openChat(data);
    await user.click(await screen.findByRole("button", { name: `Review message ${data.message.id} with AI` }));
    await user.click(screen.getByRole("button", { name: "Analyze selected text" }));
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    expect(analyze).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: action === "close" ? "Close AI check" : "Log out" }));
    if (action === "logout") await screen.findByRole("heading", { name: "Welcome back." });
    await act(async () => { finish(result); });
    expect(screen.queryByLabelText("AI message assessment")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Text to check" })).not.toBeInTheDocument();
  });
});
