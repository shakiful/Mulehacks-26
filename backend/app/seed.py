"""Synthetic demo data only. Repeat safely; --refresh updates seed posts only."""
import argparse
from datetime import datetime, time
from zoneinfo import ZoneInfo

from pydantic import TypeAdapter
from sqlalchemy import select

from .config import Settings
from .database import make_engine, session_factory
from .models import Connection, Post
from .accounts import prepare_database, provision_accounts
from .schemas import PostCreate

# Explicit synthetic points; no user location is inferred.
DEMO_ROUTE = dict(origin_point={'lat': 38.7625, 'lng': -93.7395},
                  destination_point={'lat': 38.7905, 'lng': -93.7390})


def seed(settings: Settings, *, refresh: bool = False, reset_passwords: bool = False) -> dict:
    zone = ZoneInfo(settings.seed_timezone)
    day = settings.seed_date or datetime.now(zone).date()

    def at(hour, minute=0):
        return datetime.combine(day, time(hour, minute), tzinfo=zone)

    rows = [
        ('ride-sarah', 2, dict(category='RIDE', intent='OFFER', title='Walmart ride (synthetic demo)',
            text='Synthetic demo: offering a UCM to Walmart grocery ride.', starts_at=at(17, 45),
            details=dict(origin='UCM', destination='Walmart', seats=3, purpose='groceries', **DEMO_ROUTE))),
        ('ride-alex', 2, dict(category='RIDE', intent='OFFER', title='Later Walmart ride (synthetic demo)',
            text='Synthetic demo: offering a UCM to Walmart ride at 18:15.', starts_at=at(18, 15),
            details=dict(origin='UCM', destination='Walmart', seats=2, **DEMO_ROUTE))),
        ('sql-tutor', 2, dict(category='STUDY', intent='OFFER', title='Relational database tutoring (synthetic demo)',
            text='Synthetic demo: I can help with relational databases and SQL joins.', location='Library',
            starts_at=at(18), ends_at=at(19),
            details=dict(course='Databases', topic='SQL joins', skill_level='ADVANCED', mode='IN_PERSON'))),
        ('python-partner', 2, dict(category='STUDY', intent='PARTNER', title='Python partner (synthetic demo)',
            text='Synthetic demo: looking for a partner to study Python loops.', starts_at=at(19), ends_at=at(20),
            details=dict(course='Python', topic='loops', skill_level='BEGINNER', mode='ONLINE'))),
        ('food-group', 2, dict(category='RESTAURANT', intent='OFFER', title='Dinner group (synthetic demo)',
            text='Synthetic demo: join a pizza dinner group.', location='Campus', starts_at=at(19),
            details=dict(cuisine='Pizza', activity_type='DINING', group_size=4))),
        ('calculator', 2, dict(category='COMMUNITY', intent='OFFER', title='Calculator loan (synthetic demo)',
            text='Synthetic demo: I have a calculator you can borrow.',
            details=dict(subcategory='BORROW_LEND', item='calculator'))),
    ]
    engine = make_engine(settings.database_url)
    created = 0
    try:
        prepare_database(engine)
        with session_factory(engine).begin() as db:
            users = provision_accounts(db, settings, reset_passwords=reset_passwords)
            if len(users) != 2:
                raise ValueError('Set RAFI_LOGIN_PASSWORD and AFSANA_LOGIN_PASSWORD in backend/.env before seeding')
            for key, author, body in rows:
                values = TypeAdapter(PostCreate).validate_python(body).model_dump()
                existing = db.scalar(select(Post).where(Post.seed_key == key))
                if existing is None:
                    db.add(Post(user_id=author, seed_key=key, **values))
                    created += 1
                elif existing.category == 'RIDE':
                    existing.details = {**DEMO_ROUTE, **existing.details}
                    occupied = db.scalar(select(Connection.id).where(Connection.status == 'ACCEPTED',
                        (Connection.source_post_id == existing.id) | (Connection.target_post_id == existing.id)))
                    if refresh and occupied is None:
                        for field, value in values.items():
                            setattr(existing, field, value)
                        existing.status = 'OPEN'
                elif refresh:
                    for field, value in values.items():
                        setattr(existing, field, value)
                    existing.status = 'OPEN'
            db.flush()
    finally:
        engine.dispose()
    return {'created_posts': created, 'seed_date': day.isoformat(), 'test_accounts': len(users)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Reset only synthetic seed posts to current demo date and OPEN')
    parser.add_argument('--reset-passwords', action='store_true', help='Apply current local test-account passwords')
    args = parser.parse_args()
    print(seed(Settings(), refresh=args.refresh, reset_passwords=args.reset_passwords))


if __name__ == '__main__':
    main()
