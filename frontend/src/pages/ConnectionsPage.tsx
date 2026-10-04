import { useState } from "react";
import { Check, X } from "lucide-react";
import type { ConnectionStatus } from "../api/types";
import { useApi } from "../context/ApiContext";
import { useResource } from "../hooks/useResource";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

export function ConnectionsPage() {
  const { api, userId, scenario } = useApi();
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const resource = useResource(async () => {
    const result = await api.listConnections(filter ? (filter as ConnectionStatus) : undefined);
    const ids = [...new Set(result.items.map((connection) =>
      connection.receiver_id === userId ? connection.source_post_id : connection.target_post_id))];
    const posts = await Promise.all(ids.map((id) => api.getPost(id)));
    return { connections: result.items, posts };
  }, [api, userId, filter, scenario]);
  async function transition(
    id: number,
    status: "ACCEPTED" | "DECLINED" | "CANCELLED",
  ) {
    setPending(id);
    setError(null);
    try {
      await api.updateConnection(id, status);
      resource.reload();
    } catch (error) {
      setError(error);
    } finally {
      setPending(null);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FROM AN ASK TO A HELLO</p>
          <h1>Your connections</h1>
          <p>A place to turn shared interests into a conversation.</p>
        </div>
        <div>
          <label className="sr-only" htmlFor="connection-filter">
            Filter connections
          </label>
          <select
            id="connection-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">All connections</option>
            {["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"].map((status) => (
              <option key={status} value={status}>
                {status.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="notice mb-6">
        Accepting a Ride connection reserves the requested seats and completes
        the passenger's request. The driver stays open until all seats are reserved
        or they mark the offer filled. Other connections record interest.
      </p>
      {error !== null && (
        <div className="mb-5">
          <ErrorState error={error} />
        </div>
      )}
      {resource.loading ? (
        <LoadingState label="Opening your inbox…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.reload} />
      ) : !resource.data?.connections.length ? (
        <EmptyState
          title="Your next hello is waiting."
          description="Request a connection from a match. Incoming requests appear here for the recipient when they sign in."
        />
      ) : (
        <div className="space-y-4">
          {resource.data.connections.map((connection) => {
            const incoming = connection.receiver_id === userId;
            const otherPost = incoming ? connection.source_post_id : connection.target_post_id;
            const name = resource.data!.posts.find((post) => post.id === otherPost)?.author.name ?? "Student";
            return (
              <article
                key={connection.id}
                className="post-card flex flex-wrap items-center gap-4"
              >
                <span className="avatar h-11 w-11 text-base">
                  {name.charAt(0)}
                </span>
                <div className="flex-1">
                  <h2 className="font-semibold">
                    {incoming ? "Request from" : "Request to"} {name}
                  </h2>
                  <p className="mt-1 text-xs text-stone-500">
                    Post #{connection.source_post_id} → Post #
                    {connection.target_post_id} ·{" "}
                    {new Date(connection.created_at).toLocaleDateString()}
                  </p>
                </div>
                {connection.reserved_seats > 0 && <p className="text-sm font-medium">{connection.reserved_seats} seat(s) reserved</p>}
                <span className="mode-tag">
                  {connection.status.toLowerCase()}
                </span>
                {connection.status === "PENDING" && (
                  <div className="flex gap-2">
                    {incoming ? (
                      <>
                        <button
                          className="button-primary"
                          disabled={pending === connection.id}
                          onClick={() => transition(connection.id, "ACCEPTED")}
                        >
                          <Check size={15} />
                          Accept
                        </button>
                        <button
                          className="button-secondary"
                          disabled={pending === connection.id}
                          onClick={() => transition(connection.id, "DECLINED")}
                        >
                          <X size={15} />
                          Decline
                        </button>
                      </>
                    ) : (
                      <button
                        className="button-secondary"
                        disabled={pending === connection.id}
                        onClick={() => transition(connection.id, "CANCELLED")}
                      >
                        Cancel request
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
