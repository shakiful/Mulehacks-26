import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Link2 } from "lucide-react";
import { useApi } from "../context/ApiContext";
import { useResource } from "../hooks/useResource";
import { MatchCard } from "../components/MatchCard";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

export function MatchesPage() {
  const { id } = useParams();
  const postId = Number(id);
  const { api, userId, isMock, scenario } = useApi();
  const resource = useResource(async () => {
    const [post, matches, connections] = await Promise.all([
      api.getPost(postId),
      api.getMatches(postId),
      api.listConnections(),
    ]);
    return { post, matches, connections };
  }, [api, userId, postId, scenario]);
  const [pending, setPending] = useState<number | null>(null);
  const [sent, setSent] = useState<number[]>([]);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    setSent([]);
    setError(null);
    setPending(null);
  }, [postId]);
  async function connect(targetId: number) {
    setPending(targetId);
    setError(null);
    try {
      await api.createConnection(postId, targetId);
      setSent((current) => [...current, targetId]);
    } catch (error) {
      setError(error);
    } finally {
      setPending(null);
    }
  }
  if (resource.loading)
    return <LoadingState label="Looking for compatible connections…" />;
  if (resource.error)
    return <ErrorState error={resource.error} retry={resource.reload} />;
  const data = resource.data!;
  return (
    <>
      <Link className="text-button mb-5" to="/my-posts">
        <ArrowLeft size={14} />
        My posts
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR NEXT CONNECTION</p>
          <h1>
            People on the
            <br />
            same wavelength.
          </h1>
          <p>Matches for “{data.post.title}”</p>
        </div>
        <span className="mode-tag">
          {data.matches.matching_mode.toLowerCase()}
          {isMock ? " · fixture" : ""}
        </span>
      </div>
      <p className="notice mb-6">
        {isMock
          ? "Scores are illustrative fixture values. New posts have no scripted matches; real ranking needs the backend. "
          : ""}
        {data.post.category === "RIDE"
          ? "Accepting a Ride connection reserves requested seats. Pending requests hold no seats. The offer stays open until full or marked filled; confirm the actual route together."
          : "An accepted connection records interest. Coordinate details together; orders and payments are not reserved."}
      </p>
      {error !== null && (
        <div className="mb-5">
          <ErrorState error={error} />
        </div>
      )}
      {!data.matches.matches.length ? (
        <EmptyState
          title="No compatible matches yet."
          description={
            isMock
              ? "The mock replays the supplied Study and Ride fixtures. New posts demonstrate the empty state."
              : "Try again as more people post. You can review your post details for better matches."
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {data.matches.matches.map((match) => (
            <MatchCard
              key={match.post.id}
              match={match}
              mode={data.matches.matching_mode}
              isMock={isMock}
              pending={pending === match.post.id}
              connected={
                sent.includes(match.post.id) ||
                data.connections.items.some(
                  (connection) =>
                    connection.source_post_id === postId &&
                    connection.target_post_id === match.post.id &&
                    ["PENDING", "ACCEPTED"].includes(connection.status),
                )
              }
              onConnect={() => connect(match.post.id)}
            />
          ))}
        </div>
      )}
      <Link className="button-secondary mt-6" to="/connections">
        <Link2 size={16} />
        Open connection inbox
      </Link>
    </>
  );
}
