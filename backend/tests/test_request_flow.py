from backend.tests.auth_helpers import auth_headers
from datetime import datetime

import pytest
from sqlalchemy import func, select

from backend.app.ai.understanding import UnderstandingService
from backend.app.models import Connection, Post
from backend.app.schemas import UnderstandInput

REFERENCE = '2026-10-03T16:00:00-05:00'


def request_body(text, **values):
    return {'text': text, 'reference_time': REFERENCE, 'timezone': 'America/Chicago', **values}


def make_ride(client, *, author=1, **changes):
    body = dict(category='RIDE', intent='REQUEST', title='Synthetic ride test', text='Synthetic demo ride',
                starts_at='2026-10-03T18:00:00-05:00',
                details=dict(origin='UCM', destination='Walmart', seats=1))
    body.update(changes)
    response = client.post('/api/posts', headers=auth_headers(client, author), json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_user_request_preview_confirm_matches_connect_accept(client, headers):
    preview_response = client.post('/api/understand', headers=headers,
                                  json=request_body('I need a ride to Walmart around 6 tonight'))
    assert preview_response.status_code == 200, preview_response.text
    preview = preview_response.json()
    assert preview['category'] == 'RIDE' and preview['intent'] == 'REQUEST'
    assert preview['analysis_mode'] == 'HEURISTIC'
    assert preview['details'] == {'origin': None, 'destination': 'Walmart', 'seats': None, 'purpose': None}
    assert set(preview['missing_fields']) == {'details.origin', 'details.seats'}
    assert datetime.fromisoformat(preview['starts_at']) == datetime.fromisoformat('2026-10-03T23:00:00Z')
    assert preview['location'] is None
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Post)) == 6
    body = {field: preview[field] for field in ('category', 'intent', 'title', 'text', 'location', 'starts_at', 'ends_at', 'details')}
    assert client.post('/api/posts', json=body, headers=headers).status_code == 422
    body['details'].update(origin='UCM', seats=1)
    post_response = client.post('/api/posts', json=body, headers=headers)
    assert post_response.status_code == 201
    post = post_response.json()
    result = client.post('/api/matches', json={'post_id': post['id']}, headers=headers)
    assert result.status_code == 200, result.text
    matches = result.json()
    assert matches['matching_mode'] == 'HEURISTIC' and len(matches['matches']) == 2
    assert [match['post']['author']['id'] for match in matches['matches']] == [2, 2]
    assert all(0 <= match['score'] <= 100 and match['reasons'] for match in matches['matches'])
    assert client.get('/api/connections', headers=headers).json() == {'items': []}
    connect = client.post('/api/connections', headers=headers, json={
        'source_post_id': post['id'], 'target_post_id': matches['matches'][0]['post']['id'],
    })
    assert connect.status_code == 201, connect.text
    connection = connect.json()
    assert set(connection) == {'id', 'requester_id', 'receiver_id', 'source_post_id', 'target_post_id', 'status', 'created_at', 'updated_at'}
    assert connection['receiver_id'] == 2 and connection['status'] == 'PENDING'
    accepted = client.patch(f"/api/connections/{connection['id']}", headers=auth_headers(client, 2), json={'status': 'ACCEPTED'})
    assert accepted.status_code == 200 and accepted.json()['status'] == 'ACCEPTED'
    assert client.get('/api/connections?status=ACCEPTED', headers=headers).json()['items'][0]['id'] == connection['id']
    assert client.get(f"/api/posts/{post['id']}", headers=headers).json()['status'] == 'OPEN'


@pytest.mark.parametrize('text,category', [
    ('I need help studying SQL joins tonight', 'STUDY'),
    ('Does anyone have a calculator I can borrow?', 'COMMUNITY'),
    ('Anyone want Korean food tonight?', 'RESTAURANT'),
    ('Your university account expires today, click https://ucm-login-example.xyz', 'CYBERSECURITY'),
])
def test_preview_categories_shape_and_no_persistence(client, headers, text, category):
    response = client.post('/api/understand', headers=headers, json=request_body(text))
    assert response.status_code == 200, response.text
    preview = response.json()
    assert set(preview) == {'category', 'intent', 'title', 'text', 'location', 'starts_at', 'ends_at', 'details', 'missing_fields', 'warnings', 'analysis_mode'}
    assert preview['category'] == category and preview['text'] == text
    if category == 'CYBERSECURITY':
        assert preview['intent'] is None and preview['details'] is None
    elif category == 'STUDY':
        assert preview['details']['course'] == 'SQL' and preview['details']['topic'] == 'joins'
        assert preview['starts_at'] is None and preview['missing_fields'] == []
    elif category == 'COMMUNITY':
        assert preview['details']['subcategory'] == 'BORROW_LEND'
        assert preview['details']['item'] == 'calculator'
    elif category == 'RESTAURANT':
        assert 'starts_at' in preview['missing_fields'] and 'details.group_size' in preview['missing_fields']
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Post)) == 6


def test_manual_category_override_wins(client, headers):
    preview = client.post('/api/understand', headers=headers,
        json=request_body('I need a ride to Walmart around 6 tonight', category_hint='STUDY')).json()
    assert preview['category'] == 'STUDY'
    assert set(preview['missing_fields']) == {'details.course', 'details.topic'}


@pytest.mark.parametrize('text,reference,expected', [
    ('Ride from UCM to Walmart at 6 pm tomorrow', '2026-10-03T23:30:00-05:00', '2026-10-04T23:00:00Z'),
    ('Ride to Walmart at 6 tonight', '2026-10-04T01:00:00Z', '2026-10-03T23:00:00Z'),
    ('Ride to Walmart at 6', REFERENCE, None),
    ('Ride to Walmart tomorrow', REFERENCE, None),
    ('Ride to Walmart at 6 tomorrow', REFERENCE, None),
    ('Ride to Walmart on 2026-11-01 at 1:30 am', REFERENCE, None),
    ('Ride to Walmart on 2026-03-08 at 2:30 am', REFERENCE, None),
])
def test_relative_time_no_date_invention_and_dst_clarification(client, headers, text, reference, expected):
    response = client.post('/api/understand', headers=headers,
        json=request_body(text, reference_time=reference))
    assert response.status_code == 200, response.text
    value = response.json()['starts_at']
    assert (datetime.fromisoformat(value) if value else None) == (datetime.fromisoformat(expected) if expected else None)
    if expected is None:
        assert 'starts_at' in response.json()['missing_fields']


@pytest.mark.parametrize('values', [
    {'text': ''}, {'text': 'x' * 4001}, {'timezone': 'invalid/timezone'},
    {'reference_time': '2026-10-03T16:00:00'}, {'category_hint': 'OTHER'},
])
def test_preview_validation_envelope(client, headers, values):
    body = request_body('I need a ride')
    body.update(values)
    response = client.post('/api/understand', headers=headers, json=body)
    assert response.status_code == 422 and response.json()['error']['code'] == 'VALIDATION_ERROR'


def test_provider_failure_and_malformed_output_fallback(settings):
    settings.ai_provider = 'test'

    class Broken:
        def preview(self, request):
            raise TimeoutError('secret provider contents')

    request = UnderstandInput(**request_body('Help with SQL joins'))
    result = UnderstandingService(settings, Broken()).preview(request)
    assert result.analysis_mode == 'HEURISTIC' and 'fallback' in result.warnings[-1]

    class Malformed:
        def preview(self, request):
            return {'category': 'STUDY', 'intent': 'REQUEST', 'title': 'Demo', 'text': request.text,
                    'details': {'course': 'SQL', 'mode': 'INVALID'}}

    result = UnderstandingService(settings, Malformed()).preview(request)
    assert result.details['mode'] is None and result.analysis_mode == 'HEURISTIC'
    settings.ai_fallback_enabled = False
    from backend.app.errors import APIError
    with pytest.raises(APIError) as error:
        UnderstandingService(settings, Broken()).preview(request)
    assert error.value.status == 503 and 'secret' not in error.value.message


def test_fallback_disabled_returns_api_503(client, headers):
    client.app.state.settings.ai_provider = 'unconfigured'
    client.app.state.settings.ai_fallback_enabled = False
    response = client.post('/api/understand', headers=headers, json=request_body('SQL joins'))
    assert response.status_code == 503 and response.json()['error']['code'] == 'PROVIDER_UNAVAILABLE'


@pytest.mark.parametrize('text,field', [
    ('Ride to Walmart for 0 people at 6 tonight', 'details.seats'),
    ('Korean dinner for 0 at 6 tonight', 'details.group_size'),
])
def test_invalid_extracted_counts_require_clarification(client, headers, text, field):
    response = client.post('/api/understand', headers=headers, json=request_body(text))
    assert response.status_code == 200, response.text
    assert field in response.json()['missing_fields']


def test_provider_output_validated_without_coercing_boolean_seats(settings):
    settings.ai_provider = 'test'

    class InvalidCount:
        def preview(self, request):
            return {'category': 'RIDE', 'intent': 'REQUEST', 'title': 'Demo ride', 'text': request.text,
                    'starts_at': '2026-10-03T18:00:00-05:00',
                    'details': {'origin': 'UCM', 'destination': 'Walmart', 'seats': True}, 'analysis_mode': 'LLM'}

    preview = UnderstandingService(settings, InvalidCount()).preview(UnderstandInput(**request_body('Ride to Walmart')))
    assert preview.analysis_mode == 'HEURISTIC' and preview.details['seats'] is None


@pytest.mark.parametrize('changes', [
    {'intent': 'REQUEST'},
    {'details': {'origin': 'Elsewhere', 'destination': 'Walmart', 'seats': 3}},
    {'details': {'origin': 'UCM', 'destination': 'Library', 'seats': 3}},
    {'details': {'origin': 'UCM', 'destination': 'Walmart', 'seats': 1}},
    {'starts_at': '2026-10-03T20:00:00-05:00'},
])
def test_ride_hard_gates(client, headers, changes):
    source = make_ride(client, details={'origin': 'UCM', 'destination': 'Walmart', 'seats': 2})
    target = make_ride(client, author=4, **{'intent': 'OFFER', **changes})
    matches = client.post('/api/matches', headers=headers, json={'post_id': source['id']}).json()['matches']
    assert target['id'] not in [match['post']['id'] for match in matches]
    response = client.post('/api/connections', headers=headers, json={'source_post_id': source['id'], 'target_post_id': target['id']})
    assert response.status_code == 400


def test_match_ownership_closed_other_category_and_limits(client, headers):
    source = make_ride(client)
    own_offer = make_ride(client, intent='OFFER')
    closed = make_ride(client, author=4, intent='OFFER')
    client.patch(f"/api/posts/{closed['id']}", headers=auth_headers(client, 4), json={'status': 'CANCELLED'})
    response = client.post('/api/matches', headers=headers, json={'post_id': source['id'], 'limit': 1})
    assert len(response.json()['matches']) == 1
    all_matches = client.post('/api/matches', headers=headers, json={'post_id': source['id']}).json()['matches']
    assert all(match['post']['category'] == 'RIDE' and match['post']['author']['id'] != 1 and match['post']['status'] == 'OPEN' for match in all_matches)
    assert own_offer['id'] not in [match['post']['id'] for match in all_matches]
    assert client.post('/api/matches', headers=auth_headers(client, 2), json={'post_id': source['id']}).status_code == 403
    for limit in (0, 21, 1.5, True):
        assert client.post('/api/matches', headers=headers, json={'post_id': source['id'], 'limit': limit}).status_code == 422
    client.patch(f"/api/posts/{source['id']}", headers=headers, json={'status': 'COMPLETED'})
    assert client.post('/api/matches', headers=headers, json={'post_id': source['id']}).status_code == 400


def test_new_routes_require_identity(client):
    assert client.post('/api/understand', json=request_body('SQL')).status_code == 401
    assert client.post('/api/matches', json={'post_id': 1}).status_code == 401
    assert client.get('/api/connections').status_code == 401
    assert client.post('/api/connections', json={'source_post_id': 1, 'target_post_id': 2}).status_code == 401
    assert client.patch('/api/connections/1', json={'status': 'ACCEPTED'}).status_code == 401
