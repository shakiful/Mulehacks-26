"""Private automatic checks on both message routes, with no provider calls."""
import socket

import pytest
from sqlalchemy import event

from backend.app.models import Message
from backend.app.schemas import MessageResponse
from backend.app.security.service import SecurityService
from backend.tests.auth_helpers import auth_headers
from backend.tests.test_joins_messages import accept_join, join, post
from backend.tests.test_ride_seats import accept, connect


def accepted_thread(client, study, kind):
    target = post(client, study)
    item = join(client, target) if kind == 'join' else connect(client, post(client, study, 1, intent='REQUEST'), target)
    assert (accept_join(client, item) if kind == 'join' else accept(client, item)).status_code == 200
    return item['id'], f"/api/{'joins' if kind == 'join' else 'connections'}/{item['id']}/messages"


@pytest.mark.parametrize('kind', ['connection', 'join'])
@pytest.mark.parametrize('text,risk,code', [
    ('Meet at the library at six.', 'LOW', None),
    ('Please send me your OTP immediately.', 'HIGH', 'CREDENTIAL_REQUEST'),
    ('Please share your authentication code.', 'HIGH', 'CREDENTIAL_REQUEST'),
    ('Do not share your security code.', 'LOW', None),
    ('Please verify at https://ucm-login-example.xyz/login', 'MEDIUM', 'LOGIN_LURE'),
    ('Urgently verify your account at https://ucm-login-example.xyz/login', 'HIGH', 'URGENCY'),
    ('https://ucmo.edu@other-example.test/path', 'MEDIUM', 'URL_OBFUSCATION'),
    ('javascript:alert(1)', 'MEDIUM', 'SCRIPT_LINK'),
])
def test_automatic_message_checks_are_private_even_with_gemini_and_fallback_disabled(client, settings, study, monkeypatch, caplog, kind, text, risk, code):
    thread_id, path = accepted_thread(client, study, kind)
    first = auth_headers(client)
    second = auth_headers(client, 2)
    settings.ai_provider = 'gemini'
    settings.ai_fallback_enabled = False

    class ForbiddenProvider:
        def analyze(self, request):
            pytest.fail('Automatic chat checks must never send private text to a provider')

    client.app.state.security = SecurityService(settings, ForbiddenProvider())
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *a, **k: pytest.fail('Automatic checks must not visit links or resolve DNS'))
    response = client.post(path, headers=first, json={'text': text})
    assert response.status_code == 201, response.text
    message = response.json()
    MessageResponse.model_validate(message)
    assert message['text'] == text
    security = message['security']
    assert security['risk_level'] == risk and security['analysis_mode'] == 'HEURISTIC'
    assert 'without sending it to an AI provider' in security['limitations']
    assert 'Chat messages remain saved' in security['limitations']
    assert 'not safe' in security['limitations']
    if code:
        assert code in {reason['code'] for reason in security['reasons']}
    for headers in (first, second):
        result = client.get(path, headers=headers)
        assert result.headers['cache-control'] == 'no-store'
        assert result.json()['items'] == [message]
    assert text not in caplog.text
    notifications = client.get('/api/notifications', headers=second).json()['items']
    assert all('security' not in n and 'text' not in n for n in notifications)


@pytest.mark.parametrize('kind', ['connection', 'join'])
def test_existing_messages_receive_checks_without_rewriting_or_persisting_assessments(client, study, kind):
    thread_id, path = accepted_thread(client, study, kind)
    headers = auth_headers(client, 2)
    with client.app.state.session_factory.begin() as db:
        historical = Message(sender_id=1, text='Please send your password immediately.',
                             **{kind + '_id': thread_id})
        db.add(historical)
        db.flush()
        historical_id = historical.id
    statements = []
    event.listen(client.app.state.engine, 'before_cursor_execute',
                 lambda conn, cursor, statement, params, context, many: statements.append(statement))
    message = client.get(path, headers=headers).json()['items'][0]
    assert message['id'] == historical_id
    assert message['security']['risk_level'] == 'HIGH'
    assert not any(s.lstrip().upper().startswith(('INSERT', 'UPDATE', 'DELETE', 'REPLACE')) for s in statements)
    with client.app.state.session_factory() as db:
        assert db.get(Message, historical_id).text == 'Please send your password immediately.'
    assert 'security' not in Message.__table__.columns


@pytest.mark.parametrize('kind', ['connection', 'join'])
def test_cannot_forge_a_security_result_and_private_guards_still_apply(client, study, kind):
    _, path = accepted_thread(client, study, kind)
    assert client.post(path, headers=auth_headers(client), json={'text': 'hello', 'security': {'risk_level': 'LOW'}}).status_code == 422
    assert client.get(path, headers=auth_headers(client, 3)).status_code == 403
    assert client.post(path, headers=auth_headers(client, 3), json={'text': 'hello'}).status_code == 403
    assert client.post(path, headers={'Cookie': auth_headers(client)['Cookie']}, json={'text': 'hello'}).status_code == 403
    assert client.get(path).status_code == 401
