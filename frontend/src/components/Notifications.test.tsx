import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../App";
import { ApiProvider } from "../context/ApiContext";
import { createMockApi } from "../api/mock";
import fixtures from "../../../docs/fixtures/api_examples.json";
import type { NotificationList } from "../api/types";
import { refreshNotifications } from "../lib/notifications";
vi.mock("./RideRoutePicker", () => import("../test/MockRideRoutePicker"));

const setup = () => createMockApi({ initialUser: fixtures.test_accounts[0], delayMs: 0 });
function renderApp(api: ReturnType<typeof setup>, path = '/') {
  return render(<ApiProvider mockMode client={api}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></ApiProvider>);
}
const bell = (count: number) => screen.getByRole('button', { name: `Notifications, ${count} unread` });
const panel = () => within(screen.getByRole('dialog', { name: 'Notifications' }));
const alerts = () => within(screen.getByLabelText('New notification alerts'));
async function switchStudent(user: ReturnType<typeof userEvent.setup>, username: string) {
  await user.click(screen.getByRole('button', { name: 'Log out' }));
  await screen.findByRole('heading', { name: 'Welcome back.' });
  await user.type(screen.getByRole('textbox', { name: 'Username' }), username);
  await user.type(screen.getByLabelText('Password'), 'fixture-only');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('navigation', { name: 'Main navigation' });
}

describe('in-app recipient notifications', () => {
  it('polls an incoming invitation, opens the exact request, and clears its badge', async () => {
    const api = setup(), user = userEvent.setup();
    await api.login('afsana', 'fixture-only');
    renderApp(api);
    await screen.findByRole('heading', { name: 'Relational database tutoring' });
    expect(bell(0)).toBeInTheDocument();
    await api.login('rafi', 'fixture-only');
    const join = await api.joinPost(7);
    await api.login('afsana', 'fixture-only');
    await screen.findByRole('button', { name: 'Notifications, 1 unread' }, { timeout: 6000 });
    expect(alerts().getByText('Rafi requested to join your invitation')).toBeInTheDocument();
    await user.click(bell(1));
    await screen.findByRole('dialog', { name: 'Notifications' });
    await user.click(panel().getByRole('button', { name: /Rafi requested to join your invitation/ }));
    const request = (await screen.findByRole('heading', { name: 'Request from Rafi' })).closest('article')!;
    expect(request).toHaveAttribute('id', `join-${join.id}`);
    expect(request).toHaveClass('ring-2');
    expect(bell(0)).toBeInTheDocument();
    await user.click(within(request).getByRole('button', { name: 'Accept' }));
    await screen.findByRole('link', { name: 'Message' });
    await switchStudent(user, 'rafi');
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    expect(alerts().queryByText('Afsana accepted your join request')).not.toBeInTheDocument();
    await user.click(bell(1));
    await user.click(panel().getByRole('button', { name: /Afsana accepted your join request/ }));
    await screen.findByRole('heading', { name: 'Message Afsana' });
    await waitFor(() => expect(bell(0)).toBeInTheDocument());
  }, 15000);

  it('alerts on incoming messages without showing private text, then acknowledges viewed replies', async () => {
    const api = setup(), user = userEvent.setup();
    const join = await api.joinPost(7);
    await api.login('afsana', 'fixture-only');
    await api.updateJoin(join.id, 'ACCEPTED');
    await api.login('rafi', 'fixture-only');
    await api.readNotifications((await api.listNotifications()).items[0].id);
    renderApp(api);
    await screen.findByRole('heading', { name: 'Help with SQL joins' });
    const privateText = 'PRIVATE synthetic message visible only in the conversation';
    await api.login('afsana', 'fixture-only');
    await api.sendMessage('join', join.id, privateText);
    await api.login('rafi', 'fixture-only');
    act(refreshNotifications);
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    expect(alerts().getByText('Afsana sent you a message')).toBeInTheDocument();
    expect(screen.queryByText(privateText)).not.toBeInTheDocument();
    await user.click(bell(1));
    expect(panel().queryByText(privateText)).not.toBeInTheDocument();
    await user.click(panel().getByRole('button', { name: /Afsana sent you a message/ }));
    await screen.findByText(privateText);
    await waitFor(() => expect(bell(0)).toBeInTheDocument());
    await api.login('afsana', 'fixture-only');
    await api.sendMessage('join', join.id, 'Synthetic new reply while reading');
    await api.login('rafi', 'fixture-only');
    act(refreshNotifications);
    await waitFor(() => expect(alerts().queryByText('Afsana sent you a message')).not.toBeInTheDocument());
    await screen.findByText('Synthetic new reply while reading', {}, { timeout: 6000 });
    await waitFor(() => expect(bell(0)).toBeInTheDocument());
    expect((await api.listNotifications()).unread_count).toBe(0);
  }, 15000);

  it('loads historical pages without replaying alerts and preserves new arrivals when marking all read', async () => {
    const api = setup(), user = userEvent.setup();
    const join = await api.joinPost(7);
    await api.login('afsana', 'fixture-only');
    await api.updateJoin(join.id, 'ACCEPTED');
    for (let n = 0; n < 22; n++) await api.sendMessage('join', join.id, `Synthetic history ${n}`);
    await api.login('rafi', 'fixture-only');
    renderApp(api);
    await screen.findByRole('button', { name: 'Notifications, 23 unread' });
    expect(alerts().queryByText('Afsana sent you a message')).not.toBeInTheDocument();
    await user.click(bell(23));
    await user.click(panel().getByRole('button', { name: 'Load earlier notifications' }));
    await waitFor(() => expect(panel().queryByRole('button', { name: 'Load earlier notifications' })).not.toBeInTheDocument());
    expect(panel().getByText('Afsana accepted your join request')).toBeInTheDocument();
    let release!: () => void;
    const original = api.readNotifications;
    const mark = vi.spyOn(api, 'readNotifications').mockImplementationOnce(async (through) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return original(through);
    });
    await user.click(panel().getByRole('button', { name: 'Mark all as read' }));
    await api.login('afsana', 'fixture-only');
    await api.sendMessage('join', join.id, 'Synthetic new arrival during mark-all');
    await api.login('rafi', 'fixture-only');
    act(() => release());
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    expect(mark).toHaveBeenCalledOnce();
    expect((await api.listNotifications({ unread_only: true })).items).toHaveLength(1);
  });

  it('shows notification errors only in the open panel, retries, and supports Escape', async () => {
    const api = setup(), user = userEvent.setup();
    const get = vi.spyOn(api, 'listNotifications').mockRejectedValue(new Error('Synthetic notifications unavailable'));
    renderApp(api);
    await screen.findByRole('heading', { name: 'Help with SQL joins' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(bell(0));
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic notifications unavailable');
    get.mockRestore();
    await user.click(panel().getByRole('button', { name: 'Try again' }));
    await screen.findByText("You're all caught up.");
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
    expect(bell(0)).toHaveFocus();
  });

  it('ignores old-account notifications arriving after logout', async () => {
    const api = setup(), user = userEvent.setup();
    let release!: (value: NotificationList) => void;
    vi.spyOn(api, 'listNotifications').mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    renderApp(api);
    await screen.findByRole('heading', { name: 'Help with SQL joins' });
    await switchStudent(user, 'afsana');
    await screen.findByRole('button', { name: 'Notifications, 0 unread' });
    act(() => release({ items: [{ ...fixtures.notification, kind: 'NEW_MESSAGE', actor: { id: 2, name: 'Afsana' }, post_title: 'PRIVATE old account invitation', message_id: 31 }], unread_count: 9, has_more: false }));
    await user.click(bell(0));
    await screen.findByText("You're all caught up.");
    expect(screen.queryByText('PRIVATE old account invitation')).not.toBeInTheDocument();
    expect(bell(0)).toBeInTheDocument();
  });
});
