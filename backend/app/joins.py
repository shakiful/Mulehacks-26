"""Explicit requests to join one post, with no inferred counterpart post."""
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .errors import APIError
from .models import PostJoin
from . import notifications
from .posts import get_post
from .rides import attach_availability, begin_seat_transaction, seats_remaining


def get_join(db, user, join_id):
    item = db.get(PostJoin, join_id)
    if item is None:
        raise APIError(404, 'NOT_FOUND', 'Join request not found.')
    if user.id not in (item.requester_id, item.receiver_id):
        raise APIError(403, 'FORBIDDEN', 'Only participants can view this join request.')
    attach_availability(db, [item.post])
    return item


def list_joins(db, user, status):
    query = select(PostJoin).where(
        (PostJoin.requester_id == user.id) | (PostJoin.receiver_id == user.id))
    if status:
        query = query.where(PostJoin.status == status)
    items = db.scalars(query.order_by(PostJoin.created_at.desc(), PostJoin.id.desc())).all()
    attach_availability(db, list({item.post_id: item.post for item in items}.values()))
    return {'items': items}


def create_join(db, user, post_id, body):
    actor_id = user.id
    begin_seat_transaction(db)
    post = get_post(db, post_id)
    if post.user_id == actor_id:
        raise APIError(403, 'FORBIDDEN', 'You cannot join your own post.')
    if post.status != 'OPEN':
        raise APIError(409, 'CONFLICT', 'This post is closed.')
    ride_offer = post.category == 'RIDE' and post.intent == 'OFFER'
    if ride_offer and body.seats is None:
        raise APIError(422, 'VALIDATION_ERROR', 'Choose how many seats you need.')
    if not ride_offer and body.seats is not None:
        raise APIError(422, 'VALIDATION_ERROR', 'Seats are only requested when joining a ride offer.')
    if ride_offer and body.seats > seats_remaining(post):
        raise APIError(409, 'CONFLICT', 'This ride does not have enough remaining seats.')
    item = PostJoin(post_id=post.id, requester_id=actor_id, receiver_id=post.user_id,
                    category=post.category, post_intent=post.intent,
                    requested_seats=body.seats or 0)
    db.add(item)
    try:
        db.flush()
        notifications.request_event(db, item, 'JOIN_REQUEST')
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIError(409, 'DUPLICATE_JOIN', 'You already have a pending or accepted join for this post.')
    db.refresh(item)
    attach_availability(db, [item.post])
    return item


def transition(db, user, join_id, status):
    actor_id = user.id
    begin_seat_transaction(db)
    item = db.get(PostJoin, join_id)
    if item is None:
        raise APIError(404, 'NOT_FOUND', 'Join request not found.')
    allowed = item.requester_id if status == 'CANCELLED' else item.receiver_id
    if allowed != actor_id:
        raise APIError(403, 'FORBIDDEN', 'Authors accept or decline; joining students cancel.')
    if item.status != 'PENDING':
        raise APIError(409, 'CONFLICT', 'Only pending join requests can change status.')
    post = get_post(db, item.post_id)
    if status == 'ACCEPTED':
        if post.status != 'OPEN' or post.category != item.category or post.intent != item.post_intent:
            raise APIError(409, 'CONFLICT', 'This post is closed or its participation type has changed.')
        if post.category == 'RIDE':
            if post.intent == 'OFFER':
                remaining = seats_remaining(post) - item.requested_seats
                if remaining < 0:
                    raise APIError(409, 'CONFLICT', 'This ride no longer has enough remaining seats.')
                item.reserved_seats = item.requested_seats
                if remaining == 0:
                    post.status = 'COMPLETED'
            else:
                if post.ride_booked:
                    raise APIError(409, 'CONFLICT', 'This passenger request is already booked.')
                item.reserved_seats = post.details['seats']
                post.status = 'COMPLETED'
    item.status = status
    if status in ('ACCEPTED', 'DECLINED'):
        notifications.acknowledge_request(db, item)
    if status == 'ACCEPTED':
        notifications.request_event(db, item, 'JOIN_ACCEPTED')
    db.commit()
    db.refresh(item)
    attach_availability(db, [item.post])
    return item
