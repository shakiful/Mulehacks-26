import { describe, expect, it, vi } from "vitest";
import fixtures from "../../../docs/fixtures/api_examples.json";
import { createLiveApi } from "./live";
import { createMockApi } from "./mock";

const setup = () => createMockApi({ initialUser: fixtures.test_accounts[0], delayMs: 0 });
const signIn = (api: ReturnType<typeof setup>, username: string) => api.login(username, "fixture-only");

describe("notification API contract", () => {
  it("uses the shared session, CSRF and contracted query/read bodies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => new Response(JSON.stringify(
      String(url).endsWith('/auth/session') ? fixtures.signed_in_session : fixtures.notification_list)));
    const api = createLiveApi("/api/", fetcher);
    await api.getSession();
    await api.listNotifications({ limit: 2, unread_only: false, after_id: 0 });
    await api.readNotification(41);
    await api.readNotifications(45);
    await api.readThreadNotifications("join", 21, 31);
    await api.readThreadNotifications("connection", 12);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/auth/session', '/api/notifications?limit=2&unread_only=false&after_id=0',
      '/api/notifications/41', '/api/notifications/read', '/api/notifications/read-thread', '/api/notifications/read-thread',
    ]);
    for (const index of [2, 3, 4, 5]) expect(fetcher.mock.calls[index][1]).toMatchObject({
      method: index === 2 ? 'PATCH' : 'POST', credentials: 'include',
      headers: { 'X-CSRF-Token': fixtures.signed_in_session.csrf_token },
    });
    expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string)).toEqual({ read: true });
    expect(JSON.parse(fetcher.mock.calls[3][1]!.body as string)).toEqual({ through_id: 45 });
    expect(JSON.parse(fetcher.mock.calls[4][1]!.body as string)).toEqual({ kind: 'join', thread_id: 21, through_message_id: 31 });
    expect(JSON.parse(fetcher.mock.calls[5][1]!.body as string)).toEqual({ kind: 'connection', thread_id: 12 });
  });

  it("notifies authors of joins, joiners of acceptance and only recipients of private messages", async () => {
    const api = setup();
    expect((await api.listNotifications()).unread_count).toBe(0);
    const join = await api.joinPost(7);
    expect((await api.listNotifications()).items).toEqual([]);
    await signIn(api, "afsana");
    const request = (await api.listNotifications()).items[0];
    expect(request).toMatchObject({ kind: 'JOIN_REQUEST', actor: { id: 1, name: 'Rafi' }, join_id: join.id, message_id: null, read_at: null });
    expect(Object.keys(request.actor).sort()).toEqual(['id', 'name']);
    await api.updateJoin(join.id, "ACCEPTED");
    expect((await api.listNotifications()).unread_count).toBe(0);
    const first = await api.sendMessage("join", join.id, "PRIVATE synthetic first message");
    const next = await api.sendMessage("join", join.id, "PRIVATE synthetic second message");
    await signIn(api, "rafi");
    const incoming = await api.listNotifications();
    expect(incoming.unread_count).toBe(3);
    expect(incoming.items.map((n) => n.kind)).toEqual(['NEW_MESSAGE', 'NEW_MESSAGE', 'JOIN_ACCEPTED']);
    expect(incoming.items[0].message_id).toBe(next.id);
    expect(JSON.stringify(incoming)).not.toContain('PRIVATE');
    expect(await api.readThreadNotifications("join", join.id, first.id)).toEqual({ unread_count: 1 });
    expect((await api.listNotifications({ unread_only: true })).items[0].message_id).toBe(next.id);
    const reply = await api.sendMessage("join", join.id, "PRIVATE synthetic reply");
    await signIn(api, "afsana");
    expect((await api.listNotifications({ unread_only: true })).items[0]).toMatchObject({ actor: { id: 1 }, kind: 'NEW_MESSAGE', message_id: reply.id });
  });

  it("covers matched requests and acceptance while avoiding failed-event notifications", async () => {
    const api = setup();
    await expect(api.joinPost(42)).rejects.toMatchObject({ status: 403 });
    const connection = await api.createConnection(42, 7);
    await expect(api.sendMessage('connection', connection.id, 'Too early')).rejects.toMatchObject({ status: 409 });
    await expect(api.createConnection(42, 7)).rejects.toMatchObject({ status: 409 });
    await signIn(api, "afsana");
    expect((await api.listNotifications()).items).toHaveLength(1);
    expect((await api.listNotifications()).items[0].kind).toBe('CONNECTION_REQUEST');
    await api.updateConnection(connection.id, 'ACCEPTED');
    await expect(api.updateConnection(connection.id, 'ACCEPTED')).rejects.toMatchObject({ status: 409 });
    expect((await api.listNotifications()).unread_count).toBe(0);
    await signIn(api, "rafi");
    expect((await api.listNotifications()).items).toHaveLength(1);
    expect((await api.listNotifications()).items[0].kind).toBe('CONNECTION_ACCEPTED');
  });

  it("keeps recipient ownership and read timestamps, and requires an active session", async () => {
    const api = setup();
    await api.joinPost(7);
    await signIn(api, "afsana");
    const notice = (await api.listNotifications()).items[0];
    const first = await api.readNotification(notice.id);
    expect(first.read_at).not.toBeNull();
    expect(await api.readNotification(notice.id)).toEqual(first);
    await signIn(api, "rafi");
    await expect(api.readNotification(notice.id)).rejects.toMatchObject({ status: 403 });
    await expect(api.readNotification(99999)).rejects.toMatchObject({ status: 404 });
    await api.logout();
    await expect(api.listNotifications()).rejects.toMatchObject({ status: 401 });
    await expect(api.readNotifications(99999)).rejects.toMatchObject({ status: 401 });
  });

  it("preserves newer activity above the mark-all watermark and pages without losing counts", async () => {
    const api = setup();
    const join = await api.joinPost(7);
    await signIn(api, "afsana");
    await api.updateJoin(join.id, 'ACCEPTED');
    for (let index = 0; index < 5; index++) await api.sendMessage('join', join.id, 'Synthetic page ' + index);
    await signIn(api, "rafi");
    const page = await api.listNotifications({ limit: 2 });
    expect(page).toMatchObject({ unread_count: 6, has_more: true });
    const older = await api.listNotifications({ before_id: page.items[1].id, limit: 2 });
    expect(older.items.every((n) => n.id < page.items[1].id)).toBe(true);
    expect(older.unread_count).toBe(6);
    const earliest = await api.listNotifications({ after_id: 0, limit: 2 });
    expect(earliest.items[0].id).toBeLessThan(earliest.items[1].id);
    await signIn(api, "afsana");
    const newest = await api.sendMessage('join', join.id, 'Synthetic arrival while marking read');
    await signIn(api, "rafi");
    expect(await api.readNotifications(page.items[0].id)).toEqual({ unread_count: 1 });
    expect((await api.listNotifications({ unread_only: true })).items[0].message_id).toBe(newest.id);
    await expect(api.listNotifications({ after_id: 0, before_id: 2 })).rejects.toMatchObject({ status: 422 });
    await expect(api.listNotifications({ limit: 101 })).rejects.toMatchObject({ status: 422 });
    await expect(api.readNotifications(0)).rejects.toMatchObject({ status: 422 });
  });
});
