"""Synthetic server sessions for domain tests; real sign-in is tested separately."""
import secrets
from datetime import timedelta

from backend.app.auth import COOKIE_NAME, DUMMY_HASH, token_hash
from backend.app.database import utcnow
from backend.app.models import AuthSession, StudentAccount, User


def auth_headers(client, user_id=1):
    cached = getattr(client.app.state, 'test_auth_headers', {})
    if user_id not in cached:
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with client.app.state.session_factory.begin() as db:
            if db.get(User, user_id) is None:
                db.add(User(id=user_id, name=f'Synthetic student {user_id}'))
                db.flush()
            if db.get(StudentAccount, user_id) is None:
                db.add(StudentAccount(user_id=user_id, username=f'fixture_student_{user_id}', password_hash=DUMMY_HASH))
                db.flush()
            db.add(AuthSession(token_hash=token_hash(token), user_id=user_id, csrf_token=csrf,
                               expires_at=utcnow()+timedelta(hours=1)))
        cached[user_id] = {'Cookie': f'{COOKIE_NAME}={token}', 'X-CSRF-Token': csrf}
        client.app.state.test_auth_headers = cached
    return cached[user_id]
