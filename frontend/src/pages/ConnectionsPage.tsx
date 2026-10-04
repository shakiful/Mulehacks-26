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
    const [connections, profiles] = await Promise.all([
      api.listConnections(filter ? (filter as ConnectionStatus) : undefined),
      api.listDemoUsers(),
    ]);
    return { connections: connections.items, profiles: profiles.items };
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
        Acceptance records interest only. Each person can complete their post
        separately.
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
          description="Request a connection from a match. Incoming requests appear here for the receiving demo profile."
        />
      ) : (
        <div className="space-y-4">
          {resource.data.connections.map((connection) => {
            const incoming = connection.receiver_id === userId;
            const otherId = incoming
              ? connection.requester_id
              : connection.receiver_id;
            const name =
              resource.data!.profiles.find((profile) => profile.id === otherId)
                ?.name ?? `Demo profile #${otherId}`;
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
