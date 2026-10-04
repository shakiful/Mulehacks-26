from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select, text

from backend.app.auth import COOKIE_NAME, hash_password, token_hash, verify_password
from backend.app.database import Base, make_engine, session_factory, utcnow
from backend.app.main import create_app
from backend.app.models import AuthSession, Connection, Post, StudentAccount, User
from backend.tests.test_api import assert_error


def sign_in(client, username='rafi'):
    response = client.post('/api/auth/login', json={'username': username, 'password': 'synthetic-fixture-password'},
                           headers={'Origin': 'http://localhost:5173'})
    assert response.status_code == 200, response.text
    return response


@pytest.mark.parametrize('username,name,user_id', [('rafi', 'Rafi', 1), ('afsana', 'Afsana', 2)])
def test_student_login_cookie_session_and_owner(client, study, username, name, user_id):
    response = sign_in(client, username.upper())
    session = response.json()
    assert session['user'] == {'id': user_id, 'name': name, 'username': username}
    cookie = response.headers['set-cookie']
    assert 'HttpOnly' in cookie and 'SameSite=lax' in cookie and 'Path=/api' in cookie
    assert response.headers['cache-control'] == 'no-store'
    assert client.get('/api/auth/session').json() == session
    token = client.cookies.get(COOKIE_NAME)
    assert token not in response.text and 'password' not in response.text
    with client.app.state.session_factory() as db:
        stored = db.get(AuthSession, token_hash(token))
        assert stored and stored.user_id == user_id and stored.token_hash != token
    post = client.post('/api/posts', json=study, headers={'X-CSRF-Token': session['csrf_token'],
        'X-Demo-User-Id': str(3-user_id)}).json()
    assert post['author'] == {'id': user_id, 'name': name}


@pytest.mark.parametrize('username,password', [('unknown', 'synthetic-fixture-password'), ('rafi', 'incorrect'), ('afsana', 'incorrect')])
def test_invalid_login_is_generic_and_does_not_create_session(client, username, password):
    response = client.post('/api/auth/login', json={'username': username, 'password': password})
    error = assert_error(response, 401, 'INVALID_CREDENTIALS')
    assert error['message'] == 'The username or password is incorrect.'
    assert COOKIE_NAME not in client.cookies
    assert client.get('/api/auth/session').json() == {'user': None, 'csrf_token': None}


def test_logout_revokes_session_and_replayed_cookie(client):
    session = sign_in(client).json()
    token = client.cookies.get(COOKIE_NAME)
    assert client.get('/api/posts').status_code == 200
    response = client.post('/api/auth/logout', headers={'X-CSRF-Token': session['csrf_token']})
    assert response.json() == {'user': None, 'csrf_token': None}
    assert COOKIE_NAME not in client.cookies
    assert_error(client.get('/api/posts', headers={'Cookie': f'{COOKIE_NAME}={token}'}), 401, 'UNAUTHORIZED')
    assert client.post('/api/auth/logout').status_code == 200


def test_expired_and_disabled_accounts_cannot_use_sessions(client):
    sign_in(client)
    token = client.cookies.get(COOKIE_NAME)
    with client.app.state.session_factory.begin() as db:
        db.get(AuthSession, token_hash(token)).expires_at = utcnow()-timedelta(seconds=1)
    assert client.get('/api/auth/session').json()['user'] is None
    assert_error(client.get('/api/posts'), 401, 'UNAUTHORIZED')
    sign_in(client)
    with client.app.state.session_factory.begin() as db:
        db.get(StudentAccount, 1).active = False
    assert_error(client.get('/api/posts'), 401, 'UNAUTHORIZED')
    assert_error(client.post('/api/auth/login', json={'username': 'rafi', 'password': 'synthetic-fixture-password'}), 401, 'INVALID_CREDENTIALS')


def test_csrf_and_cross_origin_requests_are_rejected(client, study):
    session = sign_in(client).json()
    assert_error(client.post('/api/posts', json=study), 403, 'CSRF_REQUIRED')
    assert_error(client.post('/api/posts', json=study, headers={'X-CSRF-Token': 'wrong'}), 403, 'CSRF_REQUIRED')
    assert_error(client.post('/api/posts', json=study, headers=[(b'X-CSRF-Token', 'invalid-\u00e9'.encode())]), 403, 'CSRF_REQUIRED')
    assert_error(client.post('/api/posts', json=study, headers={'X-CSRF-Token': session['csrf_token'], 'Origin': 'https://attacker.invalid'}), 403, 'FORBIDDEN')
    assert_error(client.post('/api/auth/logout'), 403, 'CSRF_REQUIRED')
    assert_error(client.post('/api/auth/login', json={'username': 'rafi', 'password': 'synthetic-fixture-password'}, headers={'Origin': 'null'}), 403, 'FORBIDDEN')
    assert client.get('/api/posts').status_code == 200


def test_login_rotates_session_and_old_csrf_and_cookie_cannot_be_reused(client, study):
    first = sign_in(client).json()
    old_token = client.cookies.get(COOKIE_NAME)
    second = sign_in(client, 'afsana').json()
    assert first['csrf_token'] != second['csrf_token']
    assert_error(client.post('/api/posts', json=study, headers={'X-CSRF-Token': first['csrf_token']}), 403, 'CSRF_REQUIRED')
    assert_error(client.get('/api/posts', headers={'Cookie': f'{COOKIE_NAME}={old_token}'}), 401, 'UNAUTHORIZED')


def test_password_hashes_are_salted_and_credentials_never_echo_in_validation(client):
    password = 'synthetic-password-only'
    first, second = hash_password(password), hash_password(password)
    assert first != second and password not in first
    assert verify_password(password, first)
    assert not verify_password('wrong', first)
    assert not verify_password(password, 'malformed')
    response = client.post('/api/auth/login', json={'username': 'rafi', 'password': password, 'user_id': 2})
    assert_error(response, 422, 'VALIDATION_ERROR')
    assert password not in response.text


def test_login_attempts_are_limited(client):
    for _ in range(20):
        assert client.post('/api/auth/login', json={'username': 'unknown', 'password': 'wrong'}).status_code == 401
    assert_error(client.post('/api/auth/login', json={'username': 'unknown', 'password': 'wrong'}), 429, 'RATE_LIMITED')


def test_cookie_cors_and_secure_configuration(client, settings):
    response = client.options('/api/auth/login', headers={'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-csrf-token'})
    assert response.status_code == 200
    assert response.headers['access-control-allow-credentials'] == 'true'
    settings.session_cookie_secure = True
    with TestClient(create_app(settings), base_url='https://testserver') as secure_client:
        assert 'Secure' in sign_in(secure_client).headers['set-cookie']


def test_legacy_identity_migration_preserves_posts_and_connections(settings):
    engine = make_engine(settings.database_url)
    with engine.begin() as db:
        db.execute(text('CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(120) NOT NULL, major VARCHAR(120), is_demo BOOLEAN NOT NULL, created_at DATETIME NOT NULL)'))
        for user_id, name in [(1, 'Rafi (demo)'), (2, 'Sarah (demo)'), (3, 'Alex (demo)')]:
            db.execute(text("INSERT INTO users VALUES (:id, :name, NULL, 1, '2026-10-03 00:00:00')"), {'id': user_id, 'name': name})
    Base.metadata.create_all(engine)
    with session_factory(engine).begin() as db:
        db.add_all([Post(id=1, user_id=1, category='STUDY', intent='REQUEST', title='Existing request', text='Synthetic SQL question', details={'topic':'SQL'}),
                    Post(id=2, user_id=2, category='STUDY', intent='OFFER', title='Existing offer', text='Synthetic SQL offer', details={'topic':'SQL'})])
        db.flush()
        db.add(Connection(id=1, requester_id=1, receiver_id=2, source_post_id=1, target_post_id=2, pair_low=1, pair_high=2))
    engine.dispose()
    with TestClient(create_app(settings)) as client:
        with client.app.state.session_factory() as db:
            assert 'is_demo' not in {column['name'] for column in inspect(db.bind).get_columns('users')}
            assert db.scalar(select(func.count()).select_from(User)) == 3
            assert db.scalar(select(func.count()).select_from(StudentAccount)) == 2
            assert db.get(User, 1).name == 'Rafi' and db.get(User, 2).name == 'Afsana'
            assert db.get(User, 3).name == 'Alex'
            assert db.get(Post, 1).user_id == 1 and db.get(Post, 2).user_id == 2
            assert db.get(Connection, 1).status == 'PENDING'
        session = sign_in(client, 'afsana').json()
        assert session['user']['id'] == 2
        assert client.get('/api/posts/2').json()['author']['name'] == 'Afsana'
