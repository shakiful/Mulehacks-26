import { Bell, CheckCheck, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { NotificationList, StudentNotification } from "../api/types";
import { useApi } from "../context/ApiContext";
import { NOTIFICATIONS_CHANGED, notificationHref, notificationText } from "../lib/notifications";
import { EmptyState, ErrorState, LoadingState } from "./States";

const merge = (items: StudentNotification[], next: StudentNotification[]) => {
  const values = new Map(items.map((item) => [item.id, item]));
  next.forEach((item) => {
    const previous = values.get(item.id);
    // Read status only advances; a delayed list response cannot make it unread again.
    values.set(item.id, { ...item, read_at: item.read_at ?? previous?.read_at ?? null });
  });
  return [...values.values()].sort((a, b) => b.id - a.id);
};

export function NotificationBell() {
  const { api, userId, scenario } = useApi();
  const navigate = useNavigate(), location = useLocation();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationList>({ items: [], unread_count: 0, has_more: false });
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [pending, setPending] = useState<number | "all" | null>(null);
  const [toasts, setToasts] = useState<StudentNotification[]>([]);
  const root = useRef<HTMLDivElement>(null), bell = useRef<HTMLButtonElement>(null);
  const state = useRef(data), path = useRef(location.pathname);
  const generation = useRef(0), mutation = useRef(0);
  const refresh = useRef<() => void>(() => {}), earlier = useRef<() => void>(() => {});
  const toastTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  function save(next: NotificationList) { state.current = next; setData(next); }

  useEffect(() => {
    path.current = location.pathname;
    setOpen(false);
    setToasts((items) => items.filter((item) => item.kind !== "NEW_MESSAGE" || notificationHref(item) !== location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    const token = ++generation.current;
    let active = true, running = false, queued = false, initialized = false, cursor = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    save({ items: [], unread_count: 0, has_more: false });
    setLoading(true); setError(null); setToasts([]); setActionError(null);
    async function load(mode: "snapshot" | "new" | "older" = "snapshot") {
      if (!active) return;
      if (running) { if (mode === "snapshot") queued = true; return; }
      running = true;
      clearTimeout(timer);
      const version = mutation.current;
      setFetching(true);
      try {
        let hasMore: boolean;
        do {
          const before = cursor;
          const query = mode === "older" ? { before_id: state.current.items.at(-1)?.id, limit: 20 }
            : mode === "new" && initialized ? { after_id: cursor, limit: 50 }
            : { limit: Math.min(100, Math.max(20, state.current.items.length)) };
          const result = await api.listNotifications(query);
          if (!active) return;
          if (version !== mutation.current) { queued = true; return; }
          const arriving = initialized && mode !== "older" ? result.items.filter((n) => n.id > before && n.read_at === null
            && !(n.kind === "NEW_MESSAGE" && notificationHref(n) === path.current)) : [];
          cursor = Math.max(cursor, ...result.items.map((n) => n.id));
          save({ items: merge(state.current.items, result.items), unread_count: result.unread_count,
            has_more: mode === "new" && initialized ? state.current.has_more : result.has_more });
          if (arriving.length) {
            setToasts((current) => merge(current, arriving).slice(0, 3));
            arriving.forEach((item) => {
              const timeout = setTimeout(() => {
                toastTimers.current.delete(timeout);
                if (active) setToasts((current) => current.filter((n) => n.id !== item.id));
              }, 8000);
              toastTimers.current.add(timeout);
            });
          }
          initialized = true;
          hasMore = mode === "new" && result.has_more && result.items.length > 0;
        } while (hasMore);
        setError(null);
      } catch (error) {
        if (active) setError(error);
      } finally {
        running = false;
        if (active) {
          setLoading(false); setFetching(false);
          if (queued) { queued = false; void load("snapshot"); }
          else timer = setTimeout(() => void load("new"), 4000);
        }
      }
    }
    refresh.current = () => { void load("snapshot"); };
    earlier.current = () => { void load("older"); };
    const update = () => refresh.current();
    const visible = () => { if (document.visibilityState === "visible") update(); };
    window.addEventListener(NOTIFICATIONS_CHANGED, update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", visible);
    void load();
    return () => {
      active = false;
      if (generation.current === token) generation.current += 1;
      clearTimeout(timer);
      toastTimers.current.forEach(clearTimeout); toastTimers.current.clear();
      window.removeEventListener(NOTIFICATIONS_CHANGED, update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", visible);
      refresh.current = () => {}; earlier.current = () => {};
    };
  }, [api, userId, scenario]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); bell.current?.focus(); } };
    document.addEventListener("mousedown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  async function openItem(item: StudentNotification) {
    const token = generation.current;
    mutation.current += 1;
    setPending(item.id); setActionError(null);
    try {
      const updated = await api.readNotification(item.id);
      if (token !== generation.current) return;
      const wasUnread = state.current.items.find((n) => n.id === item.id)?.read_at === null;
      save({ ...state.current, items: merge(state.current.items, [updated]), unread_count: Math.max(0, state.current.unread_count - Number(wasUnread)) });
      setToasts((current) => current.filter((n) => n.id !== item.id));
      setOpen(false); navigate(notificationHref(item)); refresh.current();
    } catch (error) {
      if (token === generation.current) { setActionError(error); setOpen(true); }
    } finally {
      if (token === generation.current) setPending(null);
    }
  }
  async function markAll() {
    const through = state.current.items[0]?.id;
    if (!through) return;
    const token = generation.current;
    mutation.current += 1;
    setPending("all"); setActionError(null);
    try {
      const result = await api.readNotifications(through);
      if (token !== generation.current) return;
      save({ ...state.current, unread_count: result.unread_count, items: state.current.items.map((n) => n.id <= through ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n) });
      setToasts((current) => current.filter((n) => n.id > through)); refresh.current();
    } catch (error) {
      if (token === generation.current) setActionError(error);
    } finally {
      if (token === generation.current) setPending(null);
    }
  }
  return <div ref={root} className="relative shrink-0">
    <button ref={bell} type="button" className="button-secondary relative !p-2.5" aria-label={`Notifications, ${data.unread_count} unread`}
      aria-expanded={open} aria-controls={panelId} onClick={() => { setOpen(!open); if (!open) refresh.current(); }}>
      <Bell size={20} />
      {data.unread_count > 0 && <span aria-hidden="true" className="absolute -right-1 -top-2 min-w-5 rounded-full bg-red-700 px-1 text-center text-[10px] leading-5 text-white">{data.unread_count > 99 ? "99+" : data.unread_count}</span>}
    </button>
    {open && <section id={panelId} role="dialog" aria-label="Notifications" className="fixed inset-x-4 top-52 z-50 max-h-[calc(100dvh-15rem)] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-4 shadow-xl md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-3 md:max-h-[34rem] md:w-96">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-semibold">Notifications</h2><button className="text-button" aria-label="Close notifications" onClick={() => setOpen(false)}><X size={18} /></button></div>
      <div className="mb-4 flex flex-wrap gap-3">
        <button className="text-button" disabled={fetching} onClick={() => refresh.current()}><RefreshCw size={14} /> Refresh notifications</button>
        <button className="text-button" disabled={!data.unread_count || pending !== null || loading} onClick={markAll}><CheckCheck size={14} /> Mark all as read</button>
      </div>
      {actionError !== null && <div className="mb-3"><ErrorState error={actionError} /></div>}
      {error !== null && <div className="mb-3"><ErrorState error={error} retry={() => refresh.current()} /></div>}
      {loading ? <LoadingState label="Loading notifications…" /> : !data.items.length && !error ? <EmptyState title="You're all caught up." description="Messages and invitation requests will appear here." /> : <ul className="space-y-2">
        {data.items.map((item) => <li key={item.id}>
          <button disabled={pending !== null} onClick={() => openItem(item)} className={`w-full rounded-xl p-3 text-left hover:bg-stone-100 disabled:opacity-50 ${item.read_at ? "bg-white" : "bg-blue-50"}`}>
            <p className={`text-sm ${item.read_at ? "text-stone-600" : "font-semibold text-stone-800"}`}>{notificationText(item)}</p>
            <p className="mt-1 break-words text-xs text-stone-500">{item.post_title}</p>
            <p className="mt-1 text-xs text-stone-500"><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time> · {item.read_at ? "Read" : "Unread"}</p>
          </button>
        </li>)}
      </ul>}
      {data.has_more && <button className="text-button mt-4" disabled={fetching} onClick={() => earlier.current()}>Load earlier notifications</button>}
    </section>}
    <div className="fixed inset-x-4 bottom-4 z-40 space-y-2 sm:left-auto sm:w-80" aria-live="polite" aria-label="New notification alerts">
      {toasts.map((item) => <div key={item.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-lg">
        <div className="flex items-start gap-3"><button className="flex-1 text-left" disabled={pending !== null} onClick={() => openItem(item)}><p className="text-sm font-semibold">{notificationText(item)}</p><p className="mt-1 text-xs text-stone-500">{item.post_title}</p></button>
          <button aria-label="Dismiss notification alert" onClick={() => setToasts((current) => current.filter((n) => n.id !== item.id))}><X size={16} /></button>
        </div>
      </div>)}
    </div>
  </div>;
}
