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
  it("uses exact routes, snake_case bodies, and the selected identity only on protected requests", async () => {
    let identity = 1;
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    const api = createLiveApi(
      "http://localhost:8000/api/",
      () => identity,
      fetcher,
    );
    await api.health();
    await api.listDemoUsers();
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
    identity = 2;
    await api.listConnections("PENDING");
    await api.updateConnection(12, "ACCEPTED");
    await api.analyzeSecurity("synthetic message");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:8000/api/health",
      "http://localhost:8000/api/demo/users",
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
    expect(options[2].headers).toHaveProperty("X-Demo-User-Id", "1");
    expect(options[9].headers).toHaveProperty("X-Demo-User-Id", "2");
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
      () => 1,
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
  it("loads dining menus as public information without a demo identity header", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(fixtures.dining_menus)));
    const api = createLiveApi("/api", () => 1, fetcher);
    expect(await api.getDiningMenus()).toEqual(fixtures.dining_menus);
    expect(fetcher).toHaveBeenCalledWith("/api/dining/menus", {
      method: "GET", headers: { Accept: "application/json" },
    });
  });
  it("handles network failures and unreadable responses", async () => {
    const offline = createLiveApi(
      "/api",
      () => 1,
      vi.fn().mockRejectedValue(new TypeError("offline")),
    );
    await expect(offline.listPosts()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    const html = createLiveApi(
      "/api",
      () => 1,
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
    const api = createMockApi({ getDemoUserId: () => null, delayMs: 0, getScenario: () => scenario });
    expect(await api.getDiningMenus()).toEqual(fixtures.dining_menus);
    scenario = "empty";
    expect((await api.getDiningMenus()).halls.every((hall) => hall.status === "EMPTY" && !hall.meals.length)).toBe(true);
    scenario = "error";
    await expect(api.getDiningMenus()).rejects.toMatchObject({ status: 503 });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  const setup = (initialIdentity: number | null = 1) => {
    let identity = initialIdentity;
    const api = createMockApi({ getDemoUserId: () => identity, delayMs: 0 });
    return {
      api,
      select: (id: number | null) => {
        identity = id;
      },
    };
  };
  it("loads source fixtures, respects category/status/owner filters and pagination", async () => {
    const { api } = setup();
    expect(await api.listDemoUsers()).toEqual(fixtures.demo_users);
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
  it("requires a known demo identity and enforces post ownership", async () => {
    const { api, select } = setup(null);
    await expect(api.listPosts()).rejects.toMatchObject({ status: 401 });
    select(999);
    await expect(api.createPost(sampleInput())).rejects.toMatchObject({
      status: 401,
    });
    select(2);
    await expect(api.updatePost(42, "COMPLETED")).rejects.toMatchObject({
      status: 403,
    });
    await expect(api.getMatches(42)).rejects.toMatchObject({ status: 403 });
    await expect(api.createConnection(42, 7)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("creates confirmed fields under selected identity without leaking mutable state", async () => {
    const { api, select } = setup();
    select(2);
    const created = await api.createPost({
      ...sampleInput(),
      location: null,
      starts_at: null,
      ends_at: null,
    });
    expect(created).toMatchObject({
      author: fixtures.demo_users.items[1],
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
    select(2);
    await api.updatePost(7, "COMPLETED");
    select(1);
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
    select(2);
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
    select(1);
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
    select(2);
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
      getDemoUserId: () => 1,
      delayMs: 0,
      getScenario: () => scenario,
    });
    expect((await api.listPosts()).items).toEqual([]);
    expect((await api.getMatches(42)).matches).toEqual([]);
    scenario = "error";
    await expect(api.listPosts()).rejects.toMatchObject({ status: 503 });
    expect(await api.listDemoUsers()).toEqual(fixtures.demo_users);
  });
});
