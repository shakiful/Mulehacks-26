import { MessageCircle, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Connection, Post, PostJoin } from "../api/types";
import { useApi } from "../context/ApiContext";
import { Field } from "./Field";
import { ErrorState } from "./States";

export function JoinPost({ post, join, connection, onJoined }: {
  post: Post;
  join?: PostJoin;
  connection?: Connection;
  onJoined: () => void;
}) {
  const { api, userId } = useApi();
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState("1");
  const [canDrive, setCanDrive] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (post.author.id === userId) return null;
  const accepted = join?.status === "ACCEPTED" ? { kind: "join", id: join.id }
    : connection?.status === "ACCEPTED" ? { kind: "connection", id: connection.id } : null;
  if (accepted) return <Link className="button-primary" to={`/messages/${accepted.kind}/${accepted.id}`}><MessageCircle size={16} /> Message</Link>;
  if (join || connection) return <Link className="button-secondary" to="/connections">Request sent · View in Connections</Link>;
  if (post.status !== "OPEN") return null;
  const rideOffer = post.category === "RIDE" && post.intent === "OFFER";
  const rideRequest = post.category === "RIDE" && post.intent === "REQUEST";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.joinPost(post.id, rideOffer ? Number(seats) : undefined);
      onJoined();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return open ? (
    <form className="w-full space-y-3" aria-label={`Join ${post.title}`} onSubmit={submit}>
      <p className="text-sm text-stone-600">
        {rideRequest ? "Joining this ride request means offering to drive the posted route."
          : rideOffer ? "Request seats on this ride. Review the route and departure time above."
          : "Join this post without creating a post of your own."}
        {" "}{post.author.name} will accept or decline in Connections. Messaging opens after acceptance.
      </p>
      {rideOffer && <Field label="Seats to join" hint={`${post.ride_availability?.remaining_seats ?? post.details.seats} seats currently available.`}>
        {(props) => <input {...props} type="number" min="1" step="1" required
          max={post.ride_availability?.remaining_seats ?? post.details.seats} value={seats} disabled={pending}
          onChange={(event) => setSeats(event.target.value)} />}
      </Field>}
      {rideRequest && <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" required checked={canDrive} disabled={pending} onChange={(event) => setCanDrive(event.target.checked)} />
        I can drive this route and provide the requested seats.
      </label>}
      {error !== null && <ErrorState error={error} />}
      <div className="flex gap-2">
        <button className="button-primary" disabled={pending || rideRequest && !canDrive} type="submit">{pending ? "Sending…" : "Send join request"}</button>
        <button className="button-secondary" type="button" disabled={pending} onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
      </div>
    </form>
  ) : <button className="button-primary" onClick={() => setOpen(true)}><UserPlus size={16} /> Join</button>;
}
