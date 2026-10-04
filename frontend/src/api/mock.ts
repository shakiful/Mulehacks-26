import fixtureData from "../../../docs/fixtures/api_examples.json";
import { fail } from "./errors";
import { blankDetails, validatePost } from "../lib/posts";
import type {
  ApiClient,
  Category,
  Connection,
  PostJoin,
  Message,
  ThreadKind,
  StudentNotification,
  NotificationKind,
  UserSummary,
  StudentUser,
  DiningMenuResponse,
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
  const joins: PostJoin[] = [];
  const messages: Message[] = [];
  const notifications: { recipient_id: number; value: StudentNotification }[] = [];
  const editedPostIds = new Set<number>();
  let nextPostId = Math.max(...posts.map((post) => post.id)) + 1;
  let nextConnectionId = fixtureData.connection.id;
  let nextJoinId = fixtureData.join.id;
  let nextMessageId = fixtureData.message.id;
  let nextNotificationId = fixtureData.notification.id;

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
  function withAvailability(post: Post): Post {
    const result = clone(post);
    result.ride_availability = null;
    if (result.category === "RIDE" && result.intent === "OFFER") {
      const reserved = connections.filter((c) => c.status === "ACCEPTED"
        && (c.source_post_id === post.id || c.target_post_id === post.id))
        .reduce((sum, c) => sum + c.reserved_seats, 0)
        + joins.filter((j) => j.status === "ACCEPTED" && j.post.id === post.id && j.post_intent === "OFFER")
          .reduce((sum, j) => sum + j.reserved_seats, 0);
      result.ride_availability = { total_seats: result.details.seats, reserved_seats: reserved,
        remaining_seats: Math.max(0, result.details.seats - reserved) };
    }
    return result;
  }
  function rideCapacity(source: Post, target: Post) {
    if (source.category !== "RIDE" || target.category !== "RIDE") return true;
    const offer = source.intent === "OFFER" ? source : target;
    const request = source.intent === "REQUEST" ? source : target;
    return (withAvailability(offer).ride_availability?.remaining_seats ?? 0) >= request.details.seats;
  }
  function scriptedMatches(source: Post, limit: number): MatchResponse {
    // Only replay supplied matches. New posts return empty results; there is no browser matching engine.
    const canned = (fixtureData.ride_matches.find((item) => item.post_id === source.id)
      ?? fixtureData.matches) as unknown as MatchResponse;
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
        target.category !== source.category || !rideCapacity(source, target)
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
      return [{ ...clone(match), post: withAvailability(target) }];
    });
    return { ...clone(canned), matches: matches.slice(0, limit) };
  }
  function findThread(kind: ThreadKind, id: number, user: StudentUser, accepted = true) {
    const item = kind === "connection" ? connections.find((c) => c.id === id) : joins.find((j) => j.id === id);
    if (!item) fail(404, "NOT_FOUND", "Conversation not found.");
    const requester = "requester_id" in item ? item.requester_id : item.requester.id;
    const receiver = "receiver_id" in item ? item.receiver_id : item.receiver.id;
    if (![requester, receiver].includes(user.id)) fail(403, "FORBIDDEN", "Only participants can access this conversation.");
    if (accepted && item.status !== "ACCEPTED") fail(409, "CONFLICT", "Messaging is available after the request is accepted.");
    return item;
  }
  const joinResponse = (item: PostJoin): PostJoin => ({ ...clone(item), post: withAvailability(findPost(item.post.id)) });
  function notify(actor: UserSummary, recipient_id: number, kind: NotificationKind, post: Post, threadKind: ThreadKind, threadId: number, message_id: number | null = null) {
    notifications.push({ recipient_id, value: { id: nextNotificationId++, kind, actor: { id: actor.id, name: actor.name },
      post_title: post.title, join_id: threadKind === "join" ? threadId : null,
      connection_id: threadKind === "connection" ? threadId : null, message_id,
      created_at: new Date().toISOString(), read_at: null } });
  }
  const unreadCount = (id: number) => notifications.filter((n) => n.recipient_id === id && n.value.read_at === null).length;
  function acknowledgeRequest(kind: ThreadKind, id: number, recipient: number) {
    notifications.filter((n) => n.recipient_id === recipient && n.value.kind === (kind === "join" ? "JOIN_REQUEST" : "CONNECTION_REQUEST")
      && (kind === "join" ? n.value.join_id : n.value.connection_id) === id && n.value.read_at === null)
      .forEach((n) => { n.value.read_at = new Date().toISOString(); });
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
        RIDE: ["details.origin_point", "details.destination_point", "details.origin", "details.destination", "starts_at"],
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
      return withAvailability(post);
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
        items: items.slice(offset, offset + limit).map(withAvailability),
        total: items.length,
        limit,
        offset,
      };
    },
    getPost: async (id) => {
      await ready();
      return withAvailability(findPost(id));
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
      const reserved = withAvailability(post).ride_availability?.reserved_seats ?? 0;
      if (post.category === 'RIDE' && input.category === 'RIDE' && reserved) {
        const sameTime = (a: string | null | undefined, b: string | null | undefined) =>
          a == null && b == null || Boolean(a && b && Date.parse(a) === Date.parse(b));
        const samePoint = (a: typeof post.details.origin_point, b: typeof post.details.origin_point) =>
          a?.lat === b?.lat && a?.lng === b?.lng;
        if (intent !== post.intent || !sameTime(starts_at, post.starts_at) || !sameTime(ends_at, post.ends_at)
          || input.details.origin !== post.details.origin || input.details.destination !== post.details.destination
          || !samePoint(input.details.origin_point, post.details.origin_point)
          || !samePoint(input.details.destination_point, post.details.destination_point))
          fail(409, 'CONFLICT', 'The route, time and offer type cannot change after passengers are accepted.');
        if (input.details.seats < reserved)
          fail(409, 'CONFLICT', 'Capacity cannot be less than the seats already reserved.');
        if (input.details.seats === reserved) post.status = 'COMPLETED';
      }
      Object.assign(post, { title: title.trim(), text: text.trim(), intent, location,
        starts_at, ends_at, details, updated_at: new Date().toISOString() });
      editedPostIds.add(id);
      return withAvailability(post);
    },
    updatePost: async (id, status) => {
      const user = (await ready())!;
      const post = findPost(id);
      if (post.author.id !== user.id)
        fail(403, "FORBIDDEN", "Only the author can update this post.");
      if (!["COMPLETED", "CANCELLED"].includes(status))
        fail(422, "VALIDATION_ERROR", "Choose Completed or Cancelled.");
      if (post.status !== "OPEN") fail(409, "CONFLICT", "This post is already closed.");
      post.status = status;
      post.updated_at = new Date().toISOString();
      return withAvailability(post);
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
        reserved_seats: 0,
        created_at: now,
        updated_at: now,
      };
      connections.push(connection);
      notify(user, target.author.id, "CONNECTION_REQUEST", target, "connection", connection.id);
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
    getConnection: async (id) => {
      const user = (await ready())!;
      return clone(findThread("connection", id, user, false)) as Connection;
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
      if (status === "ACCEPTED") {
        const source = findPost(item.source_post_id), target = findPost(item.target_post_id);
        if (source.category === "RIDE" && target.category === "RIDE") {
          if (source.status !== "OPEN" || target.status !== "OPEN" || !rideCapacity(source, target))
            fail(409, "CONFLICT", "This ride is closed, booked, or no longer has enough seats.");
          const offer = source.intent === "OFFER" ? source : target;
          const request = source.intent === "REQUEST" ? source : target;
          item.reserved_seats = request.details.seats;
          request.status = "COMPLETED";
          request.updated_at = new Date().toISOString();
          if (withAvailability(offer).ride_availability!.remaining_seats === request.details.seats) {
            offer.status = "COMPLETED";
            offer.updated_at = new Date().toISOString();
          }
        }
      }
      item.status = status;
      item.updated_at = new Date().toISOString();
      if (["ACCEPTED", "DECLINED"].includes(status)) acknowledgeRequest("connection", id, item.receiver_id);
      if (status === "ACCEPTED") notify(user, item.requester_id, "CONNECTION_ACCEPTED", findPost(item.target_post_id), "connection", id);
      return clone(item);
    },
    joinPost: async (id, seats) => {
      const user = (await ready())!, post = findPost(id);
      if (post.author.id === user.id) fail(403, "FORBIDDEN", "You cannot join your own post.");
      if (post.status !== "OPEN") fail(409, "CONFLICT", "This post is closed.");
      const rideOffer = post.category === "RIDE" && post.intent === "OFFER";
      if (rideOffer ? !Number.isInteger(seats) || (seats ?? 0) < 1 : seats !== undefined)
        fail(422, "VALIDATION_ERROR", rideOffer ? "Choose how many seats you need." : "Seats are only requested when joining a ride offer.");
      if (rideOffer && seats! > withAvailability(post).ride_availability!.remaining_seats)
        fail(409, "CONFLICT", "This ride does not have enough remaining seats.");
      if (joins.some((j) => j.post.id === id && j.requester.id === user.id && ["PENDING", "ACCEPTED"].includes(j.status)))
        fail(409, "DUPLICATE_JOIN", "You already have a pending or accepted join for this post.");
      const now = new Date().toISOString();
      const item: PostJoin = { id: nextJoinId++, post: clone(post), requester: { id: user.id, name: user.name },
        receiver: clone(post.author), category: post.category, post_intent: post.intent, status: "PENDING",
        requested_seats: seats ?? 0, reserved_seats: 0, created_at: now, updated_at: now };
      joins.push(item);
      notify(user, post.author.id, "JOIN_REQUEST", post, "join", item.id);
      return joinResponse(item);
    },
    listJoins: async (status) => {
      const user = (await ready())!;
      if (status && !["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"].includes(status))
        fail(422, "VALIDATION_ERROR", "Choose a supported connection status.");
      return { items: getScenario() === "empty" ? [] : joins.filter((j) =>
        [j.requester.id, j.receiver.id].includes(user.id) && (!status || j.status === status))
        .slice().reverse().map(joinResponse) };
    },
    getJoin: async (id) => {
      const user = (await ready())!;
      return joinResponse(findThread("join", id, user, false) as PostJoin);
    },
    updateJoin: async (id, status) => {
      const user = (await ready())!;
      const item = findThread("join", id, user, false) as PostJoin;
      if ((status === "CANCELLED" ? item.requester.id : item.receiver.id) !== user.id)
        fail(403, "FORBIDDEN", "Authors accept or decline; joining students cancel.");
      if (!["ACCEPTED", "DECLINED", "CANCELLED"].includes(status)) fail(422, "VALIDATION_ERROR", "Choose a supported status.");
      if (item.status !== "PENDING") fail(409, "CONFLICT", "Only pending join requests can change status.");
      const post = findPost(item.post.id);
      if (status === "ACCEPTED") {
        if (post.status !== "OPEN" || post.intent !== item.post_intent || post.category !== item.category)
          fail(409, "CONFLICT", "This post is closed or its participation type has changed.");
        if (post.category === "RIDE") {
          if (post.intent === "OFFER") {
            const remaining = withAvailability(post).ride_availability!.remaining_seats - item.requested_seats;
            if (remaining < 0) fail(409, "CONFLICT", "This ride no longer has enough remaining seats.");
            item.reserved_seats = item.requested_seats;
            if (!remaining) post.status = "COMPLETED";
          } else {
            item.reserved_seats = post.details.seats;
            post.status = "COMPLETED";
          }
          post.updated_at = new Date().toISOString();
        }
      }
      item.status = status;
      item.updated_at = new Date().toISOString();
      if (["ACCEPTED", "DECLINED"].includes(status)) acknowledgeRequest("join", id, item.receiver.id);
      if (status === "ACCEPTED") notify(user, item.requester.id, "JOIN_ACCEPTED", post, "join", id);
      return joinResponse(item);
    },
    listMessages: async (kind, id, query = {}) => {
      const user = (await ready())!;
      findThread(kind, id, user);
      const limit = query.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100
        || [query.before_id, query.after_id].some((n) => n !== undefined && (!Number.isInteger(n) || n < 1))
        || query.before_id !== undefined && query.after_id !== undefined)
        fail(422, "VALIDATION_ERROR", "Use a limit from 1 to 100 and either a before or after cursor.");
      const selected = getScenario() === "empty" ? [] : messages.filter((m) => (kind === "join" ? m.join_id : m.connection_id) === id
        && (query.before_id === undefined || m.id < query.before_id) && (query.after_id === undefined || m.id > query.after_id));
      return { items: clone(query.after_id === undefined ? selected.slice(-limit) : selected.slice(0, limit)), has_more: selected.length > limit };
    },
    sendMessage: async (kind, id, text) => {
      const user = (await ready())!;
      const thread = findThread(kind, id, user);
      if (!text.trim() || text.trim().length > 2000) fail(422, "VALIDATION_ERROR", "Enter 1 to 2000 characters.");
      const item: Message = { id: nextMessageId++, connection_id: kind === "connection" ? id : null,
        join_id: kind === "join" ? id : null, sender: { id: user.id, name: user.name }, text: text.trim(), created_at: new Date().toISOString() };
      messages.push(item);
      const requester = "requester_id" in thread ? thread.requester_id : thread.requester.id;
      const receiver = "receiver_id" in thread ? thread.receiver_id : thread.receiver.id;
      const post = "post" in thread ? findPost(thread.post.id) : findPost(thread.target_post_id);
      notify(user, user.id === requester ? receiver : requester, "NEW_MESSAGE", post, kind, id, item.id);
      return clone(item);
    },
    listNotifications: async (query = {}) => {
      const user = (await ready())!, limit = query.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100
        || query.before_id !== undefined && (!Number.isInteger(query.before_id) || query.before_id < 1)
        || query.after_id !== undefined && (!Number.isInteger(query.after_id) || query.after_id < 0)
        || query.before_id !== undefined && query.after_id !== undefined)
        fail(422, "VALIDATION_ERROR", "Use a limit from 1 to 100 and either a before or after cursor.");
      if (getScenario() === "empty") return { items: [], unread_count: 0, has_more: false };
      const items = notifications.filter((n) => n.recipient_id === user.id).map((n) => n.value)
        .filter((n) => (!query.unread_only || n.read_at === null) && (query.before_id === undefined || n.id < query.before_id)
          && (query.after_id === undefined || n.id > query.after_id))
        .sort((a, b) => query.after_id === undefined ? b.id - a.id : a.id - b.id);
      return { items: clone(items.slice(0, limit)), unread_count: unreadCount(user.id), has_more: items.length > limit };
    },
    readNotification: async (id) => {
      const user = (await ready())!;
      const item = notifications.find((n) => n.value.id === id) ?? fail(404, "NOT_FOUND", "Notification not found.");
      if (item.recipient_id !== user.id) fail(403, "FORBIDDEN", "Only the recipient can read this notification.");
      item.value.read_at ??= new Date().toISOString();
      return clone(item.value);
    },
    readNotifications: async (through_id) => {
      const user = (await ready())!;
      if (!Number.isInteger(through_id) || through_id < 1) fail(422, "VALIDATION_ERROR", "Use a positive notification ID.");
      notifications.filter((n) => n.recipient_id === user.id && n.value.id <= through_id && n.value.read_at === null)
        .forEach((n) => { n.value.read_at = new Date().toISOString(); });
      return { unread_count: unreadCount(user.id) };
    },
    readThreadNotifications: async (kind, id, through_message_id) => {
      const user = (await ready())!;
      findThread(kind, id, user);
      if (through_message_id !== undefined && (!Number.isInteger(through_message_id) || through_message_id < 1))
        fail(422, "VALIDATION_ERROR", "Use a positive message ID.");
      notifications.filter((n) => n.recipient_id === user.id && (kind === "join" ? n.value.join_id : n.value.connection_id) === id
        && n.value.read_at === null && (["JOIN_ACCEPTED", "CONNECTION_ACCEPTED"].includes(n.value.kind)
          || n.value.kind === "NEW_MESSAGE" && through_message_id !== undefined && n.value.message_id! <= through_message_id))
        .forEach((n) => { n.value.read_at = new Date().toISOString(); });
      return { unread_count: unreadCount(user.id) };
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
