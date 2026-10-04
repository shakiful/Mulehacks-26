from datetime import datetime, timezone

from sqlalchemy import DateTime, create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    """SQLite stores naive UTC; all Python/API values are timezone-aware."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError('Timezone-aware datetime required')
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value is not None else None


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def make_engine(url: str):
    options = {}
    if url.startswith('sqlite:'):
        options['connect_args'] = {'check_same_thread': False}
        if url in ('sqlite://', 'sqlite:///:memory:'):
            options['poolclass'] = StaticPool
    engine = create_engine(url, **options)
    if engine.dialect.name == 'sqlite':
        @event.listens_for(engine, 'connect')
        def enable_foreign_keys(connection, _):
            cursor = connection.cursor()
            cursor.execute('PRAGMA foreign_keys=ON')
            cursor.close()
    return engine


def session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)
