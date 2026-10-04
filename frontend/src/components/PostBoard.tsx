import { ArrowRight, Check, Pencil } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Category } from "../api/types";
import { useApi } from "../context/ApiContext";
import { useResource } from "../hooks/useResource";
import { PostCard } from "./PostCard";
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
  const resource = useResource(
    () =>
      api.listPosts({
        category,
        limit,
        offset,
        ...(ownOnly && userId !== null ? { user_id: userId } : {}),
      }),
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
  if (resource.loading) return <LoadingState />;
  if (resource.error)
    return <ErrorState error={resource.error} retry={resource.reload} />;
  return (
    <>
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
                    {pendingId === post.id ? "Completing…" : "Mark completed"}
                  </button>
                </>
              )}
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
