import { useEffect, useState } from "react";
import { Check, MessageCircle, RefreshCw, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { refreshNotifications } from "../lib/notifications";
import type { ConnectionStatus, ThreadKind } from "../api/types";
import { useApi } from "../context/ApiContext";
import { useResource } from "../hooks/useResource";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

export function ConnectionsPage() {
  const { api, userId, scenario } = useApi();
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [params] = useSearchParams();
  const highlighted = `${params.get("kind")}-${params.get("id")}`;
  const resource = useResource(async () => {
    const status = filter ? filter as ConnectionStatus : undefined;
    const [connections, joins] = await Promise.all([api.listConnections(status), api.listJoins(status)]);
    const ids = [...new Set(connections.items.map((c) => c.receiver_id === userId ? c.source_post_id : c.target_post_id))];
    const posts = await Promise.all(ids.map((id) => api.getPost(id)));
    return [
      ...connections.items.map((c) => ({ ...c, kind: "connection" as const,
        name: posts.find((p) => p.id === (c.receiver_id === userId ? c.source_post_id : c.target_post_id))?.author.name ?? "Student",
        description: `Post #${c.source_post_id} → Post #${c.target_post_id}` })),
      ...joins.items.map((j) => ({ ...j, kind: "join" as const, requester_id: j.requester.id, receiver_id: j.receiver.id,
        name: j.receiver.id === userId ? j.requester.name : j.receiver.name,
        description: `Join “${j.post.title}”${j.category === "RIDE" && j.post_intent === "REQUEST" ? " · Offering to drive" : j.requested_seats ? ` · ${j.requested_seats} seat(s) requested` : ""}` })),
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  }, [api, userId, filter, scenario]);
  useEffect(() => {
    if (resource.data) document.getElementById(highlighted)?.scrollIntoView?.({ block: "center" });
  }, [resource.data, highlighted]);
  async function transition(kind: ThreadKind, id: number, status: "ACCEPTED" | "DECLINED" | "CANCELLED") {
    setPending(`${kind}:${id}`);
    setError(null);
    try {
      await (kind === "join" ? api.updateJoin(id, status) : api.updateConnection(id, status));
      refreshNotifications();
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
          <p>Accept a join or match request, then message each other.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="connection-filter">Filter connections</label>
          <select id="connection-filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">All connections</option>
            {["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"].map((status) => <option key={status} value={status}>{status.toLowerCase()}</option>)}
          </select>
          <button className="button-secondary" disabled={resource.loading} onClick={resource.reload}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>
      <p className="notice mb-6">
        Accepting a Ride offer join reserves seats; accepting a driver for a Ride request completes it.
        Partially filled offers stay open. Study, Food and Community acceptance records participation.
        Message is available to both students after acceptance.
      </p>
      {error !== null && <div className="mb-5"><ErrorState error={error} /></div>}
      {resource.loading ? <LoadingState label="Opening your inbox…" />
        : resource.error ? <ErrorState error={resource.error} retry={resource.reload} />
        : !resource.data?.length ? <EmptyState title="Your next hello is waiting." description="Join an existing post or request a connection from a match. Incoming requests appear here for the author." />
        : <div className="space-y-4">{resource.data.map((item) => {
          const incoming = item.receiver_id === userId;
          const busy = pending === `${item.kind}:${item.id}`;
          return <article id={`${item.kind}-${item.id}`} key={`${item.kind}:${item.id}`} className={`post-card flex flex-wrap items-center gap-4 ${highlighted === `${item.kind}-${item.id}` ? "ring-2 ring-blue-300" : ""}`}>
            <span className="avatar h-11 w-11 text-base">{item.name.charAt(0)}</span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{incoming ? "Request from" : "Request to"} {item.name}</h2>
              <p className="mt-1 text-xs text-stone-500 break-words">{item.description} · {new Date(item.created_at).toLocaleDateString()}</p>
            </div>
            {item.reserved_seats > 0 && <p className="text-sm font-medium">{item.reserved_seats} seat(s) reserved</p>}
            <span className="mode-tag">{item.status.toLowerCase()}</span>
            {item.status === "ACCEPTED" && <Link className="button-primary" to={`/messages/${item.kind}/${item.id}`}><MessageCircle size={15} /> Message</Link>}
            {item.status === "PENDING" && <div className="flex gap-2">
              {incoming ? <>
                <button className="button-primary" disabled={busy} onClick={() => transition(item.kind, item.id, "ACCEPTED")}><Check size={15} /> Accept</button>
                <button className="button-secondary" disabled={busy} onClick={() => transition(item.kind, item.id, "DECLINED")}><X size={15} /> Decline</button>
              </> : <button className="button-secondary" disabled={busy} onClick={() => transition(item.kind, item.id, "CANCELLED")}>Cancel request</button>}
            </div>}
          </article>;
        })}</div>}
    </>
  );
}
