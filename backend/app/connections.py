from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError

from .errors import APIError
from .matching import compatible
from .models import Connection, RideReservation
from .posts import get_post
from .rides import begin_seat_transaction, seats_remaining


def create_connection(db, user, body):
    source = get_post(db, body.source_post_id)
    if source.user_id != user.id:
        raise APIError(403, 'FORBIDDEN', 'Only the source author can request a connection.')
    target = get_post(db, body.target_post_id)
    if not compatible(source, target):
        raise APIError(400, 'INVALID_OPERATION', 'Posts must be OPEN, from different authors, and satisfy category compatibility constraints.')
    low, high = sorted((source.id, target.id))
    connection = Connection(requester_id=user.id, receiver_id=target.user_id,
        source_post_id=source.id, target_post_id=target.id, pair_low=low, pair_high=high)
    db.add(connection)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIError(409, 'CONFLICT', 'An active connection already exists for these posts.') from None
    db.refresh(connection)
    return connection


def list_connections(db, user, status=None):
    query = select(Connection).where(or_(Connection.requester_id == user.id, Connection.receiver_id == user.id))
    if status is not None:
        query = query.where(Connection.status == status)
    return {'items': db.scalars(query.order_by(Connection.created_at.desc(), Connection.id.desc())).all()}


def transition(db, user, connection_id, status):
    actor_id = user.id
    begin_seat_transaction(db)
    connection = db.get(Connection, connection_id)
    if connection is None:
        raise APIError(404, 'NOT_FOUND', 'Connection not found.')
    required_user = connection.requester_id if status == 'CANCELLED' else connection.receiver_id
    if actor_id != required_user:
        raise APIError(403, 'FORBIDDEN', 'Only the recipient can accept/decline, and only the requester can cancel.')
    if connection.status != 'PENDING':
        raise APIError(409, 'CONFLICT', 'This connection is already in a terminal state.')
    if status == 'ACCEPTED':
        source = get_post(db, connection.source_post_id)
        target = get_post(db, connection.target_post_id)
        if source.category == 'RIDE':
            if not compatible(source, target):
                raise APIError(409, 'CONFLICT', 'This ride is closed, already booked, or no longer has enough seats. Refresh the matches.')
            offer, request = (source, target) if source.intent == 'OFFER' else (target, source)
            remaining = seats_remaining(offer) - request.details['seats']
            connection.reservation = RideReservation(request_post_id=request.id,
                                                     offer_post_id=offer.id, seats=request.details['seats'])
            request.status = 'COMPLETED'
            if remaining == 0:
                offer.status = 'COMPLETED'
    result = db.execute(update(Connection).where(Connection.id == connection_id, Connection.status == 'PENDING').values(status=status))
    if result.rowcount != 1:
        db.rollback()
        raise APIError(409, 'CONFLICT', 'The connection state has changed.')
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIError(409, 'CONFLICT', 'This request already has a seat reservation.') from None
    db.refresh(connection)
    return connection
