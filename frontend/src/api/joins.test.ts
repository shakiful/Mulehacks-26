import { describe, expect, it, vi } from "vitest";
import fixtures from "../../../docs/fixtures/api_examples.json";
import { createLiveApi } from "./live";
import { createMockApi } from "./mock";
import type { Category, CreatePostInput, Intent, Post } from "./types";

const inputFrom = (post: Post): CreatePostInput => {
  const { category, intent, title, text, location, starts_at, ends_at, details } = post;
  return { category, intent, title, text, location, starts_at, ends_at, details } as CreatePostInput;
};
const setup = () => createMockApi({ initialUser: fixtures.test_accounts[0], delayMs: 0 });
const select = (api: ReturnType<typeof setup>, user: "rafi" | "afsana") => api.login(user, "fixture-only");

describe("join and message API adapters", () => {
  it("preserves the server's automatic security result for sends and both paged thread reads", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => new Response(JSON.stringify(
      String(url).endsWith("/auth/session") ? fixtures.signed_in_session
        : String(url).includes("after_id") ? fixtures.message_list : fixtures.message,
    )));
    const api = createLiveApi("/api", fetcher);
    await api.getSession();
    const sent = await api.sendMessage("join", 21, "Synthetic example");
    expect(sent.security).toEqual(fixtures.message.security);
    for (const kind of ["join", "connection"] as const)
      expect((await api.listMessages(kind, 21, { after_id: 1 })).items[0].security).toEqual(fixtures.message.security);
  });
  it("uses the contracted routes, bodies, cookies and CSRF token for both thread types", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(fixtures.signed_in_session)));
    const api = createLiveApi("/api/", fetcher);
    await api.getSession();
    await api.joinPost(52, 2);
    await api.joinPost(7);
    await api.listJoins("PENDING");
    await api.getJoin(21);
    await api.updateJoin(21, "ACCEPTED");
    await api.getConnection(12);
    await api.listMessages("join", 21, { before_id: 31, limit: 2 });
    await api.listMessages("connection", 12, { after_id: 31 });
    await api.sendMessage("join", 21, "Synthetic hello");
    await api.sendMessage("connection", 12, "Synthetic reply");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/session", "/api/posts/52/join", "/api/posts/7/join", "/api/joins?status=PENDING",
      "/api/joins/21", "/api/joins/21", "/api/connections/12",
      "/api/joins/21/messages?before_id=31&limit=2", "/api/connections/12/messages?after_id=31",
      "/api/joins/21/messages", "/api/connections/12/messages",
    ]);
    for (const index of [1, 2, 5, 9, 10]) expect(fetcher.mock.calls[index][1]).toMatchObject({
      method: index === 5 ? "PATCH" : "POST", credentials: "include",
      headers: { "X-CSRF-Token": fixtures.signed_in_session.csrf_token },
    });
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({ seats: 2 });
    expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string)).toEqual({});
    expect(JSON.parse(fetcher.mock.calls[9][1]!.body as string)).toEqual({ text: "Synthetic hello" });
  });

  it.each<[Category, Intent]>([
    ["RIDE", "REQUEST"], ["RIDE", "OFFER"], ["STUDY", "REQUEST"], ["STUDY", "OFFER"], ["STUDY", "PARTNER"],
    ["RESTAURANT", "REQUEST"], ["RESTAURANT", "OFFER"], ["COMMUNITY", "REQUEST"], ["COMMUNITY", "OFFER"], ["COMMUNITY", "PARTNER"],
  ])("joins %s %s without creating another post", async (category, intent) => {
    const api = setup();
    await select(api, "afsana");
    const sample = category === "RIDE" ? await api.getPost(52) : await api.getPost(42);
    const input = { ...inputFrom(sample), category, intent } as CreatePostInput;
    if (input.category === "RESTAURANT") input.details = { restaurant: "Synthetic cafe", cuisine: null, activity_type: "DINING", group_size: 4 };
    if (input.category === "COMMUNITY") input.details = { subcategory: "ACTIVITY", activity: "Synthetic walk" };
    const post = await api.createPost(input);
    await select(api, "rafi");
    const count = (await api.listPosts({ limit: 100 })).total;
    const join = await api.joinPost(post.id, category === "RIDE" && intent === "OFFER" ? 1 : undefined);
    expect(join).toMatchObject({ post: { id: post.id }, requester: { id: 1 }, receiver: { id: 2 }, status: "PENDING" });
    expect((await api.listPosts({ limit: 100 })).total).toBe(count);
    await select(api, "afsana");
    expect((await api.listJoins("PENDING")).items).toHaveLength(1);
    expect((await api.updateJoin(join.id, "ACCEPTED")).status).toBe("ACCEPTED");
  });

  it("enforces roles, terminal states and accepted-only messages with session-derived senders", async () => {
    const api = setup();
    await expect(api.joinPost(42)).rejects.toMatchObject({ status: 403 });
    const join = await api.joinPost(7);
    await expect(api.joinPost(7)).rejects.toMatchObject({ status: 409 });
    await expect(api.listMessages("join", join.id)).rejects.toMatchObject({ status: 409 });
    await expect(api.sendMessage("join", join.id, "Too early")).rejects.toMatchObject({ status: 409 });
    await expect(api.updateJoin(join.id, "ACCEPTED")).rejects.toMatchObject({ status: 403 });
    await select(api, "afsana");
    await expect(api.updateJoin(join.id, "CANCELLED")).rejects.toMatchObject({ status: 403 });
    await api.updateJoin(join.id, "ACCEPTED");
    const reply = await api.sendMessage("join", join.id, "  <b>Synthetic hello</b>  ");
    expect(reply).toMatchObject({ sender: { id: 2, name: "Afsana" }, text: "<b>Synthetic hello</b>" });
    await expect(api.sendMessage("join", join.id, " \n ")).rejects.toMatchObject({ status: 422 });
    await expect(api.sendMessage("join", join.id, "x".repeat(2001))).rejects.toMatchObject({ status: 422 });
    await select(api, "rafi");
    expect((await api.listMessages("join", join.id)).items).toEqual([reply]);
    await api.sendMessage("join", join.id, "Synthetic reply");
    await expect(api.updateJoin(join.id, "CANCELLED")).rejects.toMatchObject({ status: 409 });
    await api.logout();
    await expect(api.listMessages("join", join.id)).rejects.toMatchObject({ status: 401 });
    await expect(api.getJoin(join.id)).rejects.toMatchObject({ status: 401 });
  });

  it("shares direct seats with matched reservations and protects reserved routes", async () => {
    const api = setup();
    const connection = await api.createConnection(54, 52);
    const join = await api.joinPost(52, 3);
    await select(api, "afsana");
    await api.updateJoin(join.id, "ACCEPTED");
    const offer = await api.getPost(52);
    expect(offer.ride_availability).toEqual({ total_seats: 4, reserved_seats: 3, remaining_seats: 1 });
    await expect(api.updateConnection(connection.id, "ACCEPTED")).rejects.toMatchObject({ status: 409 });
    if (offer.category !== "RIDE") throw new Error("Expected ride fixture");
    await expect(api.editPost(52, { ...inputFrom(offer), details: { ...offer.details, seats: 2 } } as CreatePostInput)).rejects.toMatchObject({ status: 409 });
  });

  it("pages only the selected conversation in order, including matched connections", async () => {
    const api = setup();
    const join = await api.joinPost(7);
    const connection = await api.createConnection(42, 7);
    await select(api, "afsana");
    await api.updateJoin(join.id, "ACCEPTED");
    await api.updateConnection(connection.id, "ACCEPTED");
    expect((await api.getConnection(connection.id)).status).toBe("ACCEPTED");
    const ids = [];
    for (let index = 0; index < 5; index++) {
      await api.sendMessage("connection", connection.id, "Other thread");
      ids.push((await api.sendMessage("join", join.id, `Synthetic ${index}`)).id);
    }
    expect((await api.listMessages("join", join.id, { limit: 2 })).items.map((m) => m.id)).toEqual(ids.slice(-2));
    const older = await api.listMessages("join", join.id, { limit: 2, before_id: ids[3] });
    expect(older.items.map((m) => m.id)).toEqual(ids.slice(1, 3));
    expect(older.has_more).toBe(true);
    expect((await api.listMessages("join", join.id, { limit: 2, after_id: ids[1] })).items.map((m) => m.id)).toEqual(ids.slice(2, 4));
    await expect(api.listMessages("join", join.id, { before_id: 1, after_id: 2 })).rejects.toMatchObject({ status: 422 });
    await expect(api.listMessages("join", join.id, { limit: 101 })).rejects.toMatchObject({ status: 422 });
  });
});
