import fixtureData from "../../../docs/fixtures/api_examples.json";
import { fail } from "./errors";
import { blankDetails, validatePost } from "../lib/posts";
import type {
  ApiClient,
  Category,
  Connection,
  DemoUser,
  DiningMenuResponse,
  MatchResponse,
  Post,
  SecurityResult,
  UnderstandingCategory,
} from "./types";

export type MockScenario = "normal" | "empty" | "error";
interface MockOptions {
  getDemoUserId: () => number | null;
  delayMs?: number;
  getScenario?: () => MockScenario;
}
const clone = <T>(value: T): T => structuredClone(value);

export function createMockApi({
  getDemoUserId,
  delayMs = 300,
  getScenario = () => "normal",
}: MockOptions): ApiClient {
  const users: DemoUser[] = clone(fixtureData.demo_users.items);
  const posts = clone(fixtureData.post_list.items) as Post[];
  const connections: Connection[] = [];
  let nextPostId = Math.max(...posts.map((post) => post.id)) + 1;
  let nextConnectionId = fixtureData.connection.id;

  async function ready(protectedOperation = true): Promise<DemoUser | null> {
    // Capture identity before the delay so profile changes cannot change a pending operation's owner.
    const user = users.find((item) => item.id === getDemoUserId()) ?? null;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (protectedOperation && !user)
      fail(401, "DEMO_IDENTITY_REQUIRED", "Choose a known demo profile.");
    if (protectedOperation && getScenario() === "error")
      fail(
        503,
        "MOCK_UNAVAILABLE",
        "Demo error: the service is temporarily unavailable. Switch demo responses to Normal and retry.",
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
      return clone(fixtureData.health) as { status: "ok"; demo_mode: boolean };
    },
    listDemoUsers: async () => {
      await ready(false);
      return { items: clone(users) };
    },
    getDiningMenus: async () => {
      await ready(false);
      if (getScenario() === "error")
        fail(503, "MOCK_UNAVAILABLE", "Demo error: dining menus could not be loaded.");
      const result = clone(fixtureData.dining_menus) as DiningMenuResponse;
      if (getScenario() === "empty") {
        result.halls.forEach((hall) => {
          hall.status = "EMPTY";
          hall.message = "Synthetic empty menu example.";
          hall.meals = [];
        });
      }
      return result;
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
        author: clone(user),
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
