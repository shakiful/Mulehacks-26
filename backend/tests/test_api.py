from backend.tests.auth_helpers import auth_headers
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.models import User


def assert_error(response, status, code):
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {'error'}
    assert set(body['error']) == {'code', 'message', 'details'}
    assert body['error']['code'] == code
    assert isinstance(body['error']['message'], str)
    assert isinstance(body['error']['details'], list)
    return body['error']


def test_health_session_and_removed_demo_profiles(client):
    assert client.get('/api/health').json() == {'status': 'ok'}
    assert client.get('/api/auth/session').json() == {'user': None, 'csrf_token': None}
    assert_error(client.get('/api/demo/users'), 404, 'NOT_FOUND')
    assert_error(client.get('/api/posts', headers={'X-Demo-User-Id': '1'}), 401, 'UNAUTHORIZED')


def test_create_get_response_and_utc_roundtrip(client, headers, study):
    response = client.post('/api/posts', json=study, headers=headers)
    assert response.status_code == 201, response.text
    post = response.json()
    assert set(post) == {
        'id', 'author', 'category', 'intent', 'title', 'text', 'location', 'starts_at',
        'ends_at', 'details', 'status', 'created_at', 'updated_at',
    }
    assert post['author'] == {'id': 1, 'name': 'Rafi'}
    assert post['status'] == 'OPEN'
    for field in ('category', 'intent', 'title', 'text', 'location', 'details'):
        assert post[field] == study[field]
    for field in ('starts_at', 'ends_at'):
        assert datetime.fromisoformat(post[field]) == datetime.fromisoformat(study[field])
        assert datetime.fromisoformat(post[field]).utcoffset().total_seconds() == 0
    for field in ('created_at', 'updated_at'):
        assert datetime.fromisoformat(post[field]).tzinfo is not None
    assert client.get(f"/api/posts/{post['id']}", headers=auth_headers(client, 2)).json() == post


@pytest.mark.parametrize('category,intent,details,timed', [
    ('RIDE', 'REQUEST', {'origin': 'UCM', 'destination': 'Walmart', 'seats': 1}, True),
    ('STUDY', 'PARTNER', {'topic': 'loops'}, False),
    ('RESTAURANT', 'OFFER', {'restaurant': 'Example', 'activity_type': 'GROUP_ORDER', 'group_size': 2}, True),
    ('COMMUNITY', 'PARTNER', {'subcategory': 'ACTIVITY', 'activity': 'soccer'}, False),
])
def test_all_categories_and_optional_nulls(client, headers, category, intent, details, timed):
    body = {'category': category, 'intent': intent, 'details': details, 'title': 'Demo', 'text': 'Synthetic request'}
    if timed:
        body['starts_at'] = '2026-10-03T18:00:00Z'
    response = client.post('/api/posts', json=body, headers=headers)
    assert response.status_code == 201, response.text
    post = response.json()
    assert post['location'] is None and post['ends_at'] is None
    if not timed:
        assert post['starts_at'] is None
    assert post['category'] == category and post['intent'] == intent


INVALID = [
    ('category', 'CYBERSECURITY'), ('category', 'study'), ('intent', 'HOST'),
    ('title', ''), ('title', '  '), ('title', 'x' * 121),
    ('text', ''), ('text', 'x' * 4001), ('title', 123),
    ('starts_at', 'tomorrow'), ('starts_at', '2026-10-03T18:00:00'),
    ('ends_at', '2026-10-03T18:00:00-05:00'), ('ends_at', '2026-10-03T17:00:00-05:00'),
    ('details', {}), ('details', {'topic': ' '}),
    ('details', {'course': 'SQL', 'skill_level': 'EXPERT'}),
    ('details', {'course': 'SQL', 'mode': 'HYBRID'}),
    ('details', {'origin': 'UCM', 'destination': 'Walmart', 'seats': 2}),
    ('user_id', 2), ('status', 'COMPLETED'), ('author', {'id': 2}),
]


@pytest.mark.parametrize('field,value', INVALID)
def test_invalid_post_inputs_are_standard_errors(client, headers, study, field, value):
    study[field] = value
    error = assert_error(client.post('/api/posts', json=study, headers=headers), 422, 'VALIDATION_ERROR')
    assert error['details']
    assert all(set(detail) == {'field', 'message'} for detail in error['details'])
    assert client.get('/api/posts?user_id=1', headers=headers).json()['total'] == 0


@pytest.mark.parametrize('change', [
    {'intent': 'PARTNER'}, {'starts_at': None},
    {'details': {'origin': '', 'destination': 'Walmart', 'seats': 1}},
    {'details': {'origin': 'UCM', 'destination': '  ', 'seats': 1}},
    {'details': {'origin': 'UCM', 'destination': 'Walmart', 'seats': 0}},
    {'details': {'origin': 'UCM', 'destination': 'Walmart', 'seats': -1}},
    {'details': {'origin': 'UCM', 'destination': 'Walmart', 'seats': 1.5}},
    {'details': {'origin': 'UCM', 'destination': 'Walmart', 'seats': True}},
    {'details': {'origin': 'UCM', 'destination': 'Walmart', 'seats': '2'}},
])
def test_invalid_ride(client, headers, change):
    body = dict(category='RIDE', intent='OFFER', title='Ride', text='Synthetic demo',
                starts_at='2026-10-03T18:00:00Z', details=dict(origin='UCM', destination='Walmart', seats=2))
    body.update(change)
    error = assert_error(client.post('/api/posts', json=body, headers=headers), 422, 'VALIDATION_ERROR')
    if 'details' in change and 'seats' in change['details'] and change['details']['seats'] != 1:
        assert any(d['field'] == 'details.seats' for d in error['details'])


@pytest.mark.parametrize('details', [
    {'activity_type': 'DINING', 'group_size': 2},
    {'cuisine': 'Pizza', 'activity_type': 'BOOKING', 'group_size': 2},
    {'cuisine': 'Pizza', 'activity_type': 'DINING', 'group_size': 0},
    {'cuisine': 'Pizza', 'activity_type': 'DINING', 'group_size': True},
])
def test_invalid_restaurant(client, headers, details):
    body = dict(category='RESTAURANT', intent='OFFER', title='Food', text='Synthetic demo',
                starts_at='2026-10-03T18:00:00Z', details=details)
    assert_error(client.post('/api/posts', json=body, headers=headers), 422, 'VALIDATION_ERROR')


def test_required_time_and_community_subcategory(client, headers):
    body = dict(category='RESTAURANT', intent='PARTNER', title='Food', text='Demo',
                details=dict(cuisine='Pizza', activity_type='DINING', group_size=2))
    assert_error(client.post('/api/posts', json=body, headers=headers), 422, 'VALIDATION_ERROR')
    body.update(category='COMMUNITY', intent='REQUEST', details={'subcategory': 'UNKNOWN'})
    assert_error(client.post('/api/posts', json=body, headers=headers), 422, 'VALIDATION_ERROR')


def test_end_requires_start(client, headers, study):
    study['starts_at'] = None
    assert_error(client.post('/api/posts', json=study, headers=headers), 422, 'VALIDATION_ERROR')


@pytest.mark.parametrize('identity', [None, '999', '0', '-1', 'abc', '1.0', '1' * 100])
def test_identity_required_for_all_post_operations(client, study, identity):
    headers = {'X-Demo-User-Id': identity} if identity else {}
    for response in [
        client.get('/api/posts', headers=headers), client.get('/api/posts/1', headers=headers),
        client.post('/api/posts', json=study, headers=headers),
        client.patch('/api/posts/1', json={'status': 'COMPLETED'}, headers=headers),
    ]:
        assert_error(response, 401, 'UNAUTHORIZED')


def test_list_filters_total_pagination_and_default_open(client, headers, study):
    first = client.post('/api/posts', json=study, headers=headers).json()
    second = client.post('/api/posts', json=study, headers=headers).json()
    data = client.get('/api/posts?category=STUDY&user_id=1&limit=1&offset=1', headers=headers).json()
    assert data['total'] == 2 and data['limit'] == 1 and data['offset'] == 1
    assert [p['id'] for p in data['items']] == [first['id']]
    assert client.get('/api/posts?category=STUDY&user_id=1&offset=50', headers=headers).json()['items'] == []
    assert client.get('/api/posts?category=RIDE', headers=headers).json()['total'] == 2
    client.patch(f"/api/posts/{second['id']}", json={'status': 'COMPLETED'}, headers=headers)
    assert client.get('/api/posts?user_id=1', headers=headers).json()['total'] == 1
    closed = client.get('/api/posts?status=COMPLETED&user_id=1', headers=headers).json()
    assert closed['total'] == 1 and closed['items'][0]['id'] == second['id']


@pytest.mark.parametrize('query', ['limit=0', 'limit=101', 'offset=-1', 'user_id=0', 'category=CYBERSECURITY', 'status=DELETED'])
def test_invalid_list_filters(client, headers, query):
    assert_error(client.get('/api/posts?' + query, headers=headers), 422, 'VALIDATION_ERROR')


@pytest.mark.parametrize('status', ['COMPLETED', 'CANCELLED'])
def test_only_author_can_close_and_closed_posts_conflict(client, headers, study, status):
    post = client.post('/api/posts', json=study, headers=headers).json()
    path = f"/api/posts/{post['id']}"
    assert_error(client.patch(path, json={'status': status}, headers=auth_headers(client, 2)), 403, 'FORBIDDEN')
    assert client.get(path, headers=headers).json()['status'] == 'OPEN'
    updated = client.patch(path, json={'status': status}, headers=headers).json()
    assert updated['status'] == status
    assert datetime.fromisoformat(updated['updated_at']) >= datetime.fromisoformat(post['updated_at'])
    assert updated['created_at'] == post['created_at']
    assert_error(client.patch(path, json={'status': status}, headers=headers), 409, 'CONFLICT')
    assert_error(client.patch(path, json={'status': 'OPEN'}, headers=headers), 422, 'VALIDATION_ERROR')


def test_missing_routes_ids_malformed_json_and_methods(client, headers):
    assert_error(client.get('/api/posts/999', headers=headers), 404, 'NOT_FOUND')
    assert_error(client.patch('/api/posts/999', json={'status': 'CANCELLED'}, headers=headers), 404, 'NOT_FOUND')
    assert_error(client.get('/api/nope'), 404, 'NOT_FOUND')
    assert_error(client.get('/api/posts/STUDY', headers=headers), 422, 'VALIDATION_ERROR')
    assert_error(client.get('/api/posts/0', headers=headers), 422, 'VALIDATION_ERROR')
    assert_error(client.delete('/api/posts/1', headers=headers), 405, 'METHOD_NOT_ALLOWED')
    assert_error(client.post('/api/posts', content='{broken', headers={**headers, 'Content-Type': 'application/json'}), 422, 'VALIDATION_ERROR')


def test_legacy_header_cannot_replace_a_session(settings):
    with TestClient(create_app(settings)) as client:
        assert client.get('/api/health').json() == {'status': 'ok'}
        assert_error(client.get('/api/demo/users'), 404, 'NOT_FOUND')
        assert_error(client.get('/api/posts', headers={'X-Demo-User-Id': '1'}), 401, 'UNAUTHORIZED')


def test_cors_allowed_preflight_and_errors(client):
    headers = {
        'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,X-CSRF-Token',
    }
    response = client.options('/api/posts', headers=headers)
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == headers['Origin']
    response = client.get('/api/posts', headers={'Origin': headers['Origin']})
    assert response.status_code == 401
    assert response.headers['access-control-allow-origin'] == headers['Origin']
    response = client.get('/api/health', headers={'Origin': 'https://unconfigured.example'})
    assert 'access-control-allow-origin' not in response.headers
    response = client.options('/api/posts', headers={**headers, 'Origin': 'https://unconfigured.example'})
    assert_error(response, 400, 'INVALID_OPERATION')


def test_unexpected_failures_hide_exception_and_payload(settings):
    app = create_app(settings)

    @app.get('/api/test-failure')
    def failure():
        raise RuntimeError('secret-provider-key')

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get('/api/test-failure', headers={'Origin': 'http://localhost:5173'})
        assert_error(response, 500, 'INTERNAL_ERROR')
        assert 'secret-provider-key' not in response.text
        assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'
