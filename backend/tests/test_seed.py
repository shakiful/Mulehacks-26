from datetime import date, datetime, timezone

import pytest
from pydantic import SecretStr
from sqlalchemy import func, select, text

from backend.app.database import make_engine, session_factory
from backend.app.models import Post, User
from backend.app.seed import seed


def test_repeat_seed_preserves_created_and_edited_posts(settings):
    assert seed(settings)['created_posts'] == 6
    engine = make_engine(settings.database_url)
    with session_factory(engine).begin() as db:
        post = db.scalar(select(Post).where(Post.seed_key == 'calculator'))
        post.title = 'Edited synthetic offer'
        post.status = 'COMPLETED'
        db.add(Post(user_id=1, category='STUDY', intent='REQUEST', title='User created',
                    text='User-created synthetic post', details={'topic': 'SQL'}))
    assert seed(settings)['created_posts'] == 0
    with session_factory(engine)() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 2
        assert db.scalar(select(func.count()).select_from(Post)) == 7
        post = db.scalar(select(Post).where(Post.seed_key == 'calculator'))
        assert post.title == 'Edited synthetic offer' and post.status == 'COMPLETED'
    seed(settings, refresh=True)
    with session_factory(engine)() as db:
        assert db.scalar(select(func.count()).select_from(Post)) == 7
        assert db.scalar(select(Post).where(Post.seed_key.is_(None))).title == 'User created'
    engine.dispose()


def test_seed_date_refresh_and_utc_storage(settings):
    seed(settings)
    engine = make_engine(settings.database_url)
    with session_factory(engine)() as db:
        ride = db.scalar(select(Post).where(Post.seed_key == 'ride-sarah'))
        assert ride.starts_at == datetime(2026, 10, 3, 22, 45, tzinfo=timezone.utc)
        assert db.execute(text('PRAGMA foreign_keys')).scalar() == 1
    settings.seed_date = date(2026, 11, 15)
    assert seed(settings, refresh=True)['created_posts'] == 0
    with session_factory(engine)() as db:
        ride = db.scalar(select(Post).where(Post.seed_key == 'ride-sarah'))
        assert ride.starts_at == datetime(2026, 11, 15, 23, 45, tzinfo=timezone.utc)
        assert ride.status == 'OPEN'
    engine.dispose()


def test_conflicting_user_does_not_overwrite_or_partially_seed(settings):
    seed(settings)
    engine = make_engine(settings.database_url)
    with session_factory(engine).begin() as db:
        db.get(User, 2).name = 'Existing work'
    with pytest.raises(ValueError, match='conflicts'):
        seed(settings)
    with session_factory(engine)() as db:
        assert db.get(User, 2).name == 'Existing work'
        assert db.scalar(select(func.count()).select_from(Post)) == 6
    engine.dispose()


def test_missing_passwords_seed_refused(settings):
    settings.rafi_login_password = SecretStr('')
    settings.afsana_login_password = SecretStr('')
    with pytest.raises(ValueError, match='LOGIN_PASSWORD'):
        seed(settings)
