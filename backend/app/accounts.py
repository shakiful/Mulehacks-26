"""Provision the requested local test accounts without deleting saved records."""
from collections import deque
from threading import Lock
from time import monotonic

from sqlalchemy import inspect, select, text

from .auth import hash_password
from .database import Base
from .errors import APIError
from .models import StudentAccount, User


def prepare_database(engine):
    Base.metadata.create_all(engine)
    if engine.dialect.name == 'sqlite':
        with engine.begin() as connection:
            columns = {column['name'] for column in inspect(connection).get_columns('users')}
            if 'is_demo' in columns:
                connection.execute(text("UPDATE users SET name = replace(name, ' (demo)', '') WHERE is_demo = 1"))
                connection.exec_driver_sql('ALTER TABLE users DROP COLUMN is_demo')


def provision_accounts(db, settings, *, reset_passwords=False):
    requested = [('rafi', 'Rafi', 1, {'Rafi', 'Rafi (demo)'}, settings.rafi_login_password),
                 ('afsana', 'Afsana', 2, {'Sarah', 'Sarah (demo)', 'Afsana'}, settings.afsana_login_password)]
    users = {}
    for username, name, legacy_id, legacy_names, secret in requested:
        account = db.scalar(select(StudentAccount).where(StudentAccount.username == username))
        password = secret.get_secret_value()
        if account:
            user = db.get(User, account.user_id)
            if user is None or user.name != name:
                raise ValueError(f'Account {username} conflicts with existing profile data; no data changed')
            if reset_passwords:
                if len(password) < 10:
                    raise ValueError(f'Set a password of at least 10 characters for {username} in backend/.env')
                account.password_hash = hash_password(password)
            users[username] = user
            continue
        if not password:
            continue
        if len(password) < 10:
            raise ValueError(f'Set a password of at least 10 characters for {username} in backend/.env')
        user = db.get(User, legacy_id)
        if user and user.name not in legacy_names:
            raise ValueError(f'User {legacy_id} conflicts with the requested test account; existing data preserved')
        if user is None:
            user = User(id=legacy_id, name=name)
            db.add(user)
        user.name = name
        db.flush()
        db.add(StudentAccount(user_id=user.id, username=username, password_hash=hash_password(password)))
        users[username] = user
    db.flush()
    return users


class LoginThrottle:
    def __init__(self):
        self.attempts = {}
        self.lock = Lock()

    def check(self, key):
        now = monotonic()
        with self.lock:
            # Prune stale buckets so arbitrary clients cannot grow this map forever.
            self.attempts = {ip: attempts for ip, attempts in self.attempts.items()
                             if attempts and attempts[-1] > now - 60}
            attempts = self.attempts.setdefault(key, deque())
            while attempts and attempts[0] <= now - 60:
                attempts.popleft()
            if len(attempts) >= 20:
                raise APIError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Wait a minute and try again.')
            attempts.append(now)
