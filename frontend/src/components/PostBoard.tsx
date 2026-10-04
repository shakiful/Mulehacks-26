import { ArrowRight, Check, Pencil } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Category } from "../api/types";
import { useApi } from "../context/ApiContext";
import { useResource } from "../hooks/useResource";
import { PostCard } from "./PostCard";
import { JoinPost } from "./JoinPost";
import { EmptyState, ErrorState, LoadingState } from "./States";

export function PostBoard({
  category,
  limit = 20,
  ownOnly = false,
}: {
  category?: Category;
  limit?: number;
  ownOnly?: boolean;
}) {
  const { api, userId, scenario } = useApi();
  const [offset, setOffset] = useState(0);
  const [actionError, setActionError] = useState<unknown>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const resource = useResource(
    async () => {
      const [posts, joins, connections] = await Promise.all([api.listPosts({
        category,
        limit,
        offset,
        ...(ownOnly && userId !== null ? { user_id: userId } : {}),
      }), api.listJoins(), api.listConnections()]);
      const ids = [...new Set(connections.items.filter((c) => c.status === "ACCEPTED")
        .map((c) => c.requester_id === userId ? c.target_post_id : c.source_post_id))];
      const otherPosts = await Promise.all(ids.map((id) => api.getPost(id)));
      return { ...posts, joins: joins.items, connections: connections.items,
        names: new Map(otherPosts.map((p) => [p.author.id, p.author.name])) };
    },
    [api, userId, category, limit, offset, ownOnly, scenario],
  );
  async function complete(id: number) {
    setActionError(null);
    setPendingId(id);
    try {
      await api.updatePost(id, "COMPLETED");
      resource.reload();
    } catch (error) {
      setActionError(error);
    } finally {
      setPendingId(null);
    }
  }
  if (resource.loading) return <>{notice && <p role="status" className="notice mb-4">{notice}</p>}<LoadingState /></>;
  if (resource.error)
    return <ErrorState error={resource.error} retry={resource.reload} />;
  return (
    <>
      {notice && <p role="status" className="notice mb-4">{notice}</p>}
      {actionError !== null && (
        <div className="mb-4">
          <ErrorState error={actionError} />
        </div>
      )}
      {!resource.data?.items.length ? (
        <EmptyState />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {resource.data.items.map((post) => (
            <PostCard key={post.id} post={post}>
              <JoinPost post={post}
                join={resource.data!.joins.find((j) => j.post.id === post.id && j.requester.id === userId && ["PENDING", "ACCEPTED"].includes(j.status))}
                connection={resource.data!.connections.filter((c) => [c.source_post_id, c.target_post_id].includes(post.id) && ["PENDING", "ACCEPTED"].includes(c.status))
                  .sort((a, b) => Number(b.status === "ACCEPTED") - Number(a.status === "ACCEPTED"))[0]}
                onJoined={() => { setNotice("Join request sent. The author can accept it in Connections; then you can both message."); resource.reload(); }} />
              {post.author.id === userId && post.status === "OPEN" && (
                <>
                  <Link className="button-secondary" to={`/posts/${post.id}/edit`}>
                    <Pencil size={14} /> Edit post
                  </Link>
                  <Link
                    className="button-secondary"
                    to={`/posts/${post.id}/matches`}
                  >
                    Find matches <ArrowRight size={14} />
                  </Link>
                  <button
                    className="text-button"
                    disabled={pendingId === post.id}
                    onClick={() => complete(post.id)}
                  >
                    <Check size={14} />
                    {pendingId === post.id ? "Completing…" : post.category === "RIDE" && post.intent === "OFFER" ? "Mark filled" : "Mark completed"}
                  </button>
                </>
              )}
              {post.author.id === userId && resource.data!.joins.filter((j) => j.post.id === post.id && j.status === "ACCEPTED").map((j) =>
                <Link key={`join-${j.id}`} className="button-secondary" to={`/messages/join/${j.id}`}>Message {j.requester.name}</Link>)}
              {post.author.id === userId && resource.data!.connections.filter((c) => [c.source_post_id, c.target_post_id].includes(post.id) && c.status === "ACCEPTED").map((c) =>
                <Link key={`connection-${c.id}`} className="button-secondary" to={`/messages/connection/${c.id}`}>Message {resource.data!.names.get(c.requester_id === userId ? c.receiver_id : c.requester_id) ?? "student"}</Link>)}
            </PostCard>
          ))}
        </div>
      )}
      {resource.data && (offset > 0 || resource.data.total > limit) && (
        <div className="mt-5 flex items-center justify-between">
          <button
            className="button-secondary"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </button>
          <span className="text-xs text-stone-500">
            {offset + 1}–{Math.min(offset + limit, resource.data.total)} of{" "}
            {resource.data.total}
          </span>
          <button
            className="button-secondary"
            disabled={offset + limit >= resource.data.total}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
