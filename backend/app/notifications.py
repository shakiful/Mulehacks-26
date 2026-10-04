"""Atomic event creation and recipient-only in-app notification bookkeeping."""
from sqlalchemy import func, or_, select, update

from .database import utcnow
from .errors import APIError
from .models import Notification, Post, PostJoin


def request_event(db, item, kind):
    is_join = isinstance(item, PostJoin)
    accepted = kind.endswith('_ACCEPTED')
    post = db.get(Post, item.post_id if is_join else item.target_post_id)
    db.add(Notification(
        kind=kind, recipient_id=item.requester_id if accepted else item.receiver_id,
        actor_id=item.receiver_id if accepted else item.requester_id,
        post_title=post.title,
        **{('join_id' if is_join else 'connection_id'): item.id},
    ))


def message_event(db, thread, message):
    is_join = isinstance(thread, PostJoin)
    post = db.get(Post, thread.post_id if is_join else thread.target_post_id)
    db.add(Notification(
        kind='NEW_MESSAGE', message_id=message.id, actor_id=message.sender_id,
        recipient_id=thread.receiver_id if message.sender_id == thread.requester_id else thread.requester_id,
        post_title=post.title,
        **{('join_id' if is_join else 'connection_id'): thread.id},
    ))


def acknowledge_request(db, item):
    is_join = isinstance(item, PostJoin)
    column = Notification.join_id if is_join else Notification.connection_id
    db.execute(update(Notification).where(
        column == item.id, Notification.recipient_id == item.receiver_id,
        Notification.kind == ('JOIN_REQUEST' if is_join else 'CONNECTION_REQUEST'),
        Notification.read_at.is_(None),
    ).values(read_at=utcnow()))


def unread_count(db, user_id):
    return db.scalar(select(func.count()).select_from(Notification).where(
        Notification.recipient_id == user_id, Notification.read_at.is_(None)))


def list_notifications(db, user, limit, unread_only, before_id, after_id):
    if before_id is not None and after_id is not None:
        raise APIError(422, 'VALIDATION_ERROR', 'Use either before_id or after_id, not both.')
    query = select(Notification).where(Notification.recipient_id == user.id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    if before_id is not None:
        query = query.where(Notification.id < before_id)
    if after_id is not None:
        query = query.where(Notification.id > after_id)
    query = query.order_by(Notification.id.asc() if after_id is not None else Notification.id.desc())
    items = list(db.scalars(query.limit(limit + 1)).all())
    return {'items': items[:limit], 'has_more': len(items) > limit, 'unread_count': unread_count(db, user.id)}


def mark_read(db, user, notification_id):
    item = db.get(Notification, notification_id)
    if item is None:
        raise APIError(404, 'NOT_FOUND', 'Notification not found.')
    if item.recipient_id != user.id:
        raise APIError(403, 'FORBIDDEN', 'Only the recipient can read this notification.')
    if item.read_at is None:
        # Concurrent reads keep the first timestamp.
        db.execute(update(Notification).where(Notification.id == item.id, Notification.read_at.is_(None))
                   .values(read_at=utcnow()))
        db.commit()
        db.refresh(item)
    return item


def mark_through(db, user, through_id):
    db.execute(update(Notification).where(
        Notification.recipient_id == user.id, Notification.id <= through_id,
        Notification.read_at.is_(None),
    ).values(read_at=utcnow()))
    db.commit()
    return {'unread_count': unread_count(db, user.id)}


def mark_thread(db, user, body):
    # Local import avoids a cycle with message event creation.
    from .messages import get_thread
    get_thread(db, user, body.kind, body.thread_id)
    column = Notification.join_id if body.kind == 'join' else Notification.connection_id
    clauses = [Notification.kind.in_(('JOIN_ACCEPTED', 'CONNECTION_ACCEPTED'))]
    if body.through_message_id is not None:
        clauses.append((Notification.kind == 'NEW_MESSAGE') & (Notification.message_id <= body.through_message_id))
    db.execute(update(Notification).where(
        Notification.recipient_id == user.id, column == body.thread_id,
        Notification.read_at.is_(None), or_(*clauses),
    ).values(read_at=utcnow()))
    db.commit()
    return {'unread_count': unread_count(db, user.id)}
