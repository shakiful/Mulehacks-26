"""Password sign-in and revocable, cookie-based student sessions."""
import hashlib
import hmac
import secrets
from datetime import timedelta

from sqlalchemy import delete, select

from .database import utcnow
from .errors import APIError
from .models import AuthSession, StudentAccount, User

COOKIE_NAME = 'mulecampus_session'
PASSWORD_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, PASSWORD_ITERATIONS)
    return f'pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}'


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt, expected = encoded.split('$')
        if algorithm != 'pbkdf2_sha256' or int(rounds) != PASSWORD_ITERATIONS:
            return False
        digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


# Unknown usernames perform the same expensive check as incorrect passwords.
DUMMY_HASH = hash_password(secrets.token_urlsafe(32))


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def check_origin(request):
    origin = request.headers.get('origin')
    if origin is not None and origin not in request.app.state.settings.allowed_origins:
        raise APIError(403, 'FORBIDDEN', 'This request origin is not allowed.')


def authenticated(request, db):
    token = request.cookies.get(COOKIE_NAME)
    if not token or len(token) > 128:
        return None
    session = db.get(AuthSession, token_hash(token))
    if session is None or session.expires_at <= utcnow():
        return None
    account = db.get(StudentAccount, session.user_id)
    if account is None or not account.active:
        return None
    user = db.get(User, account.user_id)
    return (user, account, session) if user else None


def check_csrf(request, session):
    check_origin(request)
    provided = request.headers.get('X-CSRF-Token', '')
    if not hmac.compare_digest(provided.encode(), session.csrf_token.encode()):
        raise APIError(403, 'CSRF_REQUIRED', 'Your session changed. Refresh the page and try again.')


def session_response(identity):
    if identity is None:
        return {'user': None, 'csrf_token': None}
    user, account, session = identity
    return {'user': {'id': user.id, 'name': user.name, 'username': account.username},
            'csrf_token': session.csrf_token}


def login(db, request, response, username: str, password: str):
    check_origin(request)
    request.app.state.login_throttle.check(request.client.host if request.client else 'unknown')
    account = db.scalar(select(StudentAccount).where(StudentAccount.username == username.strip().casefold()))
    valid = verify_password(password, account.password_hash if account else DUMMY_HASH)
    if not valid or not account or not account.active:
        raise APIError(401, 'INVALID_CREDENTIALS', 'The username or password is incorrect.')
    old_token = request.cookies.get(COOKIE_NAME)
    if old_token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == token_hash(old_token)))
    token = secrets.token_urlsafe(32)
    settings = request.app.state.settings
    session = AuthSession(token_hash=token_hash(token), user_id=account.user_id,
                          csrf_token=secrets.token_urlsafe(32),
                          expires_at=utcnow() + timedelta(seconds=settings.session_lifetime_seconds))
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= utcnow()))
    db.add(session)
    db.commit()
    response.set_cookie(COOKIE_NAME, token, httponly=True, secure=settings.session_cookie_secure,
                        samesite='lax', path='/api', max_age=settings.session_lifetime_seconds)
    response.headers['Cache-Control'] = 'no-store'
    return session_response((db.get(User, account.user_id), account, session))


def logout(db, request, response):
    check_origin(request)
    identity = authenticated(request, db)
    if identity:
        check_csrf(request, identity[2])
        db.delete(identity[2])
        db.commit()
    response.delete_cookie(COOKIE_NAME, path='/api', httponly=True,
                           secure=request.app.state.settings.session_cookie_secure, samesite='lax')
    response.headers['Cache-Control'] = 'no-store'
    return session_response(None)
