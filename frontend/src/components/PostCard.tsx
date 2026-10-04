import { CalendarDays, MapPin } from "lucide-react";
import type { Post } from "../api/types";
import { categoryNames } from "../lib/posts";
import type { ReactNode } from "react";

export function PostCard({
  post,
  children,
}: {
  post: Post;
  children?: ReactNode;
}) {
  const detailItems = Object.entries(post.details).filter(
    ([, value]) => value !== null && value !== "",
  );
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
            <dd>{String(value).replaceAll("_", " ")}</dd>
          </div>
        ))}
      </dl>
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
              title={post.starts_at}
              className="inline-flex items-center gap-1.5"
            >
              <CalendarDays size={13} />
              {new Date(post.starts_at).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
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
