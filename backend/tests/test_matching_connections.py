from copy import deepcopy

import pytest


def create_post(client, body, author=1, **changes):
    payload = deepcopy(body)
    payload.update(changes)
    response = client.post('/api/posts', headers={'X-Demo-User-Id': str(author)}, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def matches(client, post):
    response = client.post('/api/matches', headers={'X-Demo-User-Id': str(post['author']['id'])},
                           json={'post_id': post['id'], 'limit': 20})
    assert response.status_code == 200, response.text
    return response.json()['matches']


def connect(client, source, target, author=None):
    return client.post('/api/connections', headers={'X-Demo-User-Id': str(author or source['author']['id'])},
                       json={'source_post_id': source['id'], 'target_post_id': target['id']})


@pytest.mark.parametrize('changes', [
    {'intent': 'REQUEST'},
    {'starts_at': '2026-10-03T19:00:00-05:00', 'ends_at': '2026-10-03T20:00:00-05:00'},
    {'details': {'course': 'SQL', 'mode': 'ONLINE'}},
    {'location': 'Student Union'},
])
def test_study_hard_constraints_also_protect_connections(client, study, changes):
    source = create_post(client, study)
    target = create_post(client, study, author=4, **{'intent': 'OFFER', **changes})
    assert target['id'] not in [match['post']['id'] for match in matches(client, source)]
    assert connect(client, source, target).status_code == 400


def test_study_missing_data_keeps_weights_and_order_is_deterministic(client, study):
    unknown = {**study, 'starts_at': None, 'ends_at': None, 'location': None,
               'details': {'course': 'SQL', 'topic': 'joins', 'mode': None}}
    source = create_post(client, unknown)
    first = create_post(client, unknown, author=2, intent='OFFER')
    second = create_post(client, unknown, author=3, intent='OFFER')
    ranked = matches(client, source)
    assert [match['post']['id'] for match in ranked[:2]] == [first['id'], second['id']]
    assert ranked[0]['score'] == 65.0
    assert any('availability' in warning and 'zero' in warning for warning in ranked[0]['warnings'])
    assert any('mode/location' in warning for warning in ranked[0]['warnings'])
    assert not any('Same confirmed' in reason for reason in ranked[0]['reasons'])


def test_study_full_known_evidence_and_partner_pair(client, study):
    source = create_post(client, study, intent='PARTNER')
    target = create_post(client, study, author=4, intent='PARTNER')
    ranked = matches(client, source)
    assert ranked[0]['post']['id'] == target['id'] and ranked[0]['score'] == 100.0
    assert 'Overlapping confirmed availability' in ranked[0]['reasons']
    assert 'Same confirmed meeting location' in ranked[0]['reasons']
    assert connect(client, source, target).status_code == 201


@pytest.fixture
def food():
    return {'category': 'RESTAURANT', 'intent': 'REQUEST', 'title': 'Korean dinner',
            'text': 'Korean dinner at the student union', 'location': 'Student Union',
            'starts_at': '2026-10-03T18:00:00-05:00',
            'details': {'cuisine': 'Korean', 'activity_type': 'DINING', 'group_size': 2}}


def test_food_activity_constraint_and_confirmed_evidence(client, food):
    source = create_post(client, food)
    target = create_post(client, food, author=2, intent='OFFER')
    other_activity = create_post(client, food, author=3, intent='OFFER',
                                 details={**food['details'], 'activity_type': 'GROUP_ORDER'})
    ranked = matches(client, source)
    assert ranked[0]['post']['id'] == target['id'] and ranked[0]['score'] == 100.0
    assert other_activity['id'] not in [match['post']['id'] for match in ranked]
    assert connect(client, source, other_activity).status_code == 400
    assert connect(client, source, target).status_code == 201


def test_community_subcategory_constraint_and_unknown_availability(client):
    body = {'category': 'COMMUNITY', 'intent': 'REQUEST', 'title': 'Calculator',
            'text': 'Borrow calculator for class', 'details': {'subcategory': 'BORROW_LEND', 'item': 'calculator'}}
    source = create_post(client, body)
    target = create_post(client, body, author=2, intent='OFFER')
    other = create_post(client, body, author=3, intent='OFFER', details={'subcategory': 'MOVING'})
    ranked = matches(client, source)
    assert ranked[0]['post']['id'] == target['id'] and ranked[0]['score'] == 75.0
    assert other['id'] not in [match['post']['id'] for match in ranked]
    assert connect(client, source, other).status_code == 400


def test_connection_identity_privacy_and_pending_duplicate_pairs(client, study):
    source = create_post(client, study)
    target = create_post(client, study, author=2, intent='OFFER')
    assert connect(client, source, target, author=3).status_code == 403
    response = connect(client, source, target)
    assert response.status_code == 201
    connection = response.json()
    assert connection['requester_id'] == 1 and connection['receiver_id'] == 2
    assert connect(client, source, target).status_code == 409
    assert connect(client, target, source).status_code == 409
    for participant in (1, 2):
        assert client.get('/api/connections?status=PENDING', headers={'X-Demo-User-Id': str(participant)}).json()['items'] == [connection]
    assert client.get('/api/connections', headers={'X-Demo-User-Id': '3'}).json() == {'items': []}
    assert client.get('/api/connections?status=ACCEPTED', headers={'X-Demo-User-Id': '1'}).json() == {'items': []}
    assert client.get('/api/connections?status=OPEN', headers={'X-Demo-User-Id': '1'}).status_code == 422


@pytest.mark.parametrize('status,actor,wrong_actor', [
    ('ACCEPTED', 2, 1), ('DECLINED', 2, 1), ('CANCELLED', 1, 2),
])
def test_connection_transition_roles_terminal_state_and_retries(client, study, status, actor, wrong_actor):
    source = create_post(client, study)
    target = create_post(client, study, author=2, intent='OFFER')
    connection = connect(client, source, target).json()
    url = f"/api/connections/{connection['id']}"
    for unauthorized in (wrong_actor, 3):
        assert client.patch(url, headers={'X-Demo-User-Id': str(unauthorized)}, json={'status': status}).status_code == 403
    transitioned = client.patch(url, headers={'X-Demo-User-Id': str(actor)}, json={'status': status})
    assert transitioned.status_code == 200 and transitioned.json()['status'] == status
    assert transitioned.json()['updated_at'] >= connection['updated_at']
    assert client.patch(url, headers={'X-Demo-User-Id': str(actor)}, json={'status': status}).status_code == 409
    assert client.get(f"/api/posts/{source['id']}", headers={'X-Demo-User-Id': '1'}).json()['status'] == 'OPEN'
    assert connect(client, source, target).status_code == (409 if status == 'ACCEPTED' else 201)


def test_connection_closed_self_same_author_other_category_and_missing_resources(client, study, food):
    source = create_post(client, study)
    own = create_post(client, study, intent='OFFER')
    other_category = create_post(client, food, author=2, intent='OFFER')
    target = create_post(client, study, author=2, intent='OFFER')
    for invalid in (source, own, other_category):
        assert connect(client, source, invalid).status_code == 400
    client.patch(f"/api/posts/{target['id']}", headers={'X-Demo-User-Id': '2'}, json={'status': 'COMPLETED'})
    assert connect(client, source, target).status_code == 400
    headers = {'X-Demo-User-Id': '1'}
    for response in (
        client.post('/api/connections', headers=headers, json={'source_post_id': source['id'], 'target_post_id': 9999}),
        client.post('/api/matches', headers=headers, json={'post_id': 9999}),
        client.patch('/api/connections/9999', headers=headers, json={'status': 'CANCELLED'}),
    ):
        assert response.status_code == 404 and response.json()['error']['code'] == 'NOT_FOUND'
    assert client.post('/api/connections', headers=headers, json={'source_post_id': source['id'], 'target_post_id': target['id'], 'receiver_id': 3}).status_code == 422
    assert client.patch('/api/connections/1', headers=headers, json={'status': 'PENDING'}).status_code == 422
