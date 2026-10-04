from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import date
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import func, select

from backend.app.main import create_app
from backend.app.models import Connection, Post, RideReservation
from backend.app.rides import distance_km
from backend.app.schemas import GeoPoint
from backend.app.seed import DEMO_ROUTE, seed


def headers(user):
    return {'X-Demo-User-Id': str(user)}


def ride(client, user=1, intent='REQUEST', seats=1, **details):
    response = client.post('/api/posts', headers=headers(user), json={
        'category': 'RIDE', 'intent': intent, 'title': 'Synthetic mapped ride',
        'text': 'Synthetic route and passengers', 'starts_at': '2026-10-03T18:00:00-05:00',
        'details': {'origin': 'Pickup', 'destination': 'Dropoff', 'seats': seats, **DEMO_ROUTE, **details},
    })
    assert response.status_code == 201, response.text
    return response.json()


def connect(client, source, target):
    response = client.post('/api/connections', headers=headers(source['author']['id']),
                           json={'source_post_id': source['id'], 'target_post_id': target['id']})
    assert response.status_code == 201, response.text
    return response.json()


def accept(client, connection):
    return client.patch(f"/api/connections/{connection['id']}", headers=headers(connection['receiver_id']),
                        json={'status': 'ACCEPTED'})


def get(client, post):
    return client.get(f"/api/posts/{post['id']}", headers=headers(1)).json()


@pytest.mark.parametrize('field,value', [
    ('origin_point', None), ('destination_point', None),
    ('origin_point', {'lat': 91, 'lng': 0}), ('destination_point', {'lat': 0, 'lng': -181}),
    ('origin_point', {'lat': True, 'lng': 0}), ('origin_point', {'lat': '38', 'lng': 0}),
    ('origin_point', {'lat': 0}), ('origin_point', {'lat': 0, 'lng': 0, 'extra': 1}),
])
def test_new_rides_require_valid_map_points(client, field, value):
    payload = {'category': 'RIDE', 'intent': 'OFFER', 'title': 'Synthetic', 'text': 'Synthetic',
               'starts_at': '2026-10-03T18:00:00Z',
               'details': {'origin': 'A', 'destination': 'B', 'seats': 4, **DEMO_ROUTE, field: value}}
    response = client.post('/api/posts', headers=headers(1), json=payload)
    assert response.status_code == 422
    assert any(item['field'].startswith('details.' + field) for item in response.json()['error']['details'])


@pytest.mark.parametrize('value', [float('nan'), float('inf'), float('-inf')])
def test_coordinates_are_finite(value):
    with pytest.raises(ValidationError):
        TypeAdapter(GeoPoint).validate_python({'lat': value, 'lng': 0})


def test_haversine_handles_identical_and_dateline_points():
    assert distance_km({'lat': 0, 'lng': 0}, {'lat': 0, 'lng': 0}) == 0
    assert distance_km({'lat': 0, 'lng': 179.99}, {'lat': 0, 'lng': -179.99}) == pytest.approx(2.224, abs=.01)


def test_distance_affects_rank_names_do_not_gate_and_five_km_excludes(client):
    request = ride(client)
    near = ride(client, 4, 'OFFER', 4, origin='Different name',
                origin_point={'lat': 38.7675, 'lng': -93.7395})
    far = ride(client, 3, 'OFFER', 4, origin_point={'lat': 38.7975, 'lng': -93.7395})
    excluded_pickup = ride(client, 2, 'OFFER', 4, origin_point={'lat': 38.8125, 'lng': -93.7395})
    excluded_destination = ride(client, 2, 'OFFER', 4, destination_point={'lat': 38.8405, 'lng': -93.7390})
    result = client.post('/api/matches', headers=headers(1), json={'post_id': request['id'], 'limit': 20}).json()
    ranked = {match['post']['id']: match for match in result['matches']}
    assert ranked[near['id']]['score'] > ranked[far['id']]['score']
    assert excluded_pickup['id'] not in ranked and excluded_destination['id'] not in ranked
    assert any('0.56 km' in reason for reason in ranked[near['id']]['reasons'])
    assert any('straight-line' in warning for warning in ranked[near['id']]['warnings'])
    assert result['matching_mode'] == 'HEURISTIC'


def test_four_seat_offer_accepts_one_one_two_and_only_closes_when_full(client):
    offer = ride(client, 2, 'OFFER', 4)
    requests = [ride(client, user, seats=seats) for user, seats in [(1, 1), (3, 1), (4, 2)]]
    connections = [connect(client, request, offer) for request in requests]
    assert get(client, offer)['ride_availability']['remaining_seats'] == 4  # pending holds nothing
    for index, connection in enumerate(connections):
        response = accept(client, connection)
        assert response.status_code == 200, response.text
        assert response.json()['reserved_seats'] == requests[index]['details']['seats']
        state = get(client, offer)
        assert state['ride_availability']['remaining_seats'] == [3, 2, 0][index]
        assert state['status'] == ('COMPLETED' if index == 2 else 'OPEN')
        assert get(client, requests[index])['status'] == 'COMPLETED'
    assert accept(client, connections[0]).status_code == 409
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.sum(RideReservation.seats))) == 4
        assert db.scalar(select(func.count()).select_from(RideReservation)) == 3


def test_offer_initiated_connection_reserves_correct_request_seats(client):
    offer = ride(client, 2, 'OFFER', 4)
    request = ride(client, 3, seats=1)
    connection = connect(client, offer, request)
    assert accept(client, connection).json()['reserved_seats'] == 1
    assert get(client, offer)['status'] == 'OPEN'
    assert get(client, offer)['ride_availability']['remaining_seats'] == 3


def test_remaining_capacity_filters_matches_and_rechecks_stale_pending(client):
    offer = ride(client, 2, 'OFFER', 3)
    first, second = ride(client, 1, seats=2), ride(client, 3, seats=2)
    a, b = connect(client, first, offer), connect(client, second, offer)
    assert accept(client, a).status_code == 200
    assert accept(client, b).status_code == 409
    assert get(client, second)['status'] == 'OPEN'
    assert get(client, offer)['ride_availability']['remaining_seats'] == 1
    matches = client.post('/api/matches', headers=headers(3), json={'post_id': second['id']}).json()['matches']
    assert offer['id'] not in [match['post']['id'] for match in matches]
    assert get(client, offer)['status'] == 'OPEN'


def test_author_can_mark_filled_early_and_pending_cannot_book_closed_offer(client):
    offer, request = ride(client, 2, 'OFFER', 4), ride(client)
    connection = connect(client, request, offer)
    url = f"/api/posts/{offer['id']}"
    assert client.patch(url, headers=headers(1), json={'status': 'COMPLETED'}).status_code == 403
    assert client.patch(url, headers=headers(2), json={'status': 'COMPLETED'}).status_code == 200
    assert accept(client, connection).status_code == 409
    assert get(client, offer)['ride_availability']['remaining_seats'] == 4


def test_one_request_cannot_reserve_two_offers(client):
    request = ride(client)
    offers = [ride(client, user, 'OFFER', 4) for user in (2, 3)]
    connections = [connect(client, request, offer) for offer in offers]
    assert accept(client, connections[0]).status_code == 200
    assert accept(client, connections[1]).status_code == 409
    assert get(client, offers[1])['ride_availability']['reserved_seats'] == 0


def test_simultaneous_last_seat_acceptances_do_not_oversell(client):
    offer = ride(client, 2, 'OFFER', 1)
    connections = [connect(client, ride(client, user), offer) for user in (1, 3)]
    barrier = Barrier(2)
    def simultaneous(connection):
        barrier.wait(timeout=5)
        return accept(client, connection).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(simultaneous, connections))
    assert sorted(statuses) == [200, 409]
    assert get(client, offer)['ride_availability'] == {'total_seats': 1, 'reserved_seats': 1, 'remaining_seats': 0}


def test_old_accepted_rides_backfill_once_and_seed_refresh_preserves_bookings(client, settings):
    offer = client.get('/api/posts/1', headers=headers(1)).json()
    request = ride(client, seats=1)
    connection = connect(client, request, offer)
    # Simulate the pre-reservation schema's accepted records and unmapped posts.
    with client.app.state.session_factory.begin() as db:
        db.get(Connection, connection['id']).status = 'ACCEPTED'
        post = db.get(Post, request['id'])
        post.details = {key: value for key, value in post.details.items() if not key.endswith('_point')}
    for _ in range(2):
        with TestClient(create_app(settings)) as upgraded:
            assert get(upgraded, offer)['ride_availability']['reserved_seats'] == 1
            assert get(upgraded, request)['details'].get('origin_point') is None
    original = deepcopy(get(client, offer))
    settings.demo_date = date(2026, 10, 5)
    seed(settings, refresh=True)
    assert get(client, offer)['starts_at'] == original['starts_at']
    assert get(client, offer)['ride_availability']['remaining_seats'] == 2
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(RideReservation)) == 1


def test_legacy_unmapped_post_preserved_but_not_distance_matched(client):
    request = ride(client)
    with client.app.state.session_factory.begin() as db:
        post = db.get(Post, request['id'])
        post.details = {'origin': 'UCM', 'destination': 'Walmart', 'seats': 1}
    assert get(client, request)['details'] == {'origin': 'UCM', 'destination': 'Walmart', 'seats': 1}
    response = client.post('/api/matches', headers=headers(1), json={'post_id': request['id']})
    assert response.status_code == 400 and 'map pins' in response.json()['error']['message']


def editable(post):
    return {f: deepcopy(post.get(f)) for f in
            ('category', 'intent', 'title', 'text', 'location', 'starts_at', 'ends_at', 'details')}


@pytest.mark.parametrize('field,value', [
    ('intent', 'REQUEST'), ('starts_at', '2026-10-03T19:00:00-05:00'),
    ('ends_at', '2026-10-03T20:00:00-05:00'), ('origin', 'Other pickup'),
    ('destination', 'Other dropoff'), ('origin_point', {'lat': 39, 'lng': -93.7395}),
    ('destination_point', {'lat': 39, 'lng': -93.7390}), ('seats', 1),
])
def test_reserved_offer_rejects_route_time_type_or_insufficient_capacity_edits(client, field, value):
    offer, request = ride(client, 2, 'OFFER', 4), ride(client, seats=2)
    connection = connect(client, request, offer)
    assert accept(client, connection).status_code == 200
    saved = get(client, offer)
    body = editable(saved)
    (body['details'] if field in saved['details'] else body)[field] = value
    response = client.put(f"/api/posts/{offer['id']}", headers=headers(2), json=body)
    assert response.status_code == 409, response.text
    assert get(client, offer) == saved


def test_reserved_offer_can_change_description_and_capacity_then_fill_to_reserved_count(client):
    offer, request = ride(client, 2, 'OFFER', 4), ride(client, seats=2)
    connection = connect(client, request, offer)
    assert accept(client, connection).status_code == 200
    body = editable(get(client, offer))
    body['title'] = 'Updated synthetic offer'
    body['details']['seats'] = 5
    response = client.put(f"/api/posts/{offer['id']}", headers=headers(2), json=body)
    assert response.status_code == 200, response.text
    assert response.json()['ride_availability'] == dict(total_seats=5, reserved_seats=2, remaining_seats=3)
    assert response.json()['status'] == 'OPEN'
    body['details']['seats'] = 2
    response = client.put(f"/api/posts/{offer['id']}", headers=headers(2), json=body)
    assert response.status_code == 200 and response.json()['status'] == 'COMPLETED'
    assert response.json()['ride_availability']['remaining_seats'] == 0
    assert client.get('/api/connections', headers=headers(2)).json()['items'][0]['reserved_seats'] == 2


def test_capacity_edit_and_acceptance_are_serialized(client):
    offer = ride(client, 2, 'OFFER', 4)
    first = connect(client, ride(client, seats=2), offer)
    assert accept(client, first).status_code == 200
    pending = connect(client, ride(client, 3, seats=2), offer)
    body = editable(get(client, offer))
    body['details']['seats'] = 3
    barrier = Barrier(2)
    def competing(edit):
        barrier.wait(timeout=5)
        return (client.put(f"/api/posts/{offer['id']}", headers=headers(2), json=body)
                if edit else accept(client, pending)).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(competing, [True, False]))
    assert sorted(statuses) == [200, 409]
    capacity = get(client, offer)['ride_availability']
    assert capacity['total_seats'] >= capacity['reserved_seats']


def test_legacy_unbooked_ride_can_add_pins_in_editor(client):
    request = ride(client)
    with client.app.state.session_factory.begin() as db:
        db.get(Post, request['id']).details = {'origin': 'UCM', 'destination': 'Walmart', 'seats': 1}
    body = editable(get(client, request))
    body['details'].update(DEMO_ROUTE)
    response = client.put(f"/api/posts/{request['id']}", headers=headers(1), json=body)
    assert response.status_code == 200
    assert client.post('/api/matches', headers=headers(1), json={'post_id': request['id']}).json()['matches']
