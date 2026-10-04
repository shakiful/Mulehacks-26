import { describe, expect, it, vi } from "vitest";
import fixtures from "../../../docs/fixtures/api_examples.json";
import { createLiveApi } from "./live";
import { createMockApi } from "./mock";
import type { CreatePostInput } from "./types";

const sampleInput = (): CreatePostInput => {
  const {
    id: _id,
    author: _author,
    status: _status,
    created_at: _created,
    updated_at: _updated,
    ...input
  } = fixtures.post_created;
  return structuredClone(input) as CreatePostInput;
};

describe("live API contract", () => {
  it("revokes client session state on logout and sends its CSRF token", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(fixtures.signed_in_session)))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixtures.signed_out_session)))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixtures.post_created)));
    const api = createLiveApi("/api", fetcher);
    await api.getSession();
    await api.logout();
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "POST", credentials: "include",
      headers: { "X-CSRF-Token": fixtures.signed_in_session.csrf_token } });
    await api.createPost(sampleInput());
    expect(fetcher.mock.calls[2][1]?.headers).not.toHaveProperty("X-CSRF-Token");
  });
  it("ignores a stale session lookup after logout", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixtures.signed_out_session)))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixtures.post_created)));
    const api = createLiveApi("/api", fetcher);
    const lookup = api.getSession();
    await api.logout();
    finish(new Response(JSON.stringify(fixtures.signed_in_session)));
    await lookup;
    await api.createPost(sampleInput());
    expect(fetcher.mock.calls[2][1]?.headers).not.toHaveProperty("X-CSRF-Token");
  });
  it("does not let an old request's unauthorized response clear a newer login", async () => {
    let finish!: (response: Response) => void;
    const expired = vi.fn();
    const nextSession = { user: fixtures.test_accounts[1], csrf_token: "synthetic-afsana-csrf" };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(fixtures.signed_in_session)))
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify(nextSession)))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixtures.post_created)));
    const api = createLiveApi("/api", fetcher, expired);
    await api.getSession();
    const oldRequest = api.listPosts();
    await api.login("afsana", "fixture-only");
    finish(new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Sign in to continue.", details: [] } }), { status: 401 }));
    await expect(oldRequest).rejects.toMatchObject({ status: 401 });
    expect(expired).not.toHaveBeenCalled();
    await api.createPost(sampleInput());
    expect(fetcher.mock.calls[3][1]?.headers).toHaveProperty("X-CSRF-Token", nextSession.csrf_token);
  });
  it("saves the full edit body to the existing post with PUT with session credentials and CSRF protection", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(fixtures.post_edit.response)));
    const api = createLiveApi("/api", fetcher);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(fixtures.signed_in_session)));
    await api.login("rafi", "fixture-only");
    const input = structuredClone(fixtures.post_edit.request) as CreatePostInput;
    expect(await api.editPost(42, input)).toEqual(fixtures.post_edit.response);
    expect(fetcher).toHaveBeenCalledWith("/api/posts/42", {
      method: "PUT", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": fixtures.signed_in_session.csrf_token },
      body: JSON.stringify(input),
    });
    expect(input).not.toHaveProperty("author");
    expect(input).not.toHaveProperty("status");
  });
  it("uses exact routes, snake_case bodies, and session credentials and CSRF only on mutations", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async (url) => new Response(JSON.stringify(String(url).includes("/auth/session") ? fixtures.signed_in_session : { items: [] }), { status: 200 }),
    );
    const api = createLiveApi(
      "http://localhost:8000/api/",
      fetcher,
    );
    await api.health();
    await api.getSession();
    await api.listPosts({
      category: "RESTAURANT",
      user_id: 1,
      limit: 5,
      offset: 0,
    });
    await api.understand({
      text: "tomorrow",
      category_hint: "RIDE",
      reference_time: "2026-10-03T18:00:00-05:00",
      timezone: "America/Chicago",
    });
    await api.createPost(sampleInput());
    await api.getPost(42);
    await api.updatePost(42, "COMPLETED");
    await api.getMatches(42);
    await api.createConnection(42, 7);
    await api.listConnections("PENDING");
    await api.updateConnection(12, "ACCEPTED");
    await api.analyzeSecurity("synthetic message");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:8000/api/health",
      "http://localhost:8000/api/auth/session",
      "http://localhost:8000/api/posts?category=RESTAURANT&user_id=1&limit=5&offset=0",
      "http://localhost:8000/api/understand",
      "http://localhost:8000/api/posts",
      "http://localhost:8000/api/posts/42",
      "http://localhost:8000/api/posts/42",
      "http://localhost:8000/api/matches",
      "http://localhost:8000/api/connections",
      "http://localhost:8000/api/connections?status=PENDING",
      "http://localhost:8000/api/connections/12",
      "http://localhost:8000/api/security/analyze",
    ]);
    const options = fetcher.mock.calls.map((call) => call[1] as RequestInit);
    expect(options[0].headers).not.toHaveProperty("X-Demo-User-Id");
    expect(options[1].headers).not.toHaveProperty("X-Demo-User-Id");
    expect(options[3].headers).toHaveProperty("X-CSRF-Token", fixtures.signed_in_session.csrf_token);
    expect(options.every((option) => option.credentials === "include")).toBe(true);
    expect(options[9].headers).not.toHaveProperty("X-CSRF-Token");
    expect(JSON.parse(options[7].body as string)).toEqual({
      post_id: 42,
      limit: 5,
    });
    expect(JSON.parse(options[8].body as string)).toEqual({
      source_post_id: 42,
      target_post_id: 7,
    });
    expect(JSON.parse(options[10].body as string)).toEqual({
      status: "ACCEPTED",
    });
    expect(JSON.parse(options[11].body as string)).toEqual({
      text: "synthetic message",
    });
    expect(JSON.parse(options[4].body as string)).not.toHaveProperty("user_id");
  });
  it("preserves standard validation details for form feedback", async () => {
    const api = createLiveApi(
      "/api",
      vi.fn(
        async () =>
          new Response(JSON.stringify(fixtures.validation_error), {
            status: 422,
          }),
      ),
    );
    await expect(api.createPost(sampleInput())).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
      details: fixtures.validation_error.error.details,
    });
  });
  it("loads public dining menus with credentials and no identity or CSRF header", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(fixtures.dining_menus)));
    const api = createLiveApi("/api", fetcher);
    expect(await api.getDiningMenus()).toEqual(fixtures.dining_menus);
    expect(fetcher).toHaveBeenCalledWith("/api/dining/menus", {
      method: "GET", credentials: "include", headers: { Accept: "application/json" },
    });
  });
  it("handles network failures and unreadable responses", async () => {
    const offline = createLiveApi(
      "/api",
      vi.fn().mockRejectedValue(new TypeError("offline")),
    );
    await expect(offline.listPosts()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    const html = createLiveApi(
      "/api",
      vi.fn(async () => new Response("<html>", { status: 502 })),
    );
    await expect(html.listPosts()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
  });
});

describe("fixture mock behavior", () => {
  it("uses synthetic dining examples and supports empty/error states without fetching Sodexo", async () => {
    let scenario: "normal" | "empty" | "error" = "normal";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const api = createMockApi({ delayMs: 0, getScenario: () => scenario });
    expect(await api.getDiningMenus()).toEqual(fixtures.dining_menus);
    scenario = "empty";
    expect((await api.getDiningMenus()).halls.every((hall) => hall.status === "EMPTY" && !hall.meals.length)).toBe(true);
    scenario = "error";
    await expect(api.getDiningMenus()).rejects.toMatchObject({ status: 503 });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  const setup = (initialIdentity: number | null = 1) => {
    const api = createMockApi({ initialUser: fixtures.test_accounts.find((user) => user.id === initialIdentity) ?? null, delayMs: 0 });
    return { api, select: async (id: number | null) => {
      await api.logout();
      const account = fixtures.test_accounts.find((user) => user.id === id);
      if (account) await api.login(account.username, "fixture-only");
    } };
  };
  it("edits in place, preserves identity/creation metadata, clears optional fields, and drops stale fixture scores", async () => {
    const { api } = setup();
    const before = await api.getPost(42);
    expect((await api.getMatches(42)).matches).toHaveLength(1);
    const input = structuredClone(fixtures.post_edit.request) as CreatePostInput;
    const saved = await api.editPost(42, input);
    expect(saved).toMatchObject({ ...input, id: before.id, author: before.author,
      status: before.status, created_at: before.created_at });
    expect(saved.updated_at).not.toBe(before.updated_at);
    saved.title = "client mutation";
    input.details = { ...input.details, topic: "client mutation" } as typeof input.details;
    expect((await api.getPost(42)).title).toBe(fixtures.post_edit.request.title);
    expect((await api.listPosts()).total).toBe(2);
    expect((await api.getMatches(42)).matches).toEqual([]);
  });
  it("rejects unauthorized, missing, invalid, recategorized, and closed post edits without changing data", async () => {
    const { api, select } = setup();
    const original = await api.getPost(42);
    await select(2);
    await expect(api.editPost(42, sampleInput())).rejects.toMatchObject({ status: 403 });
    await select(null);
    await expect(api.editPost(42, sampleInput())).rejects.toMatchObject({ status: 401 });
    await select(1);
    await expect(api.editPost(999, sampleInput())).rejects.toMatchObject({ status: 404 });
    await expect(api.editPost(42, { ...sampleInput(), title: "" })).rejects.toMatchObject({ status: 422 });
    await expect(api.editPost(42, { ...sampleInput(), category: "COMMUNITY" } as CreatePostInput)).rejects.toMatchObject({ status: 400 });
    expect(await api.getPost(42)).toEqual(original);
    await api.updatePost(42, "COMPLETED");
    await expect(api.editPost(42, sampleInput())).rejects.toMatchObject({ status: 409 });
  });
  it("invalidates scripted matches when the target is edited and preserves existing connections", async () => {
    const { api, select } = setup();
    const connection = await api.createConnection(42, 7);
    await select(2);
    const target = await api.getPost(7);
    const { id: _id, author: _author, status: _status, created_at: _created, updated_at: _updated, ...input } = target;
    await api.editPost(7, { ...input, title: "Updated tutoring offer" });
    expect((await api.listConnections()).items).toEqual([connection]);
    await select(1);
    expect((await api.getMatches(42)).matches).toEqual([]);
  });
  it("loads source fixtures, respects category/status/owner filters and pagination", async () => {
    const { api } = setup();
    expect((await api.getSession()).user).toEqual(fixtures.test_accounts[0]);
    expect(await api.listPosts()).toEqual(fixtures.post_list);
    expect(await api.listPosts({ category: "RIDE" })).toMatchObject({
      items: [],
      total: 0,
    });
    expect(
      await api.listPosts({ user_id: 2, limit: 1, offset: 0 }),
    ).toMatchObject({
      items: [fixtures.post_list.items[1]],
      total: 1,
      limit: 1,
    });
    await expect(api.listPosts({ limit: 101 })).rejects.toMatchObject({
      status: 422,
    });
  });
  it("requires a signed-in student and enforces post ownership", async () => {
    const { api, select } = setup(null);
    await expect(api.listPosts()).rejects.toMatchObject({ status: 401 });
    await select(999);
    await expect(api.createPost(sampleInput())).rejects.toMatchObject({
      status: 401,
    });
    await select(2);
    await expect(api.updatePost(42, "COMPLETED")).rejects.toMatchObject({
      status: 403,
    });
    await expect(api.getMatches(42)).rejects.toMatchObject({ status: 403 });
    await expect(api.createConnection(42, 7)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("creates confirmed fields under the signed-in student without leaking mutable state", async () => {
    const { api, select } = setup();
    await select(2);
    const created = await api.createPost({
      ...sampleInput(),
      location: null,
      starts_at: null,
      ends_at: null,
    });
    expect(created).toMatchObject({
      author: { id: 2, name: "Afsana" },
      location: null,
      starts_at: null,
      ends_at: null,
      status: "OPEN",
    });
    created.title = "client mutation";
    expect((await api.getPost(created.id)).title).toBe(
      fixtures.post_created.title,
    );
    expect(await api.getMatches(created.id)).toMatchObject({
      post_id: created.id,
      matches: [],
    });
  });
  it("replays only fixture matches and excludes closed source or target posts", async () => {
    const { api, select } = setup();
    expect(await api.getMatches(42)).toEqual(fixtures.matches);
    await select(2);
    await api.updatePost(7, "COMPLETED");
    await select(1);
    expect((await api.getMatches(42)).matches).toEqual([]);
    await expect(api.createConnection(42, 7)).rejects.toMatchObject({
      status: 400,
    });
    await api.updatePost(42, "COMPLETED");
    expect((await api.getMatches(42)).matches).toEqual([]);
    expect((await api.listPosts()).items).toEqual([]);
  });
  it("enforces duplicate requests, recipient transitions, and terminal states", async () => {
    const { api, select } = setup();
    const request = await api.createConnection(42, 7);
    expect(request).toMatchObject({
      requester_id: 1,
      receiver_id: 2,
      status: "PENDING",
    });
    await expect(api.createConnection(42, 7)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      api.updateConnection(request.id, "ACCEPTED"),
    ).rejects.toMatchObject({ status: 403 });
    await select(2);
    expect((await api.listConnections()).items).toHaveLength(1);
    await expect(
      api.updateConnection(request.id, "CANCELLED"),
    ).rejects.toMatchObject({ status: 403 });
    expect((await api.updateConnection(request.id, "ACCEPTED")).status).toBe(
      "ACCEPTED",
    );
    await expect(
      api.updateConnection(request.id, "DECLINED"),
    ).rejects.toMatchObject({ status: 409 });
    expect((await api.getPost(7)).status).toBe("OPEN");
    await select(1);
    await expect(api.createConnection(42, 7)).rejects.toMatchObject({
      status: 409,
    });
    expect((await api.getPost(42)).status).toBe("OPEN");
  });
  it("allows requester cancellation and recipient decline", async () => {
    const { api, select } = setup();
    const first = await api.createConnection(42, 7);
    expect((await api.updateConnection(first.id, "CANCELLED")).status).toBe(
      "CANCELLED",
    );
    const second = await api.createConnection(42, 7);
    await select(2);
    expect((await api.updateConnection(second.id, "DECLINED")).status).toBe(
      "DECLINED",
    );
    expect((await api.listConnections("PENDING")).items).toEqual([]);
  });
  it("honors category hints and asks for dates and routes without guessing relative times", async () => {
    const { api } = setup();
    const preview = await api.understand({
      text: "SQL ride tomorrow",
      category_hint: "RIDE",
      reference_time: "2026-10-03T16:00:00-05:00",
      timezone: "America/Chicago",
    });
    expect(preview).toMatchObject({
      category: "RIDE",
      starts_at: null,
      ends_at: null,
      location: null,
      missing_fields: ["details.origin", "details.destination", "starts_at"],
    });
    const security = await api.understand({
      text: "Your account expires today",
      category_hint: "CYBERSECURITY",
      reference_time: new Date().toISOString(),
      timezone: "America/Chicago",
    });
    expect(security).toMatchObject({
      category: "CYBERSECURITY",
      intent: null,
      details: null,
    });
  });
  it("labels canned security results and never fetches URLs or creates records", async () => {
    const { api } = setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const before = await api.listPosts();
    const result = await api.analyzeSecurity(
      "https://example.invalid/private-message",
    );
    expect(result.summary).toContain("Canned fixture");
    expect(result.limitations).toContain("not assessed or stored");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await api.listPosts()).toEqual(before);
    fetchSpy.mockRestore();
    await expect(api.analyzeSecurity("x".repeat(8001))).rejects.toMatchObject({
      status: 422,
    });
  });
  it("provides reproducible empty and error scenarios", async () => {
    let scenario: "normal" | "empty" | "error" = "empty";
    const api = createMockApi({
      initialUser: fixtures.test_accounts[0],
      delayMs: 0,
      getScenario: () => scenario,
    });
    expect((await api.listPosts()).items).toEqual([]);
    expect((await api.getMatches(42)).matches).toEqual([]);
    scenario = "error";
    await expect(api.listPosts()).rejects.toMatchObject({ status: 503 });
    expect((await api.getSession()).user).toEqual(fixtures.test_accounts[0]);
  });
});
