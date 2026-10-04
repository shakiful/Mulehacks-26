"""Synthetic direct participation and private conversation regression checks."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Barrier

import pytest
from sqlalchemy import func, select

from backend.app.models import Message, Post
from backend.app.schemas import JoinResponse, MessageResponse
from backend.app.seed import seed
from backend.tests.auth_helpers import auth_headers
from backend.tests.test_ride_seats import accept, connect, get, ride


def post(client, study, user=2, category='STUDY', intent='OFFER'):
    body = deepcopy(study)
    body.update(category=category, intent=intent)
    if category == 'RESTAURANT':
        body['details'] = {'restaurant': 'Synthetic cafe', 'cuisine': None, 'activity_type': 'DINING', 'group_size': 4}
    elif category == 'COMMUNITY':
        body['details'] = {'subcategory': 'ACTIVITY', 'activity': 'Synthetic walk'}
    response = client.post('/api/posts', headers=auth_headers(client, user), json=body)
    assert response.status_code == 201, response.text
    return response.json()


def join(client, target, user=1, seats=None):
    response = client.post(f"/api/posts/{target['id']}/join", headers=auth_headers(client, user),
                           json={} if seats is None else {'seats': seats})
    assert response.status_code == 201, response.text
    return response.json()


def accept_join(client, item):
    return client.patch(f"/api/joins/{item['id']}", headers=auth_headers(client, item['receiver']['id']),
                        json={'status': 'ACCEPTED'})


@pytest.mark.parametrize('category,intent', [
    ('STUDY', 'REQUEST'), ('STUDY', 'OFFER'), ('STUDY', 'PARTNER'),
    ('RESTAURANT', 'REQUEST'), ('RESTAURANT', 'OFFER'),
    ('COMMUNITY', 'REQUEST'), ('COMMUNITY', 'OFFER'), ('COMMUNITY', 'PARTNER'),
])
def test_join_existing_post_without_creating_a_counterpart(client, study, category, intent):
    target = post(client, study, category=category, intent=intent)
    with client.app.state.session_factory() as db:
        count = db.scalar(select(func.count()).select_from(Post))
    item = join(client, target)
    JoinResponse.model_validate(item)
    assert item['status'] == 'PENDING'
    assert item['requester'] == {'id': 1, 'name': 'Rafi'}
    assert item['receiver'] == {'id': 2, 'name': 'Afsana'}
    assert item['post']['id'] == target['id']
    assert accept_join(client, item).json()['status'] == 'ACCEPTED'
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Post)) == count
    assert get(client, target)['status'] == 'OPEN'


def test_join_permissions_duplicates_and_transitions(client, study):
    target = post(client, study)
    path = f"/api/posts/{target['id']}/join"
    assert client.post(path, headers=auth_headers(client, 2), json={}).status_code == 403
    assert client.post(path, json={}).status_code == 401
    no_csrf = {'Cookie': auth_headers(client)['Cookie']}
    assert client.post(path, headers=no_csrf, json={}).status_code == 403
    assert client.post(path, headers=auth_headers(client), json={'requester_id': 3}).status_code == 422
    assert client.post(path, headers=auth_headers(client), json={'seats': 1}).status_code == 422
    item = join(client, target)
    assert client.post(path, headers=auth_headers(client), json={}).status_code == 409
    update = f"/api/joins/{item['id']}"
    assert client.patch(update, headers=auth_headers(client, 1), json={'status': 'ACCEPTED'}).status_code == 403
    assert client.patch(update, headers=auth_headers(client, 2), json={'status': 'CANCELLED'}).status_code == 403
    assert client.get(update, headers=auth_headers(client, 3)).status_code == 403
    assert client.get('/api/joins', headers=auth_headers(client, 3)).json()['items'] == []
    assert client.get('/api/joins?status=PENDING', headers=auth_headers(client, 2)).json()['items'][0]['id'] == item['id']
    assert client.get('/api/joins?status=unknown', headers=auth_headers(client)).status_code == 422
    assert client.patch(update, headers=auth_headers(client), json={'status': 'CANCELLED'}).status_code == 200
    assert accept_join(client, item).status_code == 409
    retry = join(client, target)
    assert client.patch(f"/api/joins/{retry['id']}", headers=auth_headers(client, 2), json={'status': 'DECLINED'}).status_code == 200
    assert join(client, target)['id'] != retry['id']


def test_closed_and_changed_posts_cannot_be_accepted(client, study):
    target = post(client, study)
    item = join(client, target)
    body = deepcopy(study)
    body['intent'] = 'PARTNER'
    assert client.put(f"/api/posts/{target['id']}", headers=auth_headers(client, 2), json=body).status_code == 200
    assert accept_join(client, item).status_code == 409
    assert client.patch(f"/api/posts/{target['id']}", headers=auth_headers(client, 2), json={'status': 'COMPLETED'}).status_code == 200
    assert client.post(f"/api/posts/{target['id']}/join", headers=auth_headers(client), json={}).status_code == 409
    assert client.patch(f"/api/joins/{item['id']}", headers=auth_headers(client), json={'status': 'CANCELLED'}).status_code == 200
    assert client.get('/api/joins/999999', headers=auth_headers(client)).status_code == 404


@pytest.mark.parametrize('kind', ['join', 'connection'])
def test_messages_require_acceptance_and_both_participants_can_reply(client, study, kind):
    target = post(client, study)
    item = join(client, target) if kind == 'join' else connect(client, post(client, study, 1, intent='REQUEST'), target)
    path = f"/api/{'joins' if kind == 'join' else 'connections'}/{item['id']}"
    for method in ('get', 'post'):
        kwargs = {'json': {'text': 'Synthetic hello'}} if method == 'post' else {}
        assert getattr(client, method)(path + '/messages', headers=auth_headers(client), **kwargs).status_code == 409
    result = accept_join(client, item) if kind == 'join' else accept(client, item)
    assert result.status_code == 200, result.text
    first = client.post(path + '/messages', headers=auth_headers(client), json={'text': '  Synthetic hello\nhttps://example.invalid  '})
    assert first.status_code == 201, first.text
    assert first.headers['cache-control'] == 'no-store'
    message = first.json()
    MessageResponse.model_validate(message)
    assert message['sender'] == {'id': 1, 'name': 'Rafi'}
    assert message['text'] == 'Synthetic hello\nhttps://example.invalid'
    assert message[f'{kind}_id'] == item['id']
    reply = client.post(path + '/messages', headers=auth_headers(client, 2), json={'text': '<b>Synthetic reply</b>'})
    assert reply.status_code == 201
    assert reply.json()['sender'] == {'id': 2, 'name': 'Afsana'}
    for user in (1, 2):
        assert client.get(path + '/messages', headers=auth_headers(client, user)).json()['items'] == [message, reply.json()]
    assert client.get(path, headers=auth_headers(client, 3)).status_code == 403
    assert client.get(path + '/messages', headers=auth_headers(client, 3)).status_code == 403
    assert client.post(path + '/messages', headers=auth_headers(client, 3), json={'text': 'Forbidden'}).status_code == 403
    assert client.get(path + '/messages').status_code == 401
    assert client.post(path + '/messages', headers={'Cookie': auth_headers(client)['Cookie']}, json={'text': 'No CSRF'}).status_code == 403
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Message)) == 2


@pytest.mark.parametrize('body', [{'text': ''}, {'text': ' \n '}, {'text': 'x' * 2001}, {'text': 'Hi', 'sender_id': 2}, {'text': 'Hi', 'join_id': 99}])
def test_message_validation_and_sender_spoofing(client, study, body):
    item = join(client, post(client, study))
    assert accept_join(client, item).status_code == 200
    assert client.post(f"/api/joins/{item['id']}/messages", headers=auth_headers(client), json=body).status_code == 422


def test_message_pagination_filters_threads_and_orders_chronologically(client, study):
    a, b = join(client, post(client, study)), join(client, post(client, study))
    assert accept_join(client, a).status_code == accept_join(client, b).status_code == 200
    path = f"/api/joins/{a['id']}/messages"
    ids = []
    for index in range(5):
        client.post(f"/api/joins/{b['id']}/messages", headers=auth_headers(client), json={'text': 'Other thread'})
        ids.append(client.post(path, headers=auth_headers(client, 1 if index % 2 == 0 else 2), json={'text': f'Synthetic {index}'}).json()['id'])
    def page(query):
        response = client.get(path + query, headers=auth_headers(client))
        assert response.headers['cache-control'] == 'no-store'
        return response.json()
    latest = page('?limit=2')
    assert [m['id'] for m in latest['items']] == ids[-2:]
    assert latest['has_more'] is True
    earlier = page(f'?limit=2&before_id={ids[-2]}')
    assert [m['id'] for m in earlier['items']] == ids[1:3]
    assert earlier['has_more'] is True
    new = page(f'?limit=2&after_id={ids[1]}')
    assert [m['id'] for m in new['items']] == ids[2:4]
    assert new['has_more'] is True
    assert page(f'?after_id={ids[-1]}') == {'items': [], 'has_more': False}
    for query in ('?limit=0', '?limit=101', '?before_id=0', '?after_id=-1', '?before_id=1&after_id=2'):
        assert client.get(path + query, headers=auth_headers(client)).status_code == 422


def test_direct_seats_share_capacity_with_matched_rides_and_lock_edits(client):
    offer = ride(client, 2, 'OFFER', 4)
    direct = join(client, offer, seats=2)
    assert get(client, offer)['ride_availability']['remaining_seats'] == 4
    assert accept_join(client, direct).json()['reserved_seats'] == 2
    assert get(client, offer)['ride_availability'] == {'total_seats': 4, 'reserved_seats': 2, 'remaining_seats': 2}
    larger_request = ride(client, 3, seats=3)
    assert client.post('/api/connections', headers=auth_headers(client, 3), json={'source_post_id': larger_request['id'], 'target_post_id': offer['id']}).status_code == 400
    body = {k: offer[k] for k in ('category', 'intent', 'title', 'text', 'location', 'starts_at', 'ends_at', 'details')}
    body['details'] = {**body['details'], 'origin': 'Changed route'}
    assert client.put(f"/api/posts/{offer['id']}", headers=auth_headers(client, 2), json=body).status_code == 409
    body['details'] = {**offer['details'], 'seats': 1}
    assert client.put(f"/api/posts/{offer['id']}", headers=auth_headers(client, 2), json=body).status_code == 409
    matched = connect(client, ride(client, 4, seats=2), offer)
    assert accept(client, matched).status_code == 200
    assert get(client, offer)['status'] == 'COMPLETED'
    assert get(client, offer)['ride_availability']['reserved_seats'] == 4


def test_driver_can_join_request_without_creating_an_offer_and_prevents_second_booking(client):
    request = ride(client, 1, seats=2)
    match = connect(client, request, ride(client, 2, 'OFFER', 4))
    driver = join(client, request, 3)
    accepted = accept_join(client, driver)
    assert accepted.status_code == 200
    assert accepted.json()['reserved_seats'] == 2
    assert get(client, request)['status'] == 'COMPLETED'
    assert accept(client, match).status_code == 409


@pytest.mark.parametrize('seats', [None, 0, -1, 1.5, True, '1', 5])
def test_offer_join_validates_requested_seats(client, seats):
    offer = ride(client, 2, 'OFFER', 4)
    response = client.post(f"/api/posts/{offer['id']}/join", headers=auth_headers(client), json={} if seats is None else {'seats': seats})
    assert response.status_code == (409 if seats == 5 else 422)


def test_concurrent_direct_and_matched_acceptance_cannot_oversell(client):
    offer = ride(client, 2, 'OFFER', 2)
    direct = join(client, offer, seats=2)
    matched = connect(client, ride(client, 3, seats=1), offer)
    barrier = Barrier(2)
    def run(callback, item):
        barrier.wait(timeout=10)
        return callback(client, item).status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(run, accept_join, direct), executor.submit(run, accept, matched)]
        assert sorted(f.result(timeout=20) for f in futures) == [200, 409]
    availability = get(client, offer)['ride_availability']
    assert availability['reserved_seats'] in (1, 2)
    assert availability['remaining_seats'] >= 0


def test_seed_refresh_preserves_direct_ride_bookings_and_messages(client, settings):
    offer = next(p for p in client.get('/api/posts?category=RIDE', headers=auth_headers(client)).json()['items'] if p['intent'] == 'OFFER')
    direct = join(client, offer, seats=1)
    assert accept_join(client, direct).status_code == 200
    path = f"/api/joins/{direct['id']}/messages"
    message = client.post(path, headers=auth_headers(client), json={'text': 'Synthetic persistent conversation'}).json()
    before = get(client, offer)
    seed(settings, refresh=True)
    assert get(client, offer) == before
    assert client.get(path, headers=auth_headers(client, 2)).json()['items'] == [message]
