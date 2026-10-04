"""Private recipient notifications, atomic events and bounded read watermarks."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.app import notifications
from backend.app.main import create_app
from backend.app.models import Message, Notification, PostJoin
from backend.app.schemas import NotificationList, NotificationResponse
from backend.app.seed import seed
from backend.tests.auth_helpers import auth_headers
from backend.tests.test_joins_messages import accept_join, join, post
from backend.tests.test_ride_seats import accept, connect, get, ride


def inbox(client, user=1, query=''):
    response = client.get('/api/notifications' + query, headers=auth_headers(client, user))
    assert response.status_code == 200, response.text
    assert response.headers['cache-control'] == 'no-store'
    NotificationList.model_validate(response.json())
    return response.json()


def thread(client, study, kind='join'):
    target = post(client, study)
    item = join(client, target) if kind == 'join' else connect(client, post(client, study, 1, intent='REQUEST'), target)
    return item, f"/api/{'joins' if kind == 'join' else 'connections'}/{item['id']}"


def send(client, path, user=2, text='PRIVATE synthetic message marker'):
    response = client.post(path + '/messages', headers=auth_headers(client, user), json={'text': text})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize('kind', ['join', 'connection'])
def test_request_acceptance_and_messages_notify_only_the_other_student(client, study, kind):
    item, path = thread(client, study, kind)
    assert inbox(client)['unread_count'] == 0
    incoming = inbox(client, 2)
    assert incoming['unread_count'] == 1
    notice = incoming['items'][0]
    NotificationResponse.model_validate(notice)
    assert notice['kind'] == ('JOIN_REQUEST' if kind == 'join' else 'CONNECTION_REQUEST')
    assert notice['actor'] == {'id': 1, 'name': 'Rafi'}
    assert notice[f'{kind}_id'] == item['id']
    assert notice['message_id'] is None and notice['read_at'] is None
    assert client.patch(f"/api/notifications/{notice['id']}", headers=auth_headers(client), json={'read': True}).status_code == 403
    result = accept_join(client, item) if kind == 'join' else accept(client, item)
    assert result.status_code == 200
    assert inbox(client, 2)['unread_count'] == 0
    assert inbox(client, 2)['items'][0]['read_at'].endswith('Z')
    assert inbox(client)['items'][0]['kind'] == ('JOIN_ACCEPTED' if kind == 'join' else 'CONNECTION_ACCEPTED')
    message = send(client, path)
    sent = send(client, path, 1, 'PRIVATE synthetic reply marker')
    assert inbox(client)['unread_count'] == 2
    assert inbox(client, 2)['unread_count'] == 1
    new = inbox(client)['items'][0]
    assert new['kind'] == 'NEW_MESSAGE' and new['message_id'] == message['id']
    assert new['actor'] == {'id': 2, 'name': 'Afsana'}
    assert inbox(client, 2)['items'][0]['message_id'] == sent['id']
    assert 'PRIVATE synthetic' not in str(inbox(client))
    assert all(n['actor']['id'] == 2 for n in inbox(client)['items'])
    assert all(n['actor']['id'] == 1 for n in inbox(client, 2)['items'])
    assert inbox(client, 3) == {'items': [], 'unread_count': 0, 'has_more': False}


def test_failed_or_duplicate_join_and_messages_do_not_make_alerts(client, study):
    item, path = thread(client, study)
    assert client.post(path + '/messages', headers=auth_headers(client), json={'text': 'Too early'}).status_code == 409
    assert client.post(f"/api/posts/{item['post']['id']}/join", headers=auth_headers(client), json={}).status_code == 409
    assert client.patch(path, headers=auth_headers(client), json={'status': 'ACCEPTED'}).status_code == 403
    assert inbox(client, 2)['unread_count'] == 1
    assert accept_join(client, item).status_code == 200
    assert accept_join(client, item).status_code == 409
    assert client.post(path + '/messages', headers=auth_headers(client), json={'text': ''}).status_code == 422
    assert client.post(path + '/messages', headers=auth_headers(client, 3), json={'text': 'Forbidden'}).status_code == 403
    assert len(inbox(client)['items']) == 1
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Notification)) == 2


@pytest.mark.parametrize('operation', ['create', 'accept', 'message'])
def test_notification_failures_roll_back_the_underlying_event(client, study, monkeypatch, operation):
    target = ride(client, 2, 'OFFER', 4) if operation == 'accept' else post(client, study)
    item = None if operation == 'create' else join(client, target, seats=1 if operation == 'accept' else None)
    if operation == 'message':
        assert accept_join(client, item).status_code == 200
    name = 'message_event' if operation == 'message' else 'request_event'
    original = getattr(notifications, name)
    def fail_after_enqueue(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError('Synthetic transaction rollback')
    monkeypatch.setattr(notifications, name, fail_after_enqueue)
    before = inbox(client, 2)
    with pytest.raises(RuntimeError, match='Synthetic transaction rollback'):
        if operation == 'create':
            join(client, target)
        elif operation == 'accept':
            accept_join(client, item)
        else:
            send(client, f"/api/joins/{item['id']}")
    assert inbox(client, 2) == before
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Message)) == 0
        if operation == 'create':
            assert db.scalar(select(func.count()).select_from(PostJoin)) == 0
        if operation == 'accept':
            assert db.get(PostJoin, item['id']).status == 'PENDING'
    if operation == 'accept':
        assert get(client, target)['ride_availability']['remaining_seats'] == 4


def test_read_ownership_strict_input_and_idempotence(client, study):
    item, _ = thread(client, study)
    notice = inbox(client, 2)['items'][0]
    path = f"/api/notifications/{notice['id']}"
    assert client.get('/api/notifications').status_code == 401
    assert client.patch(path, headers={'Cookie': auth_headers(client, 2)['Cookie']}, json={'read': True}).status_code == 403
    assert client.patch(path, headers=auth_headers(client, 3), json={'read': True}).status_code == 403
    for body in ({'read': False}, {'read': 1}, {'read': 'true'}, {'read': True, 'recipient_id': 2}, {}):
        assert client.patch(path, headers=auth_headers(client, 2), json=body).status_code == 422
    first = client.patch(path, headers=auth_headers(client, 2), json={'read': True})
    assert first.headers['cache-control'] == 'no-store'
    assert first.json()['read_at'] is not None
    assert client.patch(path, headers=auth_headers(client, 2), json={'read': True}).json() == first.json()
    assert inbox(client, 2)['unread_count'] == 0
    assert client.patch('/api/notifications/999999', headers=auth_headers(client, 2), json={'read': True}).status_code == 404


def test_pages_counts_and_mark_all_watermark_preserve_new_arrivals(client, study):
    item, path = thread(client, study)
    assert accept_join(client, item).status_code == 200
    for _ in range(5):
        send(client, path)
    all_items = inbox(client)['items']
    latest = inbox(client, query='?limit=2')
    assert latest['items'] == all_items[:2] and latest['has_more'] is True
    assert latest['unread_count'] == 6
    older = inbox(client, query=f"?limit=2&before_id={latest['items'][-1]['id']}")
    assert older['items'] == all_items[2:4]
    after = inbox(client, query=f"?limit=2&after_id={all_items[-1]['id']}")
    assert [n['id'] for n in after['items']] == [n['id'] for n in reversed(all_items)][1:3]
    through = all_items[0]['id']
    newest_message = send(client, path)
    marked = client.post('/api/notifications/read', headers=auth_headers(client), json={'through_id': through})
    assert marked.json() == {'unread_count': 1}
    assert marked.headers['cache-control'] == 'no-store'
    remaining = inbox(client, query='?unread_only=true&limit=1')
    assert remaining['items'][0]['message_id'] == newest_message['id']
    assert remaining['unread_count'] == 1 and remaining['has_more'] is False
    assert inbox(client, 2)['items'][0]['read_at'] is not None
    for query in ('?limit=0', '?limit=101', '?before_id=0', '?after_id=-1', '?before_id=1&after_id=2'):
        assert client.get('/api/notifications' + query, headers=auth_headers(client)).status_code == 422
    assert len(inbox(client, query='?after_id=0')['items']) == 7
    for body in ({'through_id': 0}, {'through_id': True}, {'through_id': '1'}, {'through_id': 1, 'recipient_id': 2}):
        assert client.post('/api/notifications/read', headers=auth_headers(client), json=body).status_code == 422


@pytest.mark.parametrize('kind', ['join', 'connection'])
def test_open_thread_acknowledges_only_its_displayed_messages(client, study, kind):
    item, path = thread(client, study, kind)
    body = {'kind': kind, 'thread_id': item['id']}
    assert client.post('/api/notifications/read-thread', headers=auth_headers(client), json=body).status_code == 409
    assert (accept_join(client, item) if kind == 'join' else accept(client, item)).status_code == 200
    other, other_path = thread(client, study, kind)
    assert (accept_join(client, other) if kind == 'join' else accept(client, other)).status_code == 200
    displayed = send(client, path)
    unread = send(client, path)
    elsewhere = send(client, other_path)
    assert client.post('/api/notifications/read-thread', headers=auth_headers(client, 3), json=body).status_code == 403
    assert client.post('/api/notifications/read-thread', headers=auth_headers(client), json=body).status_code == 200
    assert inbox(client)['unread_count'] == 4  # Other acceptance + three messages.
    response = client.post('/api/notifications/read-thread', headers=auth_headers(client), json={**body, 'through_message_id': displayed['id']})
    assert response.json() == {'unread_count': 3}
    pending = inbox(client, query='?unread_only=true')['items']
    assert {n['message_id'] for n in pending if n['kind'] == 'NEW_MESSAGE'} == {unread['id'], elsewhere['id']}


def test_notifications_and_reads_persist_without_historical_backfill(client, study, settings):
    item, path = thread(client, study)
    assert accept_join(client, item).status_code == 200
    send(client, path)
    through = inbox(client)['items'][0]['id']
    client.post('/api/notifications/read', headers=auth_headers(client), json={'through_id': through})
    before = inbox(client)
    # A message inserted by an older version has no event; startup leaves it that way.
    with client.app.state.session_factory.begin() as db:
        db.add(Message(join_id=item['id'], sender_id=2, text='Synthetic historical message'))
    seed(settings)
    with TestClient(create_app(settings)) as restarted:
        assert inbox(restarted) == before
        assert restarted.get(path + '/messages', headers=auth_headers(restarted)).json()['items'][-1]['text'] == 'Synthetic historical message'
