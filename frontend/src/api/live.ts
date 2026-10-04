import { ApiError } from "./errors";
import type { ApiClient, ErrorEnvelope, Message, MessageList, StudentSession } from "./types";

export function createLiveApi(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  onUnauthorized?: () => void,
): ApiClient {
  let csrfToken: string | null = null;
  let sessionRevision = 0;
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    protectedOperation = true,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const requestSession = csrfToken;
    if (protectedOperation && method !== "GET" && csrfToken)
      headers["X-CSRF-Token"] = csrfToken;
    let response: Response;
    try {
      response = await fetcher(`${baseUrl.replace(/\/$/, "")}${path}`, {
        method,
        credentials: "include",
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ApiError(0, {
        error: {
          code: "NETWORK_ERROR",
          message:
            "Could not reach MuleCampusBuddy. Check the backend URL and try again.",
          details: [],
        },
      });
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(response.status, {
        error: {
          code: "INVALID_RESPONSE",
          message: "The server returned an unreadable response.",
          details: [],
        },
      });
    }
    if (!response.ok) {
      if (response.status === 401 && protectedOperation && requestSession === csrfToken) {
        csrfToken = null;
        sessionRevision += 1;
        onUnauthorized?.();
      }
      const envelope = payload as Partial<ErrorEnvelope>;
      throw new ApiError(
        response.status,
        envelope?.error && typeof envelope.error.message === "string"
          ? {
              error: {
                ...envelope.error,
                details: envelope.error.details ?? [],
              },
            }
          : {
              error: {
                code: "REQUEST_FAILED",
                message: "The request failed. Please try again.",
                details: [],
              },
            },
      );
    }
    return payload as T;
  }
  async function sessionRequest(path: string, method = "GET", body?: unknown, protectedOperation = false) {
    const revision = ++sessionRevision;
    const session = await request<StudentSession>(path, method, body, protectedOperation);
    if (revision === sessionRevision) csrfToken = session.csrf_token;
    return session;
  }
  return {
    health: () => request("/health", "GET", undefined, false),
    login: (username, password) => sessionRequest("/auth/login", "POST", { username, password }),
    getSession: () => sessionRequest("/auth/session"),
    logout: () => sessionRequest("/auth/logout", "POST", undefined, true),
    getDiningMenus: () => request("/dining/menus", "GET", undefined, false),
    understand: (input) => request("/understand", "POST", input),
    createPost: (input) => request("/posts", "POST", input),
    listPosts: (query = {}) => {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) params.set(key, String(value));
      });
      return request(`/posts${params.size ? `?${params}` : ""}`);
    },
    getPost: (id) => request(`/posts/${id}`),
    editPost: (id, input) => request(`/posts/${id}`, "PUT", input),
    updatePost: (id, status) => request(`/posts/${id}`, "PATCH", { status }),
    getMatches: (post_id, limit = 5) =>
      request("/matches", "POST", { post_id, limit }),
    createConnection: (source_post_id, target_post_id) =>
      request("/connections", "POST", { source_post_id, target_post_id }),
    listConnections: (status) =>
      request(`/connections${status ? `?status=${status}` : ""}`),
    getConnection: (id) => request(`/connections/${id}`),
    updateConnection: (id, status) =>
      request(`/connections/${id}`, "PATCH", { status }),
    joinPost: (id, seats) => request(`/posts/${id}/join`, "POST", seats === undefined ? {} : { seats }),
    listJoins: (status) => request(`/joins${status ? `?status=${status}` : ""}`),
    getJoin: (id) => request(`/joins/${id}`),
    updateJoin: (id, status) => request(`/joins/${id}`, "PATCH", { status }),
    listMessages: (kind, id, query = {}) => {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) params.set(key, String(value));
      });
      return request<MessageList>(`/${kind === "join" ? "joins" : "connections"}/${id}/messages${params.size ? `?${params}` : ""}`);
    },
    sendMessage: (kind, id, text) => request<Message>(`/${kind === "join" ? "joins" : "connections"}/${id}/messages`, "POST", { text }),
    listNotifications: (query = {}) => {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) params.set(key, String(value));
      });
      return request(`/notifications${params.size ? `?${params}` : ""}`);
    },
    readNotification: (id) => request(`/notifications/${id}`, "PATCH", { read: true }),
    readNotifications: (through_id) => request("/notifications/read", "POST", { through_id }),
    readThreadNotifications: (kind, thread_id, through_message_id) => request("/notifications/read-thread", "POST", {
      kind, thread_id, ...(through_message_id === undefined ? {} : { through_message_id }),
    }),
    analyzeSecurity: (text) => request("/security/analyze", "POST", { text }),
  };
}
