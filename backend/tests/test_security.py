import io
import json
import socket

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from backend.app.ai.gemini import GeminiClient, GeminiUnavailable
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import StudentAccount
from backend.tests.auth_helpers import auth_headers
from backend.app.schemas import SecurityInput
from backend.app.seed import seed
from backend.app.security.gemini import GeminiSecurityProvider
from backend.app.security.service import HeuristicSecurityProvider, SecurityService, build_result

SUSPICIOUS = 'Your university account expires today. Click https://ucm-login-example.xyz to verify your account.'


def wire(extracted=None):
    if extracted is None:
        extracted = {'risk_level': 'HIGH', 'reasons': [
            {'code': 'URGENCY', 'evidence': 'account expires today'},
            {'code': 'LOGIN_LURE', 'evidence': 'https://ucm-login-example.xyz'},
        ]}
    return {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': json.dumps(extracted)}]}}]}


@pytest.mark.parametrize('text,risk,codes', [
    (SUSPICIOUS, 'HIGH', {'URGENCY', 'LOGIN_LURE'}),
    ('Hello! Study group at the library tomorrow.', 'LOW', set()),
    ('Never share your password. Do not send gift cards.', 'LOW', set()),
    ('Act now to keep your spot in the workshop.', 'MEDIUM', {'URGENCY'}),
    ('Please send your password to the help desk.', 'HIGH', {'CREDENTIAL_REQUEST'}),
    ('Urgent: buy gift cards and send money.', 'HIGH', {'URGENCY', 'PAYMENT_REQUEST'}),
    ('Claim your prize at https://prizes.example.', 'MEDIUM', {'REWARD_LURE'}),
    ('https://university.example@elsewhere.example/login', 'HIGH', {'URL_OBFUSCATION', 'LOGIN_LURE'}),
    ('http://127.0.0.1/private', 'MEDIUM', {'IP_HOST', 'INSECURE_LINK'}),
    ('https://[::1]/private', 'MEDIUM', {'IP_HOST'}),
    ('https://[::1]', 'MEDIUM', {'IP_HOST'}),
    ('hxxp://192.0.2.1/login', 'HIGH', {'IP_HOST', 'INSECURE_LINK', 'LOGIN_LURE'}),
    ('https://xn--pple-43d.example', 'MEDIUM', {'INTERNATIONALIZED_DOMAIN'}),
    ('https://аpple.example', 'MEDIUM', {'INTERNATIONALIZED_DOMAIN'}),
    ('javascript:alert(1)', 'MEDIUM', {'SCRIPT_LINK'}),
    ('data:text/html,<script>alert(1)</script>', 'MEDIUM', {'SCRIPT_LINK'}),
    ('Verify your account at www.account-example.test/login.', 'MEDIUM', {'LOGIN_LURE'}),
    ('Verify your account at account-example.test/login.', 'MEDIUM', {'LOGIN_LURE'}),
    ('https://university.example/news', 'LOW', set()),
    ('https://[broken / strange URL text', 'LOW', set()),
    ('https://login.example/a https://login.example/b', 'MEDIUM', {'LOGIN_LURE'}),
])
def test_offline_risk_is_based_on_text_and_structural_evidence(text, risk, codes):
    result = HeuristicSecurityProvider().analyze(SecurityInput(text=text))
    assert result.risk_level == risk and result.analysis_mode == 'HEURISTIC'
    assert {reason.code for reason in result.reasons} == codes
    assert 'safety is not guaranteed' in result.limitations
    assert 'not safe' in result.limitations
    assert 'known official' in result.recommendation


def test_route_shape_auth_no_persistence_no_logging_or_link_visits(client, headers, caplog, monkeypatch):
    statements = []
    event.listen(client.app.state.engine, 'before_cursor_execute',
                 lambda conn, cursor, statement, params, context, many: statements.append(statement))
    marker = 'PRIVATE-SYNTHETIC-MARKER-5972'

    def no_network(*args, **kwargs):
        pytest.fail('Offline security analysis must not perform network or DNS operations')

    monkeypatch.setattr(socket, 'getaddrinfo', no_network)
    before = client.get('/api/posts', headers=headers).json()['total']
    result = client.post('/api/security/analyze', headers={**headers, 'Origin': 'http://localhost:5173'},
                         json={'text': SUSPICIOUS + ' ' + marker})
    assert result.status_code == 200
    assert result.headers['cache-control'] == 'no-store'
    assert result.headers['access-control-allow-origin'] == 'http://localhost:5173'
    body = result.json()
    assert set(body) == {'risk_level', 'summary', 'reasons', 'recommendation', 'limitations', 'analysis_mode'}
    assert body['risk_level'] == 'HIGH'
    assert all(set(reason) == {'code', 'description'} for reason in body['reasons'])
    assert marker not in result.text and marker not in caplog.text and SUSPICIOUS not in caplog.text
    assert not any(statement.lstrip().upper().startswith(('INSERT', 'UPDATE', 'DELETE', 'REPLACE')) for statement in statements)
    assert client.get('/api/posts', headers=headers).json()['total'] == before
    with client.app.state.engine.connect() as connection:
        tables = connection.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'").scalars().all()
    assert set(tables) == {'users', 'student_accounts', 'auth_sessions', 'posts', 'connections', 'post_embeddings'}
    assert client.post('/api/security/analyze', json={'text': SUSPICIOUS}).status_code == 401
    assert client.post('/api/security/analyze', headers={'X-Demo-User-Id': '999'}, json={'text': SUSPICIOUS}).status_code == 401
    assert client.post('/api/analyze', headers=headers, json={'text': SUSPICIOUS}).status_code == 404


@pytest.mark.parametrize('body', [{}, {'text': ''}, {'text': '   '}, {'text': 'x' * 8001},
                                {'text': None}, {'text': 123}, {'text': 'hello', 'user_id': 2}])
def test_security_validation_has_standard_errors_and_no_body_echo(client, headers, body):
    response = client.post('/api/security/analyze', headers=headers, json=body)
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'
    assert all(set(detail) == {'field', 'message'} for detail in response.json()['error']['details'])
    assert 'input' not in response.json()['error']


def test_security_accepts_8000_characters_and_disabled_student_rejects(client, headers):
    assert client.post('/api/security/analyze', headers=headers, json={'text': 'x' * 8000}).status_code == 200
    assert client.post('/api/security/analyze', headers={'Cookie': headers['Cookie']}, json={'text': SUSPICIOUS}).status_code == 403
    with client.app.state.session_factory.begin() as db:
        db.get(StudentAccount, 1).active = False
    assert client.post('/api/security/analyze', headers=headers, json={'text': SUSPICIOUS}).status_code == 401


def test_gemini_wire_format_uses_only_google_and_never_echoes_private_text(settings):
    observed = {}
    settings.ai_provider = 'gemini'

    def opener(request, timeout):
        observed.update(url=request.full_url, body=json.loads(request.data), timeout=timeout,
                        key=request.get_header('X-goog-api-key'))
        return io.BytesIO(json.dumps(wire()).encode())

    settings = Settings(_env_file=None, **{**settings.model_dump(), 'gemini_api_key': 'synthetic-test-key'})
    result = GeminiSecurityProvider(settings, opener=opener).analyze(SecurityInput(text=SUSPICIOUS))
    assert observed['url'] == 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'
    assert observed['key'] == 'synthetic-test-key' and observed['timeout'] == 30
    assert json.loads(observed['body']['contents'][0]['parts'][0]['text']) == {'text': SUSPICIOUS}
    assert 'tools' not in observed['body'] and 'untrusted data' in observed['body']['systemInstruction']['parts'][0]['text']
    schema = observed['body']['generationConfig']['responseJsonSchema']
    assert schema['additionalProperties'] is False
    assert result.analysis_mode == 'LLM' and result.risk_level == 'HIGH'
    assert SUSPICIOUS not in result.model_dump_json() and 'synthetic-test-key' not in result.model_dump_json()


@pytest.mark.parametrize('extracted', [
    {'risk_level': 'SAFE', 'reasons': []},
    {'risk_level': 'HIGH', 'reasons': []},
    {'risk_level': 'HIGH', 'reasons': [{'code': 'URGENCY', 'evidence': 'this was invented'}]},
    {'risk_level': 'HIGH', 'reasons': [{'code': 'DOMAIN_OWNER_VERIFIED', 'evidence': 'account'}]},
    {'risk_level': 'LOW', 'reasons': [], 'text': SUSPICIOUS},
    {'risk_level': 'LOW', 'reasons': [], 'recommendation': 'Click the submitted link'},
    {'risk_level': 'HIGH', 'reasons': [{'code': 'URGENCY', 'evidence': '\u200b'}]},
    {'risk_level': 'HIGH', 'reasons': [{'code': 'IP_HOST', 'evidence': 'https://ucm-login-example.xyz'}]},
    {'risk_level': 'HIGH', 'reasons': [{'code': 'URL_OBFUSCATION', 'evidence': 'https://ucm-login-example.xyz'}]},
    {'risk_level': 'HIGH', 'reasons': [{'code': 'URGENCY', 'evidence': 'account'}] * 2},
    {'risk_level': 'HIGH', 'reasons': [{'code': 'URGENCY', 'evidence': 'a' * 161}]},
])
def test_bad_gemini_assessments_are_rejected(settings, extracted, monkeypatch):
    monkeypatch.setattr(GeminiClient, 'post', lambda *args, **kwargs: wire(extracted))
    with pytest.raises(GeminiUnavailable):
        GeminiSecurityProvider(settings).analyze(SecurityInput(text=SUSPICIOUS))


@pytest.mark.parametrize('payload', [
    {}, {'candidates': []}, {'candidates': [{'finishReason': 'SAFETY'}]},
    {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': 'not json'}]}}]},
])
def test_blocked_or_malformed_provider_responses_are_rejected(settings, payload, monkeypatch):
    monkeypatch.setattr(GeminiClient, 'post', lambda *args, **kwargs: payload)
    with pytest.raises(GeminiUnavailable):
        GeminiSecurityProvider(settings).analyze(SecurityInput(text=SUSPICIOUS))


def test_provider_failure_fallback_recovery_and_standard_503(settings, caplog):
    class Flaky:
        calls = 0

        def analyze(self, request):
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError('PRIVATE-SYNTHETIC-DATA synthetic-secret-key')
            return build_result('HIGH', ['URGENCY', 'LOGIN_LURE'], 'LLM')

    settings.ai_provider = 'gemini'
    provider = Flaky()
    service = SecurityService(settings, provider)
    fallback = service.analyze(SecurityInput(text=SUSPICIOUS))
    assert fallback.analysis_mode == 'HEURISTIC' and 'fallback' in fallback.limitations
    assert service.analyze(SecurityInput(text=SUSPICIOUS)).analysis_mode == 'LLM'
    assert provider.calls == 2 and 'synthetic-secret-key' not in caplog.text
    settings.ai_fallback_enabled = False
    seed(settings)
    with TestClient(create_app(settings, security_provider=Flaky())) as client:
        response = client.post('/api/security/analyze', headers=auth_headers(client), json={'text': SUSPICIOUS})
    assert response.status_code == 503
    assert response.json()['error'] == {'code': 'PROVIDER_UNAVAILABLE', 'message': 'Security analysis provider is unavailable.', 'details': []}
    assert 'PRIVATE-SYNTHETIC-DATA' not in response.text and 'synthetic-secret-key' not in response.text


def test_missing_key_defaults_and_unsupported_provider_use_fallback(settings):
    settings.ai_provider = 'gemini'
    result = SecurityService(settings).analyze(SecurityInput(text=SUSPICIOUS))
    assert result.analysis_mode == 'HEURISTIC' and result.risk_level == 'HIGH'
    settings.ai_provider = 'unimplemented'
    assert SecurityService(settings).analyze(SecurityInput(text='Hello')).analysis_mode == 'HEURISTIC'


def test_injected_rule_provider_keeps_its_honest_analysis_mode(settings):
    result = SecurityService(settings, HeuristicSecurityProvider()).analyze(SecurityInput(text=SUSPICIOUS))
    assert result.analysis_mode == 'HEURISTIC' and result.risk_level == 'HIGH'
