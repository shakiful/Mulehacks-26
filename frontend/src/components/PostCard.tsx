import { CalendarDays, MapPin } from "lucide-react";
import type { Post } from "../api/types";
import { categoryNames, ridePlaceLabel } from "../lib/posts";
import type { ReactNode } from "react";
import { CAMPUS_TIME_ZONE, formatCampusDateTime } from "../lib/dateTime";
import { rideDistanceMiles } from '../lib/geo';

export function PostCard({
  post,
  children,
}: {
  post: Post;
  children?: ReactNode;
}) {
  const detailItems = Object.entries(post.details).filter(
    ([key, value]) => value !== null && value !== "" && !key.endsWith("_point"),
  );
  const tripMiles = post.category === 'RIDE' ? rideDistanceMiles(post.details.origin_point, post.details.destination_point) : null;
  return (
    <article className="post-card">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`category-tag category-${post.category.toLowerCase()}`}
        >
          {categoryNames[post.category]}
        </span>
        <span className="eyebrow">{post.intent.toLowerCase()}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">
        {post.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">{post.text}</p>
      <dl className="detail-grid mt-4">
        {detailItems.map(([key, value]) => (
          <div key={key}>
            <dt>
              {key === "seats"
                ? post.intent === "REQUEST"
                  ? "Seats needed"
                  : "Seats offered"
                : key === "group_size"
                  ? "Desired group size"
                  : key.replaceAll("_", " ")}
            </dt>
            <dd>{(post.category === 'RIDE' && (key === 'origin' || key === 'destination')
              ? ridePlaceLabel(value, key) : String(value)).replaceAll("_", " ")}</dd>
          </div>
        ))}
      </dl>
      {tripMiles !== null && <p className="mt-3 text-sm text-stone-500">From → To: {tripMiles.toFixed(2)} miles straight-line. Driving distance may be longer.</p>}
      {post.ride_availability && (
        <p className="notice mt-4">
          {post.ride_availability.remaining_seats} of {post.ride_availability.total_seats} seats remaining
          {" · "}{post.ride_availability.reserved_seats} reserved
        </p>
      )}
      {post.category === "RIDE" && (!post.details.origin_point || !post.details.destination_point) && (
        <p className="mt-3 text-xs text-stone-500">Older ride: edit your open post to add From/To map pins, or create a new mapped ride.</p>
      )}
      {(post.location || post.starts_at) && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-stone-500">
          {post.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={13} />
              {post.location}
            </span>
          )}
          {post.starts_at && (
            <time
              dateTime={post.starts_at}
              title={formatCampusDateTime(post.starts_at)}
              className="inline-flex items-center gap-1.5"
            >
              <CalendarDays size={13} />
              {new Date(post.starts_at).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
                timeZone: CAMPUS_TIME_ZONE,
                hour12: true,
              })}
            </time>
          )}
        </div>
      )}
      <div className="card-footer">
        <span className="avatar">{post.author.name.charAt(0)}</span>
        <span className="text-sm font-medium">{post.author.name}</span>
        <span className="ml-auto text-xs text-stone-500">
          {post.status.toLowerCase()}
        </span>
      </div>
      {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
    </article>
  );
}
