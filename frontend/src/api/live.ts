import { ApiError } from "./errors";
import type { ApiClient, ErrorEnvelope } from "./types";

export function createLiveApi(
  baseUrl: string,
  getDemoUserId: () => number | null,
  fetcher: typeof fetch = fetch,
): ApiClient {
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    protectedOperation = true,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const id = getDemoUserId();
    if (protectedOperation && id !== null)
      headers["X-Demo-User-Id"] = String(id);
    let response: Response;
    try {
      response = await fetcher(`${baseUrl.replace(/\/$/, "")}${path}`, {
        method,
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
  return {
    health: () => request("/health", "GET", undefined, false),
    listDemoUsers: () => request("/demo/users", "GET", undefined, false),
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
    updateConnection: (id, status) =>
      request(`/connections/${id}`, "PATCH", { status }),
    analyzeSecurity: (text) => request("/security/analyze", "POST", { text }),
  };
}
