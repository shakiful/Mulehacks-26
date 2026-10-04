"""Map-based ride compatibility and persisted seat reservations."""
from math import asin, cos, isfinite, radians, sin, sqrt

from sqlalchemy import func, select, text

from .models import Connection, Post, RideReservation

MAX_DISTANCE_KM = 5.0
KM_PER_MILE = 1.609344


def point(details, field):
    value = details.get(field)
    if not isinstance(value, dict):
        return None
    lat, lng = value.get('lat'), value.get('lng')
    if any(isinstance(n, bool) or not isinstance(n, (int, float)) or not isfinite(n) for n in (lat, lng)):
        return None
    return value if -90 <= lat <= 90 and -180 <= lng <= 180 else None


def distance_km(a, b):
    """Haversine distance, not a road distance or driving-time estimate."""
    lat1, lat2 = radians(a['lat']), radians(b['lat'])
    delta_lat = lat2 - lat1
    delta_lng = radians(b['lng'] - a['lng'])
    h = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lng / 2) ** 2
    return 6371.0088 * 2 * asin(sqrt(min(1, max(0, h))))


def route_distances(source, target):
    pairs = [(point(source.details, f), point(target.details, f))
             for f in ('origin_point', 'destination_point')]
    if any(a is None or b is None for a, b in pairs):
        return None
    return tuple(distance_km(a, b) for a, b in pairs)


def attach_availability(db, posts):
    """Batch capacity lookup; computed fields never modify persisted details."""
    ids = [post.id for post in posts if post.category == 'RIDE']
    totals = dict(db.execute(select(RideReservation.offer_post_id, func.sum(RideReservation.seats))
                  .where(RideReservation.offer_post_id.in_(ids)).group_by(RideReservation.offer_post_id)).all()) if ids else {}
    booked = set(db.scalars(select(RideReservation.request_post_id)
                 .where(RideReservation.request_post_id.in_(ids))).all()) if ids else set()
    for post in posts:
        post.ride_booked = post.id in booked
        post.ride_availability = None
        if post.category == 'RIDE' and post.intent == 'OFFER':
            total = post.details.get('seats', 0)
            reserved = totals.get(post.id, 0)
            post.ride_availability = dict(total_seats=total, reserved_seats=reserved,
                                          remaining_seats=max(0, total - reserved))
    return posts


def seats_remaining(offer):
    availability = getattr(offer, 'ride_availability', None)
    return availability['remaining_seats'] if availability else offer.details.get('seats', 0)


def begin_seat_transaction(db):
    # Authentication has already read in this session. Start a fresh write lock
    # before re-reading state/capacity, so simultaneous acceptances cannot oversell.
    db.rollback()
    db.execute(text('BEGIN IMMEDIATE'))


def backfill_reservations(db):
    """Count older accepted rides too, without changing posts or connections."""
    begin_seat_transaction(db)
    connections = db.scalars(select(Connection).where(Connection.status == 'ACCEPTED')
                            .order_by(Connection.id)).all()
    for connection in connections:
        if connection.reservation is not None:
            continue
        a, b = db.get(Post, connection.source_post_id), db.get(Post, connection.target_post_id)
        if a.category != 'RIDE' or b.category != 'RIDE' or {a.intent, b.intent} != {'REQUEST', 'OFFER'}:
            continue
        offer, request = (a, b) if a.intent == 'OFFER' else (b, a)
        # Old data allowed a request to accept several offers. Preserve records;
        # count its earliest accepted booking once rather than inventing riders.
        if db.scalar(select(RideReservation).where(RideReservation.request_post_id == request.id)) is None:
            connection.reservation = RideReservation(request_post_id=request.id,
                                                     offer_post_id=offer.id, seats=request.details['seats'])
    db.commit()
