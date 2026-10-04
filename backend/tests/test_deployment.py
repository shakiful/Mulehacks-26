"""Hosted cookie/origin and database-persistence checks use synthetic accounts."""
import pytest
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.deploy import validate_deployment
from backend.app.main import create_app

ORIGIN = 'https://connecthub-example.netlify.app'


def hosted(tmp_path, **changes):
    values = dict(database_url='sqlite:///' + (tmp_path / 'hosted.db').as_posix(),
                  cors_origins=ORIGIN, session_cookie_secure=True,
                  rafi_login_password='synthetic-hosted-password', afsana_login_password='synthetic-other-password',
                  ai_provider='heuristic', embedding_provider='heuristic', ai_timeout_seconds=18,
                  embedding_timeout_seconds=8, gemini_api_key='', openai_api_key='')
    return Settings(_env_file=None, **{**values, **changes})


def test_safe_hosted_config_and_port(tmp_path):
    assert validate_deployment(hosted(tmp_path), '10000') == 10000


@pytest.mark.parametrize('changes', [
    {'session_cookie_secure': False}, {'rafi_login_password': ''}, {'afsana_login_password': 'short'},
    {'cors_origins': ''}, {'cors_origins': 'http://app.example.com'},
    {'cors_origins': 'https://app.example.com/path'}, {'cors_origins': 'https://app.example.com/'},
    {'cors_origins': 'https://user:secret@app.example.com'}, {'cors_origins': 'https://localhost'},
    {'database_url': 'sqlite:///relative.db'}, {'database_url': 'sqlite:///:memory:'},
    {'database_url': 'malformed-synthetic-url'},
    {'ai_timeout_seconds': 30}, {'embedding_timeout_seconds': 30},
])
def test_unsafe_hosted_config_fails_before_startup(tmp_path, changes):
    with pytest.raises(ValueError):
        validate_deployment(hosted(tmp_path, **changes))
    assert not (tmp_path / 'hosted.db').exists()


@pytest.mark.parametrize('port', ['0', '65536', 'abc', '10.0', '-1', '１００００'])
def test_invalid_port(tmp_path, port):
    with pytest.raises(ValueError, match='PORT'):
        validate_deployment(hosted(tmp_path), port)


def test_https_login_origin_csrf_and_records_survive_restart(tmp_path):
    settings = hosted(tmp_path)
    validate_deployment(settings)
    with TestClient(create_app(settings), base_url=ORIGIN) as client:
        login = client.post('/api/auth/login', headers={'Origin': ORIGIN},
                            json={'username': 'rafi', 'password': 'synthetic-hosted-password'})
        assert login.status_code == 200
        cookie = login.headers['set-cookie'].lower()
        assert 'secure' in cookie and 'httponly' in cookie and 'samesite=lax' in cookie and 'path=/api' in cookie
        assert login.headers['cache-control'] == 'no-store'
        csrf = login.json()['csrf_token']
        headers = {'Origin': ORIGIN, 'X-CSRF-Token': csrf}
        post = {'category': 'COMMUNITY', 'intent': 'OFFER', 'title': 'Synthetic hosted calculator',
                'text': 'Synthetic persistence verification.', 'details': {'subcategory': 'BORROW_LEND', 'item': 'calculator'}}
        assert client.post('/api/posts', json=post, headers={'Origin': ORIGIN}).status_code == 403
        assert client.post('/api/posts', json=post, headers={**headers, 'Origin': 'https://other.example.com'}).status_code == 403
        saved = client.post('/api/posts', json=post, headers=headers)
        assert saved.status_code == 201
        post_id = saved.json()['id']
        cookies = dict(client.cookies)
    with TestClient(create_app(settings), base_url=ORIGIN) as client:
        client.cookies.update(cookies)
        assert client.get('/api/auth/session').json()['user']['username'] == 'rafi'
        assert client.get(f'/api/posts/{post_id}').json()['title'] == post['title']
        assert client.post('/api/auth/logout', json={}, headers=headers).status_code == 200
        assert client.get('/api/auth/session').json()['user'] is None
