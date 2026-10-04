from copy import deepcopy
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.models import PostEmbedding
from backend.app.seed import seed
from backend.app.seed import DEMO_ROUTE
from backend.tests.test_api import assert_error
from backend.tests.test_embeddings import FakeProvider


CASES = [
    ('RIDE', {'origin': 'UCM', 'destination': 'Walmart', 'seats': 1, **DEMO_ROUTE}, {'seats': 2}),
    ('STUDY', {'course': 'SQL', 'topic': 'joins', 'mode': 'ONLINE'}, {'topic': 'indexes'}),
    ('RESTAURANT', {'restaurant': 'Example diner', 'activity_type': 'DINING', 'group_size': 2}, {'group_size': 3}),
    ('COMMUNITY', {'subcategory': 'BORROW_LEND', 'item': 'Calculator'}, {'item': 'Scientific calculator'}),
]


@pytest.mark.parametrize('category,details,changed_details', CASES)
def test_edit_all_categories_in_place(client, headers, category, details, changed_details):
    body = {'category': category, 'intent': 'REQUEST', 'title': 'Synthetic original',
            'text': 'Synthetic editable post', 'location': 'Library',
            'starts_at': '2026-10-03T18:00:00-05:00', 'ends_at': '2026-10-03T19:00:00-05:00',
            'details': details}
    created = client.post('/api/posts', json=body, headers=headers).json()
    path = f"/api/posts/{created['id']}"
    count = client.get('/api/posts?limit=100', headers=headers).json()['total']
    body.update(title='Synthetic updated', text='Updated synthetic description', location=None, ends_at=None)
    body['details'] = {**created['details'], **changed_details}
    response = client.put(path, json=body, headers=headers)
    assert response.status_code == 200, response.text
    saved = response.json()
    for field in ('id', 'author', 'category', 'status', 'created_at'):
        assert saved[field] == created[field]
    for field in ('title', 'text', 'location', 'ends_at', 'details'):
        assert saved[field] == body[field]
    assert datetime.fromisoformat(saved['updated_at']) >= datetime.fromisoformat(created['updated_at'])
    assert client.get(path, headers=headers).json() == saved
    assert client.get('/api/posts?limit=100', headers=headers).json()['total'] == count


def test_edit_ownership_missing_identity_missing_post_and_category(client, headers, study):
    created = client.post('/api/posts', json=study, headers=headers).json()
    path = f"/api/posts/{created['id']}"
    assert_error(client.put(path, json=study, headers={'X-Demo-User-Id': '2'}), 403, 'FORBIDDEN')
    assert_error(client.put(path, json=study), 401, 'UNAUTHORIZED')
    assert_error(client.put('/api/posts/99999', json=study, headers=headers), 404, 'NOT_FOUND')
    changed_category = {**study, 'category': 'COMMUNITY', 'details': {'subcategory': 'OTHER'}}
    assert_error(client.put(path, json=changed_category, headers=headers), 400, 'INVALID_OPERATION')
    assert client.get(path, headers=headers).json() == created


@pytest.mark.parametrize('status', ['COMPLETED', 'CANCELLED'])
def test_closed_posts_cannot_be_edited_or_reopened(client, headers, study, status):
    created = client.post('/api/posts', json=study, headers=headers).json()
    path = f"/api/posts/{created['id']}"
    closed = client.patch(path, json={'status': status}, headers=headers).json()
    assert_error(client.put(path, json={**study, 'title': 'New title'}, headers=headers), 409, 'CONFLICT')
    assert client.get(path, headers=headers).json() == closed


@pytest.mark.parametrize('field,value', [
    ('title', ''), ('text', 'x' * 4001), ('starts_at', '2026-10-03T18:00:00'),
    ('ends_at', '2026-10-03T17:00:00-05:00'), ('details', {'course': 'SQL', 'mode': 'INVALID'}),
    ('details', {'course': None, 'topic': None}),
    ('id', 999), ('user_id', 2), ('author', {'id': 2, 'name': 'Fake'}), ('status', 'OPEN'),
    ('created_at', '2020-01-01T00:00:00Z'), ('updated_at', '2020-01-01T00:00:00Z'),
])
def test_invalid_edits_do_not_change_saved_fields(client, headers, study, field, value):
    created = client.post('/api/posts', json=study, headers=headers).json()
    path = f"/api/posts/{created['id']}"
    bad = deepcopy(study)
    bad[field] = value
    error = assert_error(client.put(path, json=bad, headers=headers), 422, 'VALIDATION_ERROR')
    assert error['details']
    assert client.get(path, headers=headers).json() == created


@pytest.mark.parametrize('status', ['PENDING', 'ACCEPTED'])
def test_edit_keeps_existing_connection_records(client, headers, study, status):
    source = client.post('/api/posts', json=study, headers=headers).json()
    targets = client.post('/api/matches', json={'post_id': source['id']}, headers=headers).json()['matches']
    target = targets[0]['post']
    connection = client.post('/api/connections', json={'source_post_id': source['id'], 'target_post_id': target['id']}, headers=headers).json()
    if status == 'ACCEPTED':
        connection = client.patch(f"/api/connections/{connection['id']}", json={'status': status},
                                  headers={'X-Demo-User-Id': str(connection['receiver_id'])}).json()
    assert client.put(f"/api/posts/{source['id']}", json={**study, 'title': 'Updated SQL request'}, headers=headers).status_code == 200
    assert client.get('/api/connections', headers=headers).json()['items'] == [connection]


def test_ride_matching_uses_edited_route(client, headers):
    body = {'category': 'RIDE', 'intent': 'REQUEST', 'title': 'Synthetic Walmart ride',
            'text': 'Synthetic ride', 'starts_at': '2026-10-03T18:00:00-05:00',
            'details': {'origin': 'UCM', 'destination': 'Walmart', 'seats': 1, **DEMO_ROUTE}}
    source = client.post('/api/posts', json=body, headers=headers).json()
    request = {'post_id': source['id']}
    assert client.post('/api/matches', json=request, headers=headers).json()['matches']
    body['details']['destination'] = 'Airport'
    body['details']['destination_point'] = {'lat': 39.0, 'lng': -93.7390}
    assert client.put(f"/api/posts/{source['id']}", json=body, headers=headers).status_code == 200
    assert client.post('/api/matches', json=request, headers=headers).json()['matches'] == []


def test_edit_is_offline_and_regenerates_stale_embeddings_when_matching(settings, study, headers):
    seed(settings)
    provider = FakeProvider()
    with TestClient(create_app(settings, embedding_provider=provider)) as client:
        source = client.post('/api/posts', json=study, headers=headers).json()
        path = f"/api/posts/{source['id']}"
        request = {'post_id': source['id']}
        assert client.post('/api/matches', json=request, headers=headers).json()['matching_mode'] == 'SEMANTIC'
        with client.app.state.session_factory() as db:
            original_hash = db.get(PostEmbedding, source['id']).input_hash
        calls = len(provider.calls)
        assert client.put(path, json={**study, 'title': 'SQL index help', 'text': 'Synthetic SQL index question'}, headers=headers).status_code == 200
        assert len(provider.calls) == calls
        assert client.post('/api/matches', json=request, headers=headers).json()['matching_mode'] == 'SEMANTIC'
        assert len(provider.calls) == calls + 1
        with client.app.state.session_factory() as db:
            assert db.get(PostEmbedding, source['id']).input_hash != original_hash


def test_browser_put_preflight(client):
    response = client.options('/api/posts/1', headers={'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type,x-demo-user-id'})
    assert response.status_code == 200
    assert response.headers['Access-Control-Allow-Origin'] == 'http://localhost:5173'
    assert 'PUT' in response.headers['Access-Control-Allow-Methods']
