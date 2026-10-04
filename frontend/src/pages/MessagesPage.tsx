import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { Message, ThreadKind } from "../api/types";
import { useApi } from "../context/ApiContext";
import { Field } from "../components/Field";
import { refreshNotifications } from "../lib/notifications";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

const mergeMessages = (current: Message[], incoming: Message[]) =>
  [...new Map([...current, ...incoming].map((item) => [item.id, item])).values()].sort((a, b) => a.id - b.id);

export function MessagesPage() {
  const { kind, id } = useParams();
  const { userId } = useApi();
  const threadId = Number(id);
  if ((kind !== "join" && kind !== "connection") || !Number.isSafeInteger(threadId) || threadId < 1)
    return <ErrorState error={new Error("Choose a conversation from Connections.")} />;
  // An account or route change unmounts every private draft and pending UI operation.
  return <Conversation key={`${userId}:${kind}:${threadId}`} kind={kind} id={threadId} />;
}

function Conversation({ kind, id }: { kind: ThreadKind; id: number }) {
  const { api, userId, scenario } = useApi();
  const [context, setContext] = useState<{ name: string; title: string } | null>(null);
  const [items, setItems] = useState<Message[]>([]);
  const [more, setMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [pollError, setPollError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = ++generation.current;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Poll cursor advances only after reads, so sending cannot skip an unread reply.
    let cursor = 0;
    let acknowledged = -1;
    setLoading(true);
    setContext(null);
    setItems([]);
    setDraft("");
    setError(null);
    setPollError(null);
    setActionError(null);
    setSending(false);
    async function acknowledge() {
      if (!active || acknowledged === cursor) return;
      const through = cursor;
      try {
        await api.readThreadNotifications(kind, id, through || undefined);
        if (!active) return;
        acknowledged = through;
        refreshNotifications();
      } catch {
        // Reading the conversation remains usable; the next poll retries acknowledgement.
      }
    }
    async function poll() {
      try {
        let hasMore: boolean;
        do {
          const firstPage = cursor === 0;
          const result = await api.listMessages(kind, id, cursor ? { after_id: cursor } : {});
          if (!active) return;
          setItems((current) => mergeMessages(current, result.items));
          cursor = result.items.at(-1)?.id ?? cursor;
          if (firstPage) setMore(result.has_more);
          hasMore = !firstPage && result.has_more && result.items.length > 0;
        } while (hasMore);
        setPollError(null);
        await acknowledge();
      } catch (error) {
        if (active) setPollError(error);
      } finally {
        if (active) timer = setTimeout(poll, 4000);
      }
    }
    async function open() {
      try {
        let details: { name: string; title: string };
        if (kind === "join") {
          const join = await api.getJoin(id);
          if (!active) return;
          details = { name: join.requester.id === userId ? join.receiver.name : join.requester.name, title: join.post.title };
        } else {
          const connection = await api.getConnection(id);
          if (!active) return;
          const post = await api.getPost(connection.requester_id === userId ? connection.target_post_id : connection.source_post_id);
          details = { name: post.author.name, title: post.title };
        }
        if (!active) return;
        const result = await api.listMessages(kind, id);
        if (!active) return;
        setContext(details);
        setItems(result.items);
        setMore(result.has_more);
        cursor = result.items.at(-1)?.id ?? 0;
        void acknowledge();
        timer = setTimeout(poll, 4000);
      } catch (error) {
        if (active) setError(error);
      } finally {
        if (active) setLoading(false);
      }
    }
    void open();
    return () => {
      active = false;
      if (generation.current === token) generation.current += 1;
      clearTimeout(timer);
    };
  }, [api, userId, kind, id, scenario, revision]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    const token = generation.current;
    setSending(true);
    setActionError(null);
    try {
      const message = await api.sendMessage(kind, id, draft);
      if (token !== generation.current) return;
      setItems((current) => mergeMessages(current, [message]));
      setDraft("");
      bottom.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      if (token === generation.current) setActionError(error);
    } finally {
      if (token === generation.current) setSending(false);
    }
  }
  async function older() {
    const token = generation.current;
    setOlderLoading(true);
    setActionError(null);
    try {
      const result = await api.listMessages(kind, id, { before_id: items[0].id });
      if (token !== generation.current) return;
      setItems((current) => mergeMessages(current, result.items));
      setMore(result.has_more);
    } catch (error) {
      if (token === generation.current) setActionError(error);
    } finally {
      if (token === generation.current) setOlderLoading(false);
    }
  }
  return <>
    <Link className="text-button mb-5" to="/connections"><ArrowLeft size={15} /> Connections</Link>
    {loading ? <LoadingState label="Opening your conversation…" />
      : error ? <ErrorState error={error} retry={() => setRevision((n) => n + 1)} />
      : context && <>
        <div className="page-heading"><div><p className="eyebrow">YOUR CAMPUS CONVERSATION</p><h1>Message {context.name}</h1><p>{context.title}</p></div></div>
        <p className="notice mb-5">Visible only to you and {context.name}. Messages are saved in the local system; new replies refresh every few seconds.</p>
        {pollError !== null && <div className="mb-4"><ErrorState error={pollError} /><p className="text-sm mt-2">New replies will retry automatically. Your draft is preserved.</p></div>}
        <div className="form-panel">
          {more && <button className="button-secondary mb-4" disabled={olderLoading} onClick={older}>{olderLoading ? "Loading…" : "Load earlier messages"}</button>}
          <div role="log" aria-label="Conversation messages" aria-live="polite" className="max-h-[28rem] overflow-y-auto space-y-3">
            {!items.length ? <EmptyState title="Say your first hello." description="Confirm a meeting time, route or group details together." />
              : items.map((message) => <div key={message.id} className={`flex ${message.sender.id === userId ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.sender.id === userId ? "bg-blue-50" : "bg-stone-100"}`}>
                  <p className="text-xs font-semibold text-stone-600">{message.sender.name}</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>
                  <time className="mt-2 block text-xs text-stone-500" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
                </div>
              </div>)}
            <div ref={bottom} />
          </div>
          {actionError !== null && <div className="mt-4"><ErrorState error={actionError} /></div>}
          <form className="mt-5 space-y-3" onSubmit={send}>
            <Field label="Message" hint={`${draft.length}/2000 characters`}>
              {(props) => <textarea {...props} rows={3} maxLength={2000} required value={draft} disabled={sending} placeholder="Say hello and coordinate the details…" onChange={(event) => setDraft(event.target.value)} />}
            </Field>
            <button type="submit" className="button-primary" disabled={sending || !draft.trim()}><Send size={15} /> {sending ? "Sending…" : "Send message"}</button>
          </form>
        </div>
      </>}
  </>;
}
