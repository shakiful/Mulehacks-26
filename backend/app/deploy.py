"""Validated, single-process entry point for the hosted SQLite backend."""
import os
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError
from pydantic import ValidationError
import uvicorn

from .config import ROOT, Settings


def validate_deployment(settings: Settings, port: str = '10000') -> int:
    if not settings.session_cookie_secure:
        raise ValueError('Set SESSION_COOKIE_SECURE=true for the HTTPS deployment.')
    for secret in (settings.rafi_login_password, settings.afsana_login_password):
        if len(secret.get_secret_value()) < 10:
            raise ValueError('Set both RAFI_LOGIN_PASSWORD and AFSANA_LOGIN_PASSWORD to private passwords of at least 10 characters.')
    if not settings.allowed_origins:
        raise ValueError('Set CORS_ORIGINS to the exact HTTPS Netlify site origin.')
    for origin in settings.allowed_origins:
        url = urlsplit(origin)
        if (url.scheme != 'https' or not url.hostname or url.username or url.password or
                url.path or url.query or url.fragment or '*' in origin or
                url.hostname in ('localhost', '127.0.0.1', '::1')):
            raise ValueError('CORS_ORIGINS must contain exact HTTPS site origins, without paths or wildcards.')
    try:
        url = make_url(settings.database_url)
    except ArgumentError:
        raise ValueError('DATABASE_URL must be a valid SQLite URL on the persistent disk.') from None
    path = Path(url.database or '')
    if (url.drivername != 'sqlite' or not path.is_absolute() or
            path.resolve().is_relative_to(ROOT) or not path.parent.is_dir()):
        raise ValueError('DATABASE_URL must use an absolute SQLite path on an attached persistent disk outside the source directory.')
    if settings.ai_timeout_seconds > 20 or settings.embedding_timeout_seconds > 10:
        raise ValueError('Use AI_TIMEOUT_SECONDS<=20 and EMBEDDING_TIMEOUT_SECONDS<=10 to leave time within the Netlify proxy deadline.')
    if not port.isascii() or not port.isdecimal() or not 1 <= int(port) <= 65535:
        raise ValueError('PORT must be an integer between 1 and 65535.')
    return int(port)


def main():
    # Hosting secrets come only from the service environment, never laptop .env files.
    try:
        settings = Settings(_env_file=None)
        port = validate_deployment(settings, os.environ.get('PORT', '10000'))
    except ValidationError:
        raise SystemExit('Invalid service environment. Check the settings types and explicit CORS origins; values are not logged.') from None
    except ValueError as error:
        raise SystemExit(str(error)) from None
    from .main import create_app
    # One worker preserves the in-process login limiter and SQLite reservation locks.
    # The platform terminates HTTPS; never trust arbitrary client forwarding headers.
    uvicorn.run(create_app(settings), host='0.0.0.0', port=port, workers=1, proxy_headers=False)


if __name__ == '__main__':
    main()
