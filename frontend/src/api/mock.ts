import fixtureData from "../../../docs/fixtures/api_examples.json";
import { fail } from "./errors";
import { blankDetails, validatePost } from "../lib/posts";
import type {
  ApiClient,
  Category,
  Connection,
  StudentUser,
  MatchResponse,
  Post,
  SecurityResult,
  UnderstandingCategory,
} from "./types";

export type MockScenario = "normal" | "empty" | "error";
interface MockOptions {
  initialUser?: StudentUser | null;
  delayMs?: number;
  getScenario?: () => MockScenario;
}
const clone = <T>(value: T): T => structuredClone(value);

export function createMockApi({
  initialUser = null,
  delayMs = 300,
  getScenario = () => "normal",
}: MockOptions = {}): ApiClient {
  const users: StudentUser[] = clone(fixtureData.test_accounts);
  let currentUser = initialUser && users.find((user) => user.id === initialUser.id) || null;
  const posts = clone(fixtureData.post_list.items) as Post[];
  const connections: Connection[] = [];
  const editedPostIds = new Set<number>();
  let nextPostId = Math.max(...posts.map((post) => post.id)) + 1;
  let nextConnectionId = fixtureData.connection.id;

  async function ready(protectedOperation = true): Promise<StudentUser | null> {
    // Capture the signed-in account before the delay; pending operations keep their owner.
    const user = currentUser;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (protectedOperation && !user)
      fail(401, "UNAUTHORIZED", "Sign in to continue.");
    if (protectedOperation && getScenario() === "error")
      fail(
        503,
        "MOCK_UNAVAILABLE",
        "The fixture service is temporarily unavailable. Switch response states to Normal and retry.",
      );
    return user;
  }
  const findPost = (id: number): Post =>
    posts.find((post) => post.id === id) ??
    fail(404, "NOT_FOUND", "Post not found.");
  function scriptedMatches(source: Post, limit: number): MatchResponse {
    // Only replay supplied matches. New posts return empty results; there is no browser matching engine.
    const canned = fixtureData.matches as unknown as MatchResponse;
    if (
      getScenario() === "empty" ||
      source.id !== canned.post_id ||
      editedPostIds.has(source.id) ||
      source.status !== "OPEN"
    )
      return {
        ...(clone(fixtureData.empty_matches) as MatchResponse),
        post_id: source.id,
      };
    const matches = canned.matches.flatMap((match) => {
      const target = findPost(match.post.id);
      if (
        target.status !== "OPEN" ||
        editedPostIds.has(target.id) ||
        target.id === source.id ||
        target.author.id === source.author.id ||
        target.category !== source.category
      )
        return [];
      if (
        !(
          (source.intent === "REQUEST" && target.intent === "OFFER") ||
          (source.intent === "OFFER" && target.intent === "REQUEST") ||
          (source.intent === "PARTNER" && target.intent === "PARTNER")
        )
      )
        return [];
      return [{ ...clone(match), post: clone(target) }];
    });
    return { ...clone(canned), matches: matches.slice(0, limit) };
  }

  return {
    health: async () => {
      await ready(false);
      return { status: "ok" };
    },
    login: async (username, password) => {
      await ready(false);
      const user = users.find((item) => item.username === username.trim().toLowerCase());
      if (!user || password !== "fixture-only") fail(401, "INVALID_CREDENTIALS", "The username or password is incorrect.");
      currentUser = user;
      return { user: clone(user), csrf_token: "synthetic-fixture-csrf-token" };
    },
    getSession: async () => {
      await ready(false);
      return { user: currentUser ? clone(currentUser) : null, csrf_token: currentUser ? "synthetic-fixture-csrf-token" : null };
    },
    logout: async () => {
      await ready(false);
      currentUser = null;
      return { user: null, csrf_token: null };
    },
    understand: async (input) => {
      await ready();
      if (
        !input.text.trim() ||
        input.text.length > 4000 ||
        !Number.isFinite(Date.parse(input.reference_time))
      )
        fail(
          422,
          "VALIDATION_ERROR",
          "Enter a description and a valid reference time.",
        );
      try {
        new Intl.DateTimeFormat("en", { timeZone: input.timezone });
      } catch {
        fail(422, "VALIDATION_ERROR", "Choose a valid timezone.");
      }
      let category: UnderstandingCategory = input.category_hint ?? "COMMUNITY";
      if (!input.category_hint) {
        if (/account expires|suspicious|phishing|https?:\/\//i.test(input.text))
          category = "CYBERSECURITY";
        else if (/sql|study|tutor/i.test(input.text)) category = "STUDY";
        else if (/ride|walmart|carpool/i.test(input.text)) category = "RIDE";
        else if (/food|dinner|restaurant|chipotle/i.test(input.text))
          category = "RESTAURANT";
      }
      const common = {
        title: input.text.trim().slice(0, 120),
        text: input.text,
        location: null,
        starts_at: null,
        ends_at: null,
        analysis_mode: "HEURISTIC" as const,
      };
      if (category === "CYBERSECURITY")
        return {
          ...common,
          category,
          intent: null,
          details: null,
          missing_fields: [],
          warnings: [
            "Open the private Security page; this text must not become a public post.",
          ],
        };
      const sample = fixtureData.post_created;
      const details =
        category === "STUDY" && input.text === sample.text
          ? clone(sample.details)
          : blankDetails(category as Category);
      const missing: Record<Category, string[]> = {
        RIDE: ["details.origin", "details.destination", "starts_at"],
        STUDY: ["details.course"],
        RESTAURANT: ["details.restaurant", "starts_at"],
        COMMUNITY: [],
      };
      return {
        ...common,
        category,
        intent: "REQUEST",
        details,
        missing_fields:
          category === "STUDY" && input.text === sample.text
            ? []
            : missing[category],
        warnings: [
          "Scripted mock preview. Confirm the category, intent, and details. No relative dates, locations, or availability are inferred.",
        ],
      };
    },
    createPost: async (input) => {
      const user = (await ready())!;
      const errors = validatePost(input);
      if (errors.length)
        fail(
          422,
          "VALIDATION_ERROR",
          fixtureData.validation_error.error.message,
          errors,
        );
      const now = new Date().toISOString();
      const post = {
        ...clone(input),
        location: input.location ?? null,
        starts_at: input.starts_at ?? null,
        ends_at: input.ends_at ?? null,
        id: nextPostId++,
        author: { id: user.id, name: user.name },
        status: "OPEN" as const,
        created_at: now,
        updated_at: now,
      } as Post;
      posts.unshift(post);
      return clone(post);
    },
    listPosts: async (query = {}) => {
      await ready();
      const limit = query.limit ?? fixtureData.post_list.limit;
      const offset = query.offset ?? 0;
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isInteger(offset) ||
        offset < 0
      )
        fail(
          422,
          "VALIDATION_ERROR",
          "Use a limit from 1 to 100 and a nonnegative offset.",
        );
      if (
        query.category &&
        !["RIDE", "STUDY", "RESTAURANT", "COMMUNITY"].includes(query.category)
      )
        fail(422, "VALIDATION_ERROR", "Choose a supported category.");
      if (
        query.status &&
        !["OPEN", "COMPLETED", "CANCELLED"].includes(query.status)
      )
        fail(422, "VALIDATION_ERROR", "Choose a supported post status.");
      const items =
        getScenario() === "empty"
          ? []
          : posts.filter(
              (post) =>
                post.status === (query.status ?? "OPEN") &&
                (!query.category || post.category === query.category) &&
                (query.user_id === undefined ||
                  post.author.id === query.user_id),
            );
      return {
        items: clone(items.slice(offset, offset + limit)),
        total: items.length,
        limit,
        offset,
      };
    },
    getPost: async (id) => {
      await ready();
      return clone(findPost(id));
    },
    editPost: async (id, input) => {
      const user = (await ready())!;
      const post = findPost(id);
      if (post.author.id !== user.id)
        fail(403, "FORBIDDEN", "Only the author can edit this post.");
      if (post.status !== "OPEN")
        fail(409, "CONFLICT", "Only open posts can be edited.");
      if (input.category !== post.category)
        fail(400, "INVALID_OPERATION", "The category of an existing post cannot change.");
      const errors = validatePost(input);
      if (errors.length)
        fail(422, "VALIDATION_ERROR", "Correct the highlighted fields.", errors);
      const { title, text, intent, location, starts_at, ends_at, details } = clone(input);
      Object.assign(post, { title: title.trim(), text: text.trim(), intent, location,
        starts_at, ends_at, details, updated_at: new Date().toISOString() });
      editedPostIds.add(id);
      return clone(post);
    },
    updatePost: async (id, status) => {
      const user = (await ready())!;
      const post = findPost(id);
      if (post.author.id !== user.id)
        fail(403, "FORBIDDEN", "Only the author can update this post.");
      if (!["COMPLETED", "CANCELLED"].includes(status))
        fail(422, "VALIDATION_ERROR", "Choose Completed or Cancelled.");
      post.status = status;
      post.updated_at = new Date().toISOString();
      return clone(post);
    },
    getMatches: async (post_id, limit = 5) => {
      const user = (await ready())!;
      const post = findPost(post_id);
      if (post.author.id !== user.id)
        fail(403, "FORBIDDEN", "Only the source author can retrieve matches.");
      if (!Number.isInteger(limit) || limit < 1 || limit > 20)
        fail(422, "VALIDATION_ERROR", "Use a match limit from 1 to 20.");
      return scriptedMatches(post, limit);
    },
    createConnection: async (source_post_id, target_post_id) => {
      const user = (await ready())!;
      const source = findPost(source_post_id);
      const target = findPost(target_post_id);
      if (source.author.id !== user.id)
        fail(
          403,
          "FORBIDDEN",
          "Only the source author can request a connection.",
        );
      if (
        source.status !== "OPEN" ||
        target.status !== "OPEN" ||
        !scriptedMatches(source, 20).matches.some(
          (match) => match.post.id === target_post_id,
        )
      )
        fail(
          400,
          "INVALID_OPERATION",
          "This mock only connects the compatible pair supplied in the fixtures.",
        );
      if (
        connections.some(
          (item) =>
            ["PENDING", "ACCEPTED"].includes(item.status) &&
            ((item.source_post_id === source_post_id &&
              item.target_post_id === target_post_id) ||
              (item.source_post_id === target_post_id &&
                item.target_post_id === source_post_id)),
        )
      )
        fail(
          409,
          "DUPLICATE_CONNECTION",
          "A pending or accepted connection already exists for these posts.",
        );
      const now = new Date().toISOString();
      const connection: Connection = {
        ...clone(fixtureData.connection),
        id: nextConnectionId++,
        requester_id: user.id,
        receiver_id: target.author.id,
        source_post_id,
        target_post_id,
        status: "PENDING",
        created_at: now,
        updated_at: now,
      };
      connections.push(connection);
      return clone(connection);
    },
    listConnections: async (status) => {
      const user = (await ready())!;
      if (
        status &&
        !["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"].includes(status)
      )
        fail(422, "VALIDATION_ERROR", "Choose a supported connection status.");
      return {
        items:
          getScenario() === "empty"
            ? []
            : clone(
                connections.filter(
                  (item) =>
                    (item.requester_id === user.id ||
                      item.receiver_id === user.id) &&
                    (!status || item.status === status),
                ),
              ),
      };
    },
    updateConnection: async (id, status) => {
      const user = (await ready())!;
      const item =
        connections.find((connection) => connection.id === id) ??
        fail(404, "NOT_FOUND", "Connection not found.");
      if (item.requester_id !== user.id && item.receiver_id !== user.id)
        fail(403, "FORBIDDEN", "Only participants can update this connection.");
      const allowed =
        (item.receiver_id === user.id &&
          ["ACCEPTED", "DECLINED"].includes(status)) ||
        (item.requester_id === user.id && status === "CANCELLED");
      if (!allowed)
        fail(
          403,
          "FORBIDDEN",
          "Recipients accept or decline; requesters cancel.",
        );
      if (item.status !== "PENDING")
        fail(409, "CONFLICT", "Only pending connections can change status.");
      item.status = status;
      item.updated_at = new Date().toISOString();
      return clone(item);
    },
    analyzeSecurity: async (text) => {
      await ready();
      if (!text.trim() || text.length > 8000)
        fail(422, "VALIDATION_ERROR", "Enter 1 to 8000 characters.");
      return {
        ...(clone(fixtureData.security) as SecurityResult),
        summary: `Canned fixture result: ${fixtureData.security.summary}`,
        limitations: `Mock example; submitted content was not assessed or stored. ${fixtureData.security.limitations}`,
      };
    },
  };
}
