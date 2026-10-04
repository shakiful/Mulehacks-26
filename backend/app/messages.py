"""Participant-only, plain-text conversations for accepted joins/connections."""
from sqlalchemy import select

from .errors import APIError
from .models import Connection, Message, PostJoin
from . import notifications


def get_connection(db, user, connection_id):
    return get_thread(db, user, 'connection', connection_id, accepted=False)


def get_thread(db, user, kind, thread_id, *, accepted=True):
    model = Connection if kind == 'connection' else PostJoin
    thread = db.get(model, thread_id)
    if thread is None:
        raise APIError(404, 'NOT_FOUND', 'Conversation not found.')
    if user.id not in (thread.requester_id, thread.receiver_id):
        raise APIError(403, 'FORBIDDEN', 'Only participants can access this conversation.')
    if accepted and thread.status != 'ACCEPTED':
        raise APIError(409, 'CONFLICT', 'Messaging is available after the request is accepted.')
    return thread


def list_messages(db, user, kind, thread_id, limit, before_id, after_id):
    get_thread(db, user, kind, thread_id)
    if before_id is not None and after_id is not None:
        raise APIError(422, 'VALIDATION_ERROR', 'Use either before_id or after_id, not both.')
    column = Message.connection_id if kind == 'connection' else Message.join_id
    query = select(Message).where(column == thread_id)
    if before_id is not None:
        query = query.where(Message.id < before_id)
    if after_id is not None:
        query = query.where(Message.id > after_id)
    query = query.order_by(Message.id.asc() if after_id is not None else Message.id.desc())
    items = list(db.scalars(query.limit(limit + 1)).all())
    more = len(items) > limit
    items = items[:limit]
    if after_id is None:
        items.reverse()
    return {'items': items, 'has_more': more}


def send_message(db, user, kind, thread_id, body):
    thread = get_thread(db, user, kind, thread_id)
    item = Message(sender_id=user.id, text=body.text,
                   **{('connection_id' if kind == 'connection' else 'join_id'): thread_id})
    db.add(item)
    db.flush()
    notifications.message_event(db, thread, item)
    db.commit()
    db.refresh(item)
    return item
