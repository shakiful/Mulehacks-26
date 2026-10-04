import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../App";
import { ApiProvider } from "../context/ApiContext";
import { createMockApi } from "../api/mock";
import type { Category, CreatePostInput } from "../api/types";
vi.mock("../components/RideRoutePicker", () => import("../test/MockRideRoutePicker"));

const setupApi = () => createMockApi({ initialUser: { id: 1, name: "Rafi", username: "rafi" }, delayMs: 0 });
function renderApp(api: ReturnType<typeof setupApi>, path: string) {
  return render(<ApiProvider mockMode client={api}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></ApiProvider>);
}
function nav(name: string) {
  return within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name });
}
async function switchStudent(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: "Log out" }));
  await screen.findByRole("heading", { name: "Welcome back." });
  await user.type(screen.getByRole("textbox", { name: "Username" }), name);
  await user.type(screen.getByLabelText("Password"), "fixture-only");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("navigation", { name: "Main navigation" });
}
async function acceptedJoin(api: ReturnType<typeof setupApi>) {
  const join = await api.joinPost(7);
  await api.login("afsana", "fixture-only");
  await api.updateJoin(join.id, "ACCEPTED");
  await api.login("rafi", "fixture-only");
  return join;
}

describe("direct join and conversation UI", () => {
  it("joins Study without a post, accepts as the author, and lets both students message", async () => {
    const api = setupApi(), user = userEvent.setup();
    const count = (await api.listPosts()).total;
    renderApp(api, "/study");
    const card = (await screen.findByRole("heading", { name: "Relational database tutoring" })).closest("article")!;
    expect(within(card).queryByRole("link", { name: "Edit post" })).not.toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Join" }));
    await user.click(within(card).getByRole("button", { name: "Send join request" }));
    expect(await screen.findByText(/Join request sent/)).toBeInTheDocument();
    expect((await api.listPosts()).total).toBe(count);
    const refreshed = (await screen.findByRole("heading", { name: "Relational database tutoring" })).closest("article")!;
    expect(within(refreshed).getByRole("link", { name: /Request sent/ })).toHaveAttribute("href", "/connections");
    expect(within(refreshed).queryByRole("button", { name: "Join" })).not.toBeInTheDocument();

    await switchStudent(user, "afsana");
    await user.click(nav("Connections"));
    const incoming = (await screen.findByRole("heading", { name: "Request from Rafi" })).closest("article")!;
    expect(within(incoming).queryByRole("link", { name: "Message" })).not.toBeInTheDocument();
    await user.click(within(incoming).getByRole("button", { name: "Accept" }));
    await user.click(await screen.findByRole("link", { name: "Message" }));
    await screen.findByRole("heading", { name: "Message Rafi" });
    expect(screen.getByText("Say your first hello.")).toBeInTheDocument();
    const text = "<b>Synthetic hello from Afsana</b> https://example.invalid";
    await user.type(screen.getByRole("textbox", { name: "Message" }), text);
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(within(screen.getByRole("log")).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("log").querySelector("b")).toBeNull();

    await switchStudent(user, "rafi");
    await user.click(nav("Connections"));
    await user.click(await screen.findByRole("link", { name: "Message" }));
    await screen.findByRole("heading", { name: "Message Afsana" });
    expect(await screen.findByText(text)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Synthetic reply from Rafi");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Synthetic reply from Rafi")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Unsent private draft");
    await user.click(nav("Connections"));
    await user.click(await screen.findByRole("link", { name: "Message" }));
    expect(await screen.findByRole("textbox", { name: "Message" })).toHaveValue("");
    const join = (await api.listJoins()).items[0];
    expect((await api.listMessages("join", join.id)).items.map((m) => m.sender.id)).toEqual([2, 1]);
  }, 15000);

  it.each<[Category, string]>([["RESTAURANT", "/food"], ["COMMUNITY", "/community"]])("adds Join on %s posts", async (category, path) => {
    const api = setupApi(), user = userEvent.setup();
    await api.login("afsana", "fixture-only");
    const input = { category, intent: "OFFER", title: `Synthetic ${category} invitation`, text: "Synthetic group invitation",
      location: "Campus", starts_at: "2026-10-04T23:00:00Z", ends_at: null,
      details: category === "RESTAURANT" ? { restaurant: "Synthetic cafe", cuisine: null, activity_type: "DINING", group_size: 4 }
        : { subcategory: "ACTIVITY", activity: "Synthetic campus walk" } } as CreatePostInput;
    const post = await api.createPost(input);
    await api.login("rafi", "fixture-only");
    renderApp(api, path);
    const card = (await screen.findByRole("heading", { name: post.title })).closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Join" }));
    await user.click(within(card).getByRole("button", { name: "Send join request" }));
    expect(await screen.findByText(/Join request sent/)).toBeInTheDocument();
    expect((await api.listJoins()).items[0].post.id).toBe(post.id);
  });

  it("asks for Ride offer seats and reserves them on author acceptance", async () => {
    const api = setupApi(), user = userEvent.setup();
    renderApp(api, "/ride");
    const card = (await screen.findByRole("heading", { name: "Four-seat campus ride (synthetic)" })).closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Join" }));
    const seats = within(card).getByRole("spinbutton", { name: "Seats to join" });
    expect(seats).toHaveAttribute("max", "4");
    await user.clear(seats);
    await user.type(seats, "3");
    await user.click(within(card).getByRole("button", { name: "Send join request" }));
    await screen.findByText(/Join request sent/);
    await switchStudent(user, "afsana");
    await user.click(nav("Connections"));
    const incoming = (await screen.findByRole("heading", { name: "Request from Rafi" })).closest("article")!;
    expect(within(incoming).getByText(/3 seat\(s\) requested/)).toBeInTheDocument();
    await user.click(within(incoming).getByRole("button", { name: "Accept" }));
    await screen.findByRole("link", { name: "Message" });
    expect(screen.getByText("3 seat(s) reserved")).toBeInTheDocument();
    expect((await api.getPost(52)).ride_availability?.remaining_seats).toBe(1);
  });

  it("explains the driver role before joining a Ride request", async () => {
    const api = setupApi(), user = userEvent.setup();
    await api.login("afsana", "fixture-only");
    renderApp(api, "/ride");
    const card = (await screen.findByRole("heading", { name: "Campus ride for profile 1 (synthetic)" })).closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Join" }));
    expect(within(card).getByRole("button", { name: "Send join request" })).toBeDisabled();
    await user.click(within(card).getByRole("checkbox", { name: /I can drive this route/ }));
    await user.click(within(card).getByRole("button", { name: "Send join request" }));
    await screen.findByText(/Join request sent/);
    const item = (await api.listJoins()).items[0];
    expect(item).toMatchObject({ post_intent: "REQUEST", requested_seats: 0 });
  });

  it("preserves a failed join form and cancels a pending request", async () => {
    const api = setupApi(), user = userEvent.setup();
    vi.spyOn(api, "joinPost").mockRejectedValueOnce(new Error("Synthetic join unavailable"));
    renderApp(api, "/study");
    const card = (await screen.findByRole("heading", { name: "Relational database tutoring" })).closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Join" }));
    await user.click(within(card).getByRole("button", { name: "Send join request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic join unavailable");
    await user.click(within(card).getByRole("button", { name: "Send join request" }));
    await screen.findByText(/Join request sent/);
    await user.click(nav("Connections"));
    await user.click(await screen.findByRole("button", { name: "Cancel request" }));
    expect(await screen.findByText("cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Message" })).not.toBeInTheDocument();
  });

  it("blocks a pending conversation, and exposes messaging on existing accepted matches", async () => {
    const api = setupApi(), user = userEvent.setup();
    const connection = await api.createConnection(42, 7);
    renderApp(api, `/messages/connection/${connection.id}`);
    expect(await screen.findByRole("alert")).toHaveTextContent(/after the request is accepted/);
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
    await api.login("afsana", "fixture-only");
    await api.updateConnection(connection.id, "ACCEPTED");
    await api.login("rafi", "fixture-only");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Message Afsana" });
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Synthetic matched hello");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Synthetic matched hello")).toBeInTheDocument();
  });

  it("keeps failed message drafts and polls replies without skipping one when sending", async () => {
    const api = setupApi(), user = userEvent.setup();
    const join = await acceptedJoin(api);
    await api.sendMessage("join", join.id, "Synthetic existing message");
    renderApp(api, `/messages/join/${join.id}`);
    await screen.findByText("Synthetic existing message");
    await api.login("afsana", "fixture-only");
    await api.sendMessage("join", join.id, "Synthetic reply arriving before my send");
    await api.login("rafi", "fixture-only");
    const spy = vi.spyOn(api, "sendMessage").mockRejectedValueOnce(new Error("Synthetic message unavailable"));
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Synthetic retry hello");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic message unavailable");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Synthetic retry hello");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Synthetic retry hello");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
    await waitFor(() => expect(screen.getByText("Synthetic reply arriving before my send")).toBeInTheDocument(), { timeout: 6000 });
    expect(within(screen.getByRole("log")).getAllByText("Synthetic retry hello")).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(2);
  }, 10000);

  it("loads older messages without losing the latest page", async () => {
    const api = setupApi(), user = userEvent.setup();
    const join = await acceptedJoin(api);
    for (let n = 0; n < 51; n++) await api.sendMessage("join", join.id, `Synthetic history ${n}`);
    renderApp(api, `/messages/join/${join.id}`);
    await screen.findByText("Synthetic history 50");
    expect(screen.queryByText("Synthetic history 0")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load earlier messages" }));
    await screen.findByText("Synthetic history 0");
    expect(screen.getByText("Synthetic history 50")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load earlier messages" })).not.toBeInTheDocument();
  });

  it("ignores private responses arriving after logout and retries a failed opening", async () => {
    const api = setupApi(), user = userEvent.setup();
    const join = await acceptedJoin(api);
    let finish!: (value: Awaited<ReturnType<typeof api.getJoin>>) => void;
    const spy = vi.spyOn(api, "getJoin").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const list = vi.spyOn(api, "listMessages");
    renderApp(api, `/messages/join/${join.id}`);
    await screen.findByText("Opening your conversation…");
    await user.click(screen.getByRole("button", { name: "Log out" }));
    await screen.findByRole("heading", { name: "Welcome back." });
    finish({ ...join, status: "ACCEPTED" });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(list).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Username" }), "afsana");
    await user.type(screen.getByLabelText("Password"), "fixture-only");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("navigation", { name: "Main navigation" });
    await user.click(nav("Connections"));
    await screen.findByRole("link", { name: "Message" });
    spy.mockRejectedValueOnce(new Error("Synthetic conversation unavailable"));
    await user.click(await screen.findByRole("link", { name: "Message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic conversation unavailable");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Message Rafi" });
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  });
});
