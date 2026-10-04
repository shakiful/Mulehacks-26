from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .errors import APIError
from .models import Post, User
from .rides import attach_availability, begin_seat_transaction


def get_post(db: Session, post_id: int) -> Post:
    post = db.get(Post, post_id)
    if post is None:
        raise APIError(404, 'NOT_FOUND', 'Post not found.')
    return attach_availability(db, [post])[0]


def create_post(db: Session, body, user: User) -> Post:
    post = Post(user_id=user.id, **body.model_dump())
    db.add(post)
    db.commit()
    db.refresh(post)
    return attach_availability(db, [post])[0]


def list_posts(db: Session, *, category, status, user_id, limit, offset):
    filters = [Post.status == status]
    if category is not None:
        filters.append(Post.category == category)
    if user_id is not None:
        filters.append(Post.user_id == user_id)
    total = db.scalar(select(func.count()).select_from(Post).where(*filters))
    items = db.scalars(
        select(Post).where(*filters).order_by(Post.created_at.desc(), Post.id.desc())
        .limit(limit).offset(offset)
    ).all()
    attach_availability(db, items)
    return {'items': items, 'total': total, 'limit': limit, 'offset': offset}


def close_post(db: Session, post_id: int, status: str, user: User) -> Post:
    post = get_post(db, post_id)
    if post.user_id != user.id:
        raise APIError(403, 'FORBIDDEN', 'Only the author can update this post.')
    if post.status != 'OPEN':
        raise APIError(409, 'CONFLICT', 'This post is already closed.')
    # The OPEN predicate prevents concurrent requests from overwriting a closure.
    result = db.execute(
        update(Post).where(Post.id == post_id, Post.status == 'OPEN').values(status=status),
    )
    if result.rowcount != 1:
        db.rollback()
        raise APIError(409, 'CONFLICT', 'This post is already closed.')
    db.commit()
    db.refresh(post)
    return attach_availability(db, [post])[0]


def edit_post(db: Session, post_id: int, body, user: User) -> Post:
    actor_id = user.id
    post = get_post(db, post_id)
    if post.category == 'RIDE':
        # Serialize edits with seat acceptance; re-read after acquiring the lock.
        begin_seat_transaction(db)
        post = get_post(db, post_id)
    if post.user_id != actor_id:
        raise APIError(403, 'FORBIDDEN', 'Only the author can edit this post.')
    if post.status != 'OPEN':
        raise APIError(409, 'CONFLICT', 'Only open posts can be edited.')
    if body.category != post.category:
        raise APIError(400, 'INVALID_OPERATION', 'The category of an existing post cannot change.')
    values = body.model_dump()
    if post.category == 'RIDE':
        if post.ride_booked:
            raise APIError(409, 'CONFLICT', 'A booked passenger request cannot be edited.')
        reserved = (post.ride_availability or {}).get('reserved_seats', 0)
        if reserved:
            route_fields = ('origin', 'destination', 'origin_point', 'destination_point')
            if (body.intent != post.intent or body.starts_at != post.starts_at or body.ends_at != post.ends_at
                    or any(values['details'].get(f) != post.details.get(f) for f in route_fields)):
                raise APIError(409, 'CONFLICT', 'The route, time and offer type cannot change after passengers are accepted.')
            if values['details']['seats'] < reserved:
                raise APIError(409, 'CONFLICT', 'Capacity cannot be less than the seats already reserved.')
            if values['details']['seats'] == reserved:
                values['status'] = 'COMPLETED'
    # Keep ownership/status/creation metadata and protect against concurrent closure.
    result = db.execute(update(Post).where(
        Post.id == post_id, Post.user_id == actor_id,
        Post.status == 'OPEN', Post.category == body.category,
    ).values(**values))
    if result.rowcount != 1:
        db.rollback()
        raise APIError(409, 'CONFLICT', 'This post is no longer open for editing.')
    db.commit()
    db.refresh(post)
    return attach_availability(db, [post])[0]
