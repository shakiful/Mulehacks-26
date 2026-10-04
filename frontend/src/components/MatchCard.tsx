import { Check, Link2 } from "lucide-react";
import type { Match, MatchingMode } from "../api/types";
import { PostCard } from "./PostCard";
import { Link } from "react-router-dom";

export function MatchCard({
  match,
  mode,
  isMock,
  onConnect,
  pending,
  connected,
  messageId,
}: {
  match: Match;
  mode: MatchingMode;
  isMock: boolean;
  onConnect: () => void;
  pending?: boolean;
  connected?: boolean;
  messageId?: number;
}) {
  return (
    <div className="match-card">
      <div className="match-score">
        <div>
          <strong>
            {match.score.toFixed(1)}
            <span> / 100</span>
          </strong>
          <p>Compatibility score</p>
        </div>
        <span className="mode-tag">
          {mode.toLowerCase()}
          {isMock ? " · fixture" : ""}
        </span>
      </div>
      <PostCard post={match.post}>
        <div className="w-full">
          <ul className="space-y-2 text-sm text-stone-600">
            {match.reasons.map((reason) => (
              <li className="flex gap-2" key={reason}>
                <Check size={16} className="shrink-0 text-emerald-700" />
                {reason}
              </li>
            ))}
          </ul>
          {match.warnings.map((warning) => (
            <p key={warning} className="mt-2 text-xs text-amber-800">
              {warning}
            </p>
          ))}
          <p className="mt-3 text-xs text-stone-500">
            {isMock ? "Illustrative fixture score. " : ""}Compatibility measures
            fit between posts.
          </p>
        </div>
        {messageId ? <Link className="button-primary mt-2 w-full" to={`/messages/connection/${messageId}`}>Message</Link> : <button
          className="button-primary mt-2 w-full"
          disabled={pending || connected}
          onClick={onConnect}
        >
          <Link2 size={16} />
          {connected
            ? "Request sent"
            : pending
              ? "Sending…"
              : "Request connection"}
        </button>}
      </PostCard>
    </div>
  );
}
