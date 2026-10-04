import copy
import io
import json
from datetime import datetime
from urllib.error import HTTPError

import pytest
from pydantic import SecretStr, ValidationError
from sqlalchemy import func, select

from backend.app.ai.embeddings import EmbeddingService, EmbeddingUnavailable, GeminiEmbeddingProvider
from backend.app.ai.gemini import MAX_RESPONSE_BYTES, GeminiClient, GeminiUnavailable, NoRedirect
from backend.app.ai.gemini_understanding import GeminiUnderstandingProvider
from backend.app.ai.understanding import UnderstandingService
from backend.app.config import Settings
from backend.app.errors import APIError
from backend.app.models import Post, PostEmbedding
from backend.app.schemas import UnderstandInput


@pytest.fixture
def gemini_settings(settings):
    return Settings(_env_file=None, **{**settings.model_dump(), 'gemini_api_key': 'test-google-secret',
        'ai_provider': 'gemini', 'embedding_provider': 'gemini',
        'embedding_model': 'gemini-embedding-001', 'embedding_dimensions': 3})


def request(text='I need help studying SQL joins tonight', **changes):
    return UnderstandInput(text=text, reference_time='2026-10-03T16:00:00-05:00',
                           timezone='America/Chicago', **changes)


def extraction(**changes):
    return {'category': 'STUDY', 'intent': 'REQUEST', 'title': 'Help with SQL joins',
        'location': None, 'starts_at': None, 'ends_at': None,
        'details': {'course': 'SQL', 'topic': 'joins'}, 'warnings': [], **changes}


def response(fields=None, *, reason='STOP'):
    return {'candidates': [{'finishReason': reason, 'content': {'parts': [
        {'text': json.dumps(fields if fields is not None else extraction())}]}}]}


def opener_for(body):
    return lambda *args, **kwargs: io.BytesIO(json.dumps(body).encode())


def test_gemini_extraction_uses_schema_reference_context_and_server_only_key(gemini_settings):
    observed = {}

    def opener(req, timeout):
        observed.update(url=req.full_url, body=json.loads(req.data), timeout=timeout,
                        key=req.get_header('X-goog-api-key'))
        return io.BytesIO(json.dumps(response()).encode())

    result = GeminiUnderstandingProvider(gemini_settings, opener=opener).preview(request())
    assert result.analysis_mode == 'LLM' and result.text == request().text
    assert result.details == {'course': 'SQL', 'topic': 'joins', 'skill_level': None, 'mode': None}
    assert result.starts_at is None and result.ends_at is None and result.location is None
    assert observed['url'].endswith('/models/gemini-3.5-flash-lite:generateContent')
    assert observed['timeout'] == 30 and observed['key'] == 'test-google-secret'
    context = json.loads(observed['body']['contents'][0]['parts'][0]['text'])
    assert context['reference_time'] == '2026-10-03T16:00:00-05:00'
    assert context['timezone'] == 'America/Chicago' and context['text'] == request().text
    assert 'untrusted data' in observed['body']['systemInstruction']['parts'][0]['text']
    assert observed['body']['generationConfig']['responseMimeType'] == 'application/json'
    assert observed['body']['generationConfig']['responseJsonSchema']['additionalProperties'] is False
    assert 'test-google-secret' not in json.dumps(observed['body'])
    assert 'test-google-secret' not in repr(gemini_settings)


def test_gemini_missing_ride_fields_are_computed_and_never_defaulted(gemini_settings):
    body = extraction(category='RIDE', title='Ride to Walmart',
        starts_at='2026-10-03T18:00:00-05:00', details={'destination': 'Walmart'})
    result = GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(body))).preview(
        request('I need a ride to Walmart around 6 tonight'))
    assert result.details == {'origin': None, 'destination': 'Walmart', 'seats': None, 'purpose': None,
                              'origin_point': None, 'destination_point': None}
    assert result.missing_fields == ['details.origin', 'details.seats', 'details.origin_point', 'details.destination_point']
    assert result.starts_at == datetime.fromisoformat('2026-10-03T23:00:00Z')


@pytest.mark.parametrize('text', ['I need SQL tutoring tonight', 'I need SQL tutoring at 6 pm'])
def test_gemini_drops_invented_date_or_clock_and_duration(gemini_settings, text):
    body = extraction(starts_at='2026-10-03T18:00:00-05:00', ends_at='2026-10-03T19:00:00-05:00')
    result = GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(body))).preview(request(text))
    assert result.starts_at is None and result.ends_at is None
    assert result.warnings


def test_gemini_drops_unspecified_duration_but_accepts_explicit_range_and_utc(gemini_settings):
    body = extraction(starts_at='2026-10-03T23:00:00Z', ends_at='2026-10-04T00:00:00Z')
    provider = GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(body)))
    assert provider.preview(request('SQL tutoring today at 6 pm')).ends_at is None
    result = provider.preview(request('SQL tutoring today from 6 pm until 7 pm'))
    assert result.ends_at == datetime.fromisoformat('2026-10-04T00:00:00Z')


@pytest.mark.parametrize('text,starts_at', [
    ('SQL tutoring today at 6 pm', '2026-10-04T18:00:00-05:00'),
    ('SQL tutoring today at 6 pm', '2026-10-03T18:00:00+03:00'),
])
def test_gemini_rejects_wrong_reference_date_or_offset(gemini_settings, text, starts_at):
    with pytest.raises(GeminiUnavailable):
        GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(extraction(starts_at=starts_at)))).preview(request(text))


@pytest.mark.parametrize('text,starts_at', [
    ('SQL tutoring today at 6', '2026-10-03T18:00:00-05:00'),
    ('SQL tutoring on 2026-11-01 at 1:30 am', '2026-11-01T01:30:00-05:00'),
    ('SQL tutoring on 2026-03-08 at 2:30 am', '2026-03-08T02:30:00-06:00'),
])
def test_gemini_ambiguous_ampm_and_dst_require_clarification(gemini_settings, text, starts_at):
    provider = GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(extraction(starts_at=starts_at))))
    assert provider.preview(request(text)).starts_at is None


def test_gemini_manual_override_and_private_security_shape(gemini_settings):
    provider = GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response()))
    with pytest.raises(GeminiUnavailable):
        provider.preview(request(category_hint='COMMUNITY'))
    body = extraction(category='CYBERSECURITY', intent=None, details=None, title='Private assessment')
    provider = GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(body)))
    result = provider.preview(request('Suspicious university account expires message'))
    assert result.category == 'CYBERSECURITY' and result.intent is None and result.details is None
    body['details'] = {'topic': 'SQL'}
    with pytest.raises(GeminiUnavailable):
        GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(body))).preview(request())


@pytest.mark.parametrize('changes', [
    {'details': {'course': 'SQL', 'seats': 2}}, {'intent': None},
    {'details': {'topic': 'SQL', 'mode': 'ANYWHERE'}}, {'category': 'UNSUPPORTED'},
    {'category': 'RIDE', 'intent': 'REQUEST', 'details': {'seats': True}},
    {'category': 'RIDE', 'intent': 'REQUEST', 'details': {'seats': '1'}},
    {'title': ''}, {'extra_provider_field': 'private response'},
])
def test_gemini_malformed_extraction_is_rejected(gemini_settings, changes):
    with pytest.raises(GeminiUnavailable):
        GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(extraction(**changes)))).preview(request())


@pytest.mark.parametrize('body', [{}, {'candidates': []}, response(reason='MAX_TOKENS'),
    {'promptFeedback': {'blockReason': 'SAFETY'}},
    {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': 'not json'}]}}]},
])
def test_gemini_empty_blocked_and_truncated_responses_are_unavailable(gemini_settings, body):
    with pytest.raises(GeminiUnavailable):
        GeminiUnderstandingProvider(gemini_settings, opener=opener_for(body)).preview(request())


def test_gemini_embedding_batch_format_order_dimensions_and_task_cache_version(gemini_settings):
    observed = {}

    def opener(req, timeout):
        observed.update(url=req.full_url, body=json.loads(req.data), timeout=timeout)
        return io.BytesIO(json.dumps({'embeddings': [{'values': [1, 0, 0]}, {'values': [0, 1, 0]}]}).encode())

    provider = GeminiEmbeddingProvider(gemini_settings, opener=opener)
    assert provider.embed(['SQL example', 'Physics example']) == [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
    assert observed['url'].endswith('/models/gemini-embedding-001:batchEmbedContents')
    assert observed['timeout'] == 10
    assert observed['body']['requests'] == [
        {'model': 'models/gemini-embedding-001', 'content': {'parts': [{'text': text}]},
         'taskType': 'SEMANTIC_SIMILARITY', 'outputDimensionality': 3}
        for text in ('SQL example', 'Physics example')]
    assert provider.spec.provider == 'gemini'
    assert 'gemini-semantic-similarity-v1' in provider.spec.input_version
    assert isinstance(EmbeddingService(gemini_settings).provider, GeminiEmbeddingProvider)
    assert isinstance(UnderstandingService(gemini_settings).provider, GeminiUnderstandingProvider)


@pytest.mark.parametrize('body', [{}, {'embeddings': []}, {'embeddings': [{'values': [1, 0]}]},
    {'embeddings': [{'values': [True, 0, 0]}]}, {'embeddings': [{'values': [0, 0, 0]}]},
    {'embeddings': [{'values': [float('nan'), 0, 0]}]},
])
def test_gemini_invalid_embedding_count_and_values_are_rejected(gemini_settings, body):
    with pytest.raises(EmbeddingUnavailable):
        GeminiEmbeddingProvider(gemini_settings, opener=opener_for(body)).embed(['Synthetic test'])


@pytest.mark.parametrize('fallback', [True, False])
def test_gemini_failure_uses_labeled_fallback_or_redacted_standard_error(gemini_settings, fallback):
    def failure(*args, **kwargs):
        raise HTTPError('provider', 403, 'test-google-secret private text', {}, io.BytesIO(b'private content'))

    gemini_settings.ai_fallback_enabled = fallback
    provider = GeminiUnderstandingProvider(gemini_settings, opener=failure)
    service = UnderstandingService(gemini_settings, provider)
    if fallback:
        result = service.preview(request())
        assert result.analysis_mode == 'HEURISTIC' and any('unavailable' in warning for warning in result.warnings)
        assert 'test-google-secret' not in result.model_dump_json()
    else:
        with pytest.raises(APIError) as error:
            service.preview(request())
        assert error.value.status == 503
        assert 'test-google-secret' not in str(error.value)


def test_gemini_transport_bounds_missing_key_bad_model_and_redirects():
    def no_call(*args, **kwargs):
        pytest.fail('Invalid configuration must not send a request')

    with pytest.raises(GeminiUnavailable):
        GeminiClient(SecretStr(''), opener=no_call).post('model', 'generateContent', {}, timeout=1)
    with pytest.raises(GeminiUnavailable):
        GeminiClient(SecretStr('test-google-secret'), opener=no_call).post('../model?key=other', 'generateContent', {}, timeout=1)
    provider = GeminiClient(SecretStr('test-google-secret'), opener=lambda *args, **kwargs: io.BytesIO(b'x' * (MAX_RESPONSE_BYTES + 1)))
    with pytest.raises(GeminiUnavailable):
        provider.post('model', 'generateContent', {}, timeout=1)
    assert NoRedirect().redirect_request(None, None, 302, '', {}, 'https://another-host.test') is None


def test_gemini_matches_endpoint_caches_google_vectors_and_recovers_offline(client, headers, study, gemini_settings):
    calls = []

    def opener(req, timeout):
        payload = json.loads(req.data)
        calls.append(payload)
        return io.BytesIO(json.dumps({'embeddings': [{'values': [1, 0, 0]} for _ in payload['requests']]}).encode())

    provider = GeminiEmbeddingProvider(gemini_settings, opener=opener)
    client.app.state.embeddings = EmbeddingService(gemini_settings, provider)
    source = client.post('/api/posts', headers=headers, json=study).json()
    result = client.post('/api/matches', headers=headers, json={'post_id': source['id']})
    assert result.status_code == 200 and result.json()['matching_mode'] == 'SEMANTIC'
    assert len(calls) == 1 and len(calls[0]['requests']) == 2
    with client.app.state.session_factory() as db:
        row = db.get(PostEmbedding, source['id'])
        assert row.provider == 'gemini' and row.dimensions == 3
    assert client.post('/api/matches', headers=headers, json={'post_id': source['id']}).json() == result.json()
    assert len(calls) == 1
    with client.app.state.session_factory() as db:
        db.get(Post, source['id']).text = 'Changed confirmed SQL text'
        db.commit()
    provider.client.opener = lambda *args, **kwargs: (_ for _ in ()).throw(TimeoutError('test-google-secret'))
    result = client.post('/api/matches', headers=headers, json={'post_id': source['id']})
    assert result.json()['matching_mode'] == 'HEURISTIC' and 'test-google-secret' not in result.text


def test_gemini_understand_endpoint_shape_identity_and_no_persistence(client, headers, monkeypatch):
    client.app.state.settings.ai_provider = 'gemini'
    monkeypatch.setattr(GeminiClient, 'post', lambda *args, **kwargs: copy.deepcopy(response()))
    body = request().model_dump(mode='json')
    assert client.post('/api/understand', json=body).status_code == 401
    result = client.post('/api/understand', headers=headers, json=body)
    assert result.status_code == 200 and result.json()['analysis_mode'] == 'LLM'
    assert set(result.json()) == {'category', 'intent', 'title', 'text', 'location', 'starts_at', 'ends_at',
                                  'details', 'missing_fields', 'warnings', 'analysis_mode'}
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Post)) == 6
        assert db.scalar(select(func.count()).select_from(PostEmbedding)) == 0


def test_google_environment_aliases_are_secret_values(tmp_path, monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.delenv('GOOGLE_API_KEY', raising=False)
    env = tmp_path / '.env'
    for name in ('GEMINI_API_KEY', 'GOOGLE_API_KEY'):
        env.write_text(f'{name}=test-google-secret\n', encoding='utf-8')
        settings = Settings(_env_file=env)
        assert settings.gemini_api_key.get_secret_value() == 'test-google-secret'
        assert 'test-google-secret' not in repr(settings)


@pytest.mark.parametrize('value', [0, 61, float('inf')])
def test_understanding_timeout_is_bounded(value):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, ai_timeout_seconds=value)


@pytest.mark.parametrize('text,start,end', [
    ('SQL tutoring today at six pm', '2026-10-03T18:00:00-05:00', None),
    ('SQL tutoring around six tonight', '2026-10-03T18:00:00-05:00', None),
    ('SQL tutoring today at half past six pm', '2026-10-03T18:30:00-05:00', None),
    ('SQL tutoring today at quarter to seven pm', '2026-10-03T18:45:00-05:00', None),
    ('SQL tutoring tomorrow from six to seven pm', '2026-10-04T18:00:00-05:00', '2026-10-04T19:00:00-05:00'),
    ('SQL tutoring tomorrow 6-7 pm', '2026-10-04T18:00:00-05:00', '2026-10-04T19:00:00-05:00'),
])
def test_gemini_word_times_and_ranges_survive_validation(gemini_settings, text, start, end):
    body = extraction(starts_at=start, ends_at=end)
    result = GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(body))).preview(request(text))
    assert result.starts_at == datetime.fromisoformat(start)
    assert result.ends_at == (datetime.fromisoformat(end) if end else None)


def test_gemini_word_time_without_meridiem_and_non_clock_numbers_do_not_get_guessed(gemini_settings):
    body = extraction(starts_at='2026-10-04T18:00:00-05:00')
    provider = GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(body)))
    assert provider.preview(request('SQL tutoring tomorrow around six')).starts_at is None
    assert provider.preview(request('Two students need SQL tutoring tomorrow')).starts_at is None


@pytest.mark.parametrize('text', ['SQL tomorrow 6-7', 'SQL tomorrow from six to seven'])
def test_gemini_ranges_need_meridiem_when_not_specified(gemini_settings, text):
    provider = GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(extraction(
        starts_at='2026-10-04T18:00:00-05:00', ends_at='2026-10-04T19:00:00-05:00'))))
    result = provider.preview(request(text))
    assert result.starts_at is None and result.ends_at is None


def test_iso_date_is_not_confused_with_availability_range(gemini_settings):
    provider = GeminiUnderstandingProvider(gemini_settings, opener=opener_for(response(extraction(
        starts_at='2026-10-03T18:00:00-05:00', ends_at='2026-10-03T19:00:00-05:00'))))
    assert provider.preview(request('SQL tutoring on 2026-10-03 at 6 pm')).ends_at is None


def test_gemini_new_defaults_fall_back_without_key_and_retry_provider_on_next_request(monkeypatch):
    settings = Settings(_env_file=None, gemini_api_key='', openai_api_key='')
    assert UnderstandingService(settings).preview(request()).analysis_mode == 'HEURISTIC'
    calls = []

    def post(*args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise GeminiUnavailable('offline')
        return response()

    monkeypatch.setattr(GeminiClient, 'post', post)
    service = UnderstandingService(settings)
    assert service.preview(request()).analysis_mode == 'HEURISTIC'
    assert service.preview(request()).analysis_mode == 'LLM'
    assert len(calls) == 2
