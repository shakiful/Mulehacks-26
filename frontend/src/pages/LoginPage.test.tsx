import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixtures from "../../../docs/fixtures/api_examples.json";
import { AppRoutes } from "../App";
import { ApiProvider } from "../context/ApiContext";
import { createMockApi } from "../api/mock";
import type { ApiClient } from "../api/types";

const mockApi = () => createMockApi({ delayMs: 0 });
function showLogin(api: ApiClient, path = "/my-posts") {
  return render(<ApiProvider mockMode client={api}>
    <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>
  </ApiProvider>);
}
async function fillLogin(username: string, password = "fixture-only") {
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Welcome back." });
  await user.type(screen.getByRole("textbox", { name: "Username" }), username);
  await user.type(screen.getByLabelText("Password"), password);
  return user;
}

afterEach(() => vi.unstubAllGlobals());
describe("student sign-in and logout", () => {
  it("protects requested pages, signs in, and clears private views on logout", async () => {
    const api = mockApi();
    const posts = vi.spyOn(api, "listPosts");
    showLogin(api);
    await screen.findByRole("heading", { name: "Welcome back." });
    expect(posts).not.toHaveBeenCalled();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
    const user = await fillLogin("rafi");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Your open posts" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Help with SQL joins" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Demo profile" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("heading", { name: "Welcome back." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Help with SQL joins" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
    expect((await api.getSession()).user).toBeNull();
    expect(localStorage.length).toBe(0);
  });
  it("keeps incorrect login on the form and signs in as Afsana after correction", async () => {
    showLogin(mockApi());
    const user = await fillLogin("afsana", "incorrect");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The username or password is incorrect.");
    expect(screen.getByRole("textbox", { name: "Username" })).toHaveValue("afsana");
    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "fixture-only");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Relational database tutoring" })).toBeInTheDocument();
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Afsana")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Help with SQL joins" })).not.toBeInTheDocument();
  });
  it("disables repeated submissions and supports showing the password", async () => {
    const api = mockApi();
    const login = vi.spyOn(api, "login");
    let finish!: (session: typeof fixtures.signed_in_session) => void;
    login.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    showLogin(api, "/login");
    const user = await fillLogin("rafi");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    await user.dblClick(screen.getByRole("button", { name: "Sign in" }));
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Username" })).toBeDisabled();
    finish(fixtures.signed_in_session);
    await screen.findByRole("navigation", { name: "Main navigation" });
  });
  it("retries a failed session lookup without exposing protected data", async () => {
    const api = mockApi();
    const session = vi.spyOn(api, "getSession").mockRejectedValueOnce(new Error("Backend is unavailable."));
    const posts = vi.spyOn(api, "listPosts");
    showLogin(api);
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend is unavailable.");
    expect(posts).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Welcome back." });
    expect(session).toHaveBeenCalledTimes(2);
  });
  it("keeps the account signed in when server logout fails and allows retry", async () => {
    const api = createMockApi({ delayMs: 0, initialUser: fixtures.test_accounts[0] });
    vi.spyOn(api, "logout").mockRejectedValueOnce(new Error("Could not reach the server."));
    showLogin(api);
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Help with SQL joins" });
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    expect((await api.getSession()).user?.username).toBe("rafi");
    await user.click(screen.getByRole("button", { name: "Log out" }));
    await screen.findByRole("heading", { name: "Welcome back." });
  });
  it("returns to sign-in when the live backend reports an expired session", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/auth/session")
        ? new Response(JSON.stringify(fixtures.signed_in_session))
        : new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Sign in to continue.", details: [] } }), { status: 401 }),
    ));
    render(<ApiProvider mockMode={false}><MemoryRouter initialEntries={["/my-posts"]}><AppRoutes /></MemoryRouter></ApiProvider>);
    await screen.findByRole("heading", { name: "Welcome back." });
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
  });
  it("blocks another student's editor even when its URL is opened directly", async () => {
    showLogin(createMockApi({ delayMs: 0, initialUser: fixtures.test_accounts[1] }), "/posts/42/edit");
    expect(await screen.findByRole("alert")).toHaveTextContent("Only the author can edit this post.");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument());
  });
});
