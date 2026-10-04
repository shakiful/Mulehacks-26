from backend.tests.auth_helpers import auth_headers
import io
import json
from urllib.error import HTTPError

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select

from backend.app.ai.embeddings import (
    BATCH_SIZE, INPUT_VERSION, EmbeddingService, EmbeddingSpec, EmbeddingUnavailable,
    OpenAIEmbeddingProvider, cosine_similarity, fingerprint,
)
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import Post, PostEmbedding
from backend.app.seed import seed


class FakeProvider:
    """Controlled vectors prove ranking mechanics, not real model quality."""
    spec = EmbeddingSpec('test', 'fixture-v1', 3)

    def __init__(self):
        self.calls = []
        self.failure = None
        self.invalid_vector = None

    def embed(self, texts):
        self.calls.append(texts)
        if self.failure:
            raise self.failure
        if self.invalid_vector is not None:
            return [self.invalid_vector for _ in texts]
        return [[1.0, 0.0, 0.0] if any(word in text.lower() for word in ('sql', 'relational'))
                else [0.0, 1.0, 0.0] for text in texts]


@pytest.fixture
def semantic_client(settings):
    seed(settings)
    settings.embedding_provider = 'openai'
    provider = FakeProvider()
    with TestClient(create_app(settings, embedding_provider=provider)) as client:
        yield client, provider


def post(client, study, author=1, **changes):
    body = {**study, **changes}
    response = client.post('/api/posts', headers=auth_headers(client, author), json=body)
    assert response.status_code == 201, response.text
    return response.json()


def match(client, source):
    return client.post('/api/matches', headers=auth_headers(client, source['author']['id']),
                       json={'post_id': source['id'], 'limit': 20})


def test_semantic_study_ranking_across_different_words_and_private_metadata(semantic_client, study):
    client, provider = semantic_client
    source = post(client, study)
    related = post(client, study, author=3, intent='OFFER', title='Relational database design',
                   text='I teach relational database design.', details={'course': 'Databases', 'mode': 'IN_PERSON'})
    unrelated = post(client, study, author=4, intent='OFFER', title='Physics tutoring',
                     text='I teach mechanics.', details={'course': 'Physics', 'mode': 'IN_PERSON'})
    response = match(client, source)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['matching_mode'] == 'SEMANTIC'
    ids = [item['post']['id'] for item in result['matches']]
    assert ids.index(related['id']) < ids.index(unrelated['id'])
    related_match = next(item for item in result['matches'] if item['post']['id'] == related['id'])
    assert related_match['score'] == 75.0
    assert 'Semantic relevance between confirmed posts' in related_match['reasons']
    assert all(not any('Heuristic' in warning for warning in item['warnings']) for item in result['matches'])
    assert set(related_match) == {'post', 'score', 'reasons', 'warnings'}
    assert all(key not in response.text for key in ('input_hash', 'input_version', 'vector', 'fixture-v1'))
    with client.app.state.session_factory() as db:
        row = db.get(PostEmbedding, source['id'])
        assert (row.provider, row.model, row.dimensions, row.input_version) == ('test', 'fixture-v1', 3, INPUT_VERSION)
        assert row.input_hash == fingerprint(db.get(Post, source['id']))
        assert row.created_at.tzinfo is not None and len(row.vector) == 3
    calls = len(provider.calls)
    assert match(client, source).json() == result
    assert len(provider.calls) == calls


def test_semantic_missing_availability_does_not_inflate_weights_and_ties_sort_by_id(semantic_client, study):
    client, _ = semantic_client
    sparse = {**study, 'starts_at': None, 'ends_at': None, 'location': None,
              'details': {'course': 'SQL', 'topic': 'joins', 'mode': None}}
    source = post(client, sparse)
    first = post(client, sparse, author=2, intent='OFFER')
    second = post(client, sparse, author=3, intent='OFFER')
    ranked = match(client, source).json()['matches']
    assert [item['post']['id'] for item in ranked[:2]] == [first['id'], second['id']]
    assert ranked[0]['score'] == 65.0
    assert any('availability' in warning and 'zero' in warning for warning in ranked[0]['warnings'])


@pytest.mark.parametrize('category,details,expected', [
    ('RESTAURANT', {'cuisine': 'Korean', 'activity_type': 'DINING', 'group_size': 2}, 100.0),
    ('COMMUNITY', {'subcategory': 'BORROW_LEND', 'item': 'calculator'}, 75.0),
])
def test_semantic_component_used_for_food_and_community(semantic_client, category, details, expected):
    client, _ = semantic_client
    body = {'category': category, 'intent': 'REQUEST', 'title': 'Synthetic demo',
            'text': 'Synthetic demo category test', 'details': details}
    if category == 'RESTAURANT':
        body.update(location='Campus', starts_at='2026-10-03T18:00:00-05:00')
    source = post(client, body)
    target = post(client, body, author=2, intent='OFFER')
    result = match(client, source).json()
    assert result['matching_mode'] == 'SEMANTIC'
    item = next(item for item in result['matches'] if item['post']['id'] == target['id'])
    assert item['score'] == expected


@pytest.mark.parametrize('fallback,expected', [(True, 200), (False, 503)])
def test_configured_openai_without_key_uses_fallback_or_standard_503(settings, study, fallback, expected):
    settings.embedding_provider = 'openai'
    settings.ai_fallback_enabled = fallback
    seed(settings)
    with TestClient(create_app(settings)) as client:
        source = post(client, study)
        response = match(client, source)
        assert response.status_code == expected
        if fallback:
            assert response.json()['matching_mode'] == 'HEURISTIC'
        else:
            assert response.json()['error']['code'] == 'PROVIDER_UNAVAILABLE'


@pytest.mark.parametrize('field,value', [
    ('provider', 'another-provider'), ('model', 'older-model'), ('dimensions', 2),
    ('input_version', 'old-input-format'), ('input_hash', 'stale-hash'),
    ('vector', [0.0, 0.0, 0.0]), ('vector', [1.0, 0.0]), ('vector', ['bad', 0.0, 0.0]),
])
def test_stale_or_corrupt_cache_regenerated_before_comparison(semantic_client, study, field, value):
    client, provider = semantic_client
    source = post(client, study)
    assert match(client, source).json()['matching_mode'] == 'SEMANTIC'
    with client.app.state.session_factory() as db:
        row = db.get(PostEmbedding, source['id'])
        setattr(row, field, value)
        db.commit()
    before = len(provider.calls)
    assert match(client, source).json()['matching_mode'] == 'SEMANTIC'
    assert len(provider.calls) == before + 1 and len(provider.calls[-1]) == 1
    with client.app.state.session_factory() as db:
        row = db.get(PostEmbedding, source['id'])
        assert row.model == 'fixture-v1' and row.dimensions == 3 and row.vector == [1.0, 0.0, 0.0]


def test_model_change_and_confirmed_text_change_invalidate_cache(semantic_client, study):
    client, provider = semantic_client
    source = post(client, study)
    match(client, source)
    provider.spec = EmbeddingSpec('test', 'fixture-v2', 3)
    assert match(client, source).json()['matching_mode'] == 'SEMANTIC'
    assert len(provider.calls[-1]) == 2  # Source plus the compatible seeded tutor.
    with client.app.state.session_factory() as db:
        db.get(Post, source['id']).text = 'Confirmed updated SQL question'
        db.commit()
    assert match(client, source).json()['matching_mode'] == 'SEMANTIC'
    assert provider.calls[-1] == ['Help with SQL joins\nConfirmed updated SQL question']


@pytest.mark.parametrize('vector', [[0, 0, 0], [1, 2], [True, 0, 0], ['1', 0, 0],
                                   [float('nan'), 0, 0], [float('inf'), 0, 0]])
def test_invalid_provider_vectors_use_consistent_fallback_without_partial_storage(semantic_client, study, vector):
    client, provider = semantic_client
    provider.invalid_vector = vector
    source = post(client, study)
    response = match(client, source)
    assert response.status_code == 200 and response.json()['matching_mode'] == 'HEURISTIC'
    assert all(any('unavailable' in warning for warning in item['warnings']) for item in response.json()['matches'])
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(PostEmbedding)) == 0


def test_unavailable_provider_503_hides_secrets_and_preserves_created_post(semantic_client, study):
    client, provider = semantic_client
    client.app.state.settings.ai_fallback_enabled = False
    provider.failure = TimeoutError('secret-key private provider response')
    source = post(client, study)
    response = match(client, source)
    assert response.status_code == 503 and response.json()['error']['code'] == 'PROVIDER_UNAVAILABLE'
    assert 'secret-key' not in response.text and 'private provider' not in response.text
    assert client.get(f"/api/posts/{source['id']}", headers=auth_headers(client, 1)).status_code == 200


def test_cached_model_mismatch_and_provider_failure_never_mix_vectors(semantic_client, study):
    client, provider = semantic_client
    source = post(client, study)
    match(client, source)
    with client.app.state.session_factory() as db:
        row = db.get(PostEmbedding, source['id'])
        row.model = 'old-model'
        db.commit()
    provider.failure = TimeoutError('private failure')
    assert match(client, source).json()['matching_mode'] == 'HEURISTIC'
    with client.app.state.session_factory() as db:
        assert db.get(PostEmbedding, source['id']).model == 'old-model'


def test_hard_gates_and_authorization_run_before_embedding_calls(semantic_client, study):
    client, provider = semantic_client
    source = post(client, study)
    excluded = [
        post(client, study, intent='OFFER', title='SELF_ONLY'),
        post(client, study, author=3, intent='REQUEST', title='WRONG_INTENT_ONLY'),
        post(client, study, author=3, intent='OFFER', title='OTHER_MODE_ONLY', details={'topic': 'SQL', 'mode': 'ONLINE'}),
        post(client, study, author=3, intent='OFFER', title='OTHER_LOCATION_ONLY', location='Student Union'),
        post(client, study, author=3, intent='OFFER', title='DISJOINT_ONLY', starts_at='2026-10-03T19:00:00-05:00', ends_at='2026-10-03T20:00:00-05:00'),
    ]
    closed = post(client, study, author=4, intent='OFFER', title='CLOSED_ONLY')
    client.patch(f"/api/posts/{closed['id']}", headers=auth_headers(client, 4), json={'status': 'COMPLETED'})
    excluded.append(closed)
    assert client.post('/api/matches', headers=auth_headers(client, 2), json={'post_id': source['id']}).status_code == 403
    assert provider.calls == []
    result = match(client, source).json()
    assert not set(item['id'] for item in excluded) & set(item['post']['id'] for item in result['matches'])
    assert not any('ONLY' in text for call in provider.calls for text in call)


def test_ride_and_empty_candidates_do_not_call_provider_even_with_fallback_disabled(semantic_client, study):
    client, provider = semantic_client
    provider.failure = TimeoutError('unavailable')
    client.app.state.settings.ai_fallback_enabled = False
    ride = post(client, {'category': 'RIDE', 'intent': 'REQUEST', 'title': 'Demo ride', 'text': 'Synthetic demo ride',
                        'starts_at': '2026-10-03T18:00:00-05:00', 'details': {'origin': 'UCM', 'destination': 'Walmart', 'seats': 1,
                        'origin_point': {'lat': 38.7625, 'lng': -93.7395}, 'destination_point': {'lat': 38.7905, 'lng': -93.7390}}})
    assert match(client, ride).json()['matching_mode'] == 'HEURISTIC'
    empty = post(client, study, intent='PARTNER', details={'topic': 'SQL', 'mode': 'IN_PERSON'})
    assert match(client, empty).json()['matches'] == []
    assert provider.calls == []


def test_batches_all_validate_before_storage_and_refresh_is_repeatable(client):
    provider = FakeProvider()
    with client.app.state.session_factory() as db:
        for number in range(BATCH_SIZE + 1):
            db.add(Post(user_id=1, category='STUDY', intent='REQUEST', title=f'SQL demo {number}',
                        text='Synthetic SQL test', details={'topic': 'SQL'}))
        db.commit()
        posts = list(db.scalars(select(Post).where(Post.user_id == 1)))
        service = EmbeddingService(client.app.state.settings, provider)
        original = provider.embed

        def second_batch_fails(texts):
            if len(provider.calls) == 1:
                raise TimeoutError('failure on second batch')
            return original(texts)

        provider.embed = second_batch_fails
        assert service.prepare(db, posts).mode == 'HEURISTIC'
        assert db.scalar(select(func.count()).select_from(PostEmbedding)) == 0
        provider.embed = original
        provider.calls.clear()
        assert service.prepare(db, posts).mode == 'SEMANTIC'
        assert [len(batch) for batch in provider.calls] == [BATCH_SIZE, 1]
        assert db.scalar(select(func.count()).select_from(PostEmbedding)) == len(posts)
        calls = len(provider.calls)
        service.prepare(db, posts)
        assert len(provider.calls) == calls
        service.prepare(db, posts, refresh=True)
        assert len(provider.calls) == calls + 2
        assert db.scalar(select(func.count()).select_from(PostEmbedding)) == len(posts)


def test_openai_adapter_request_and_out_of_order_vectors(settings):
    settings.openai_api_key = 'test-secret'
    # Assignment is deliberately converted by recreating the validated settings.
    settings = Settings(**settings.model_dump(), _env_file=None)
    settings.embedding_dimensions = 3
    observed = {}

    def opener(request, timeout):
        observed.update(url=request.full_url, body=json.loads(request.data), timeout=timeout,
                        authorization=request.get_header('Authorization'))
        return io.BytesIO(json.dumps({'model': settings.embedding_model, 'data': [
            {'index': 1, 'embedding': [0, 1, 0]}, {'index': 0, 'embedding': [1, 0, 0]},
        ]}).encode())

    output = OpenAIEmbeddingProvider(settings, opener=opener).embed(['SQL question', 'Physics question'])
    assert output == [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
    assert observed['url'] == 'https://api.openai.com/v1/embeddings'
    assert observed['body'] == {'input': ['SQL question', 'Physics question'], 'model': settings.embedding_model,
                                'encoding_format': 'float', 'dimensions': 3}
    assert observed['timeout'] == 10 and observed['authorization'] == 'Bearer test-secret'
    assert 'test-secret' not in repr(settings)


@pytest.mark.parametrize('body', [
    {}, {'model': 'other-model', 'data': [{'index': 0, 'embedding': [1, 0, 0]}]},
    {'model': 'text-embedding-3-small', 'data': []},
    {'model': 'text-embedding-3-small', 'data': [{'index': True, 'embedding': [1, 0, 0]}]},
    {'model': 'text-embedding-3-small', 'data': [{'index': 0, 'embedding': [1, 0]}]},
])
def test_openai_adapter_rejects_malformed_model_count_indices_and_dimensions(settings, body):
    settings = Settings(**{**settings.model_dump(), 'openai_api_key': 'test-secret', 'embedding_dimensions': 3}, _env_file=None)
    with pytest.raises(EmbeddingUnavailable, match='Embedding provider is unavailable'):
        OpenAIEmbeddingProvider(settings, opener=lambda *args, **kwargs: io.BytesIO(json.dumps(body).encode())).embed(['SQL'])


def test_openai_auth_failure_and_missing_key_are_redacted(settings):
    provider = OpenAIEmbeddingProvider(settings, opener=lambda *args, **kwargs: pytest.fail('Missing key must not make a network request'))
    with pytest.raises(EmbeddingUnavailable):
        provider.embed(['SQL'])
    settings = Settings(**{**settings.model_dump(), 'openai_api_key': 'test-secret'}, _env_file=None)

    def failure(*args, **kwargs):
        raise HTTPError('https://api.openai.com/v1/embeddings', 401, 'test-secret', {}, io.BytesIO(b'private provider content'))

    with pytest.raises(EmbeddingUnavailable) as error:
        OpenAIEmbeddingProvider(settings, opener=failure).embed(['SQL'])
    assert str(error.value) == 'Embedding provider is unavailable'


@pytest.mark.parametrize('left,right,expected', [
    ([1, 0], [3, 0], 1.0), ([1, 0], [0, 1], 0.0), ([1, 0], [-1, 0], 0.0),
    ([1e200, 1e200], [1e200, 1e200], 1.0),
])
def test_cosine_is_scaled_and_clamped(left, right, expected):
    assert cosine_similarity(left, right) == pytest.approx(expected)


@pytest.mark.parametrize('values', [
    {'embedding_dimensions': 0}, {'embedding_dimensions': 3073},
    {'embedding_timeout_seconds': 0}, {'embedding_timeout_seconds': float('inf')},
])
def test_embedding_settings_bounds(values):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **values)
