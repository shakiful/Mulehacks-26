"""Synthetic demo data only. Repeat safely; --refresh updates seed posts only."""
import argparse
from datetime import datetime, time
from zoneinfo import ZoneInfo

from pydantic import TypeAdapter
from sqlalchemy import select

from .config import Settings
from .database import Base, make_engine, session_factory
from .models import Post, User
from .schemas import PostCreate

USERS = [(1, 'Rafi (demo)'), (2, 'Sarah (demo)'), (3, 'Alex (demo)'), (4, 'Jamie (demo)')]


def seed(settings: Settings, *, refresh: bool = False) -> dict:
    if not settings.demo_mode:
        raise ValueError('Seeding requires DEMO_MODE=true')
    zone = ZoneInfo(settings.demo_timezone)
    day = settings.demo_date or datetime.now(zone).date()

    def at(hour, minute=0):
        return datetime.combine(day, time(hour, minute), tzinfo=zone)

    rows = [
        ('ride-sarah', 2, dict(category='RIDE', intent='OFFER', title='Walmart ride (synthetic demo)',
            text='Synthetic demo: offering a UCM to Walmart grocery ride.', starts_at=at(17, 45),
            details=dict(origin='UCM', destination='Walmart', seats=3, purpose='groceries'))),
        ('ride-alex', 3, dict(category='RIDE', intent='OFFER', title='Later Walmart ride (synthetic demo)',
            text='Synthetic demo: offering a UCM to Walmart ride at 18:15.', starts_at=at(18, 15),
            details=dict(origin='UCM', destination='Walmart', seats=2))),
        ('sql-tutor', 2, dict(category='STUDY', intent='OFFER', title='Relational database tutoring (synthetic demo)',
            text='Synthetic demo: I can help with relational databases and SQL joins.', location='Library',
            starts_at=at(18), ends_at=at(19),
            details=dict(course='Databases', topic='SQL joins', skill_level='ADVANCED', mode='IN_PERSON'))),
        ('python-partner', 3, dict(category='STUDY', intent='PARTNER', title='Python partner (synthetic demo)',
            text='Synthetic demo: looking for a partner to study Python loops.', starts_at=at(19), ends_at=at(20),
            details=dict(course='Python', topic='loops', skill_level='BEGINNER', mode='ONLINE'))),
        ('food-group', 4, dict(category='RESTAURANT', intent='OFFER', title='Dinner group (synthetic demo)',
            text='Synthetic demo: join a pizza dinner group.', location='Campus', starts_at=at(19),
            details=dict(cuisine='Pizza', activity_type='DINING', group_size=4))),
        ('calculator', 4, dict(category='COMMUNITY', intent='OFFER', title='Calculator loan (synthetic demo)',
            text='Synthetic demo: I have a calculator you can borrow.',
            details=dict(subcategory='BORROW_LEND', item='calculator'))),
    ]
    engine = make_engine(settings.database_url)
    created = 0
    try:
        Base.metadata.create_all(engine)
        with session_factory(engine).begin() as db:
            for user_id, name in USERS:
                existing = db.get(User, user_id)
                if existing is None:
                    db.add(User(id=user_id, name=name, is_demo=True))
                elif not existing.is_demo or existing.name != name:
                    raise ValueError(f'User {user_id} conflicts with a synthetic demo identity; no data changed')
            db.flush()
            for key, author, body in rows:
                values = TypeAdapter(PostCreate).validate_python(body).model_dump()
                existing = db.scalar(select(Post).where(Post.seed_key == key))
                if existing is None:
                    db.add(Post(user_id=author, seed_key=key, **values))
                    created += 1
                elif refresh:
                    for field, value in values.items():
                        setattr(existing, field, value)
                    existing.status = 'OPEN'
            db.flush()
    finally:
        engine.dispose()
    return {'created_posts': created, 'demo_date': day.isoformat(), 'synthetic_users': len(USERS)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Reset only synthetic seed posts to current demo date and OPEN')
    args = parser.parse_args()
    print(seed(Settings(), refresh=args.refresh))


if __name__ == '__main__':
    main()
