from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .errors import APIError
from .models import Post, User


def get_post(db: Session, post_id: int) -> Post:
    post = db.get(Post, post_id)
    if post is None:
        raise APIError(404, 'NOT_FOUND', 'Post not found.')
    return post


def create_post(db: Session, body, user: User) -> Post:
    post = Post(user_id=user.id, **body.model_dump())
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


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
    return post
