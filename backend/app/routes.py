from typing import Annotated

from fastapi import APIRouter, Path, Query, Request
from sqlalchemy import select

from . import posts
from .dependencies import CurrentUser, DB
from .errors import APIError
from .models import User
from .schemas import (
    Category, DemoUsers, Health, PostCreate, PostList, PostResponse, PostStatus, StatusUpdate,
)

router = APIRouter(prefix='/api')
PostId = Annotated[int, Path(ge=1)]


@router.get('/health', response_model=Health)
def health(request: Request):
    return Health(demo_mode=request.app.state.settings.demo_mode)


@router.get('/demo/users', response_model=DemoUsers)
def demo_users(request: Request, db: DB):
    if not request.app.state.settings.demo_mode:
        raise APIError(404, 'NOT_FOUND', 'Demo profiles are disabled.')
    return {'items': db.scalars(select(User).where(User.is_demo.is_(True)).order_by(User.id)).all()}


@router.post('/posts', response_model=PostResponse, status_code=201)
def create_post(body: PostCreate, db: DB, user: CurrentUser):
    return posts.create_post(db, body, user)


@router.get('/posts', response_model=PostList)
def list_posts(
    db: DB, user: CurrentUser,
    category: Category | None = None,
    status: PostStatus = 'OPEN',
    user_id: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return posts.list_posts(db, category=category, status=status, user_id=user_id, limit=limit, offset=offset)


@router.get('/posts/{post_id}', response_model=PostResponse)
def get_post(post_id: PostId, db: DB, user: CurrentUser):
    return posts.get_post(db, post_id)


@router.patch('/posts/{post_id}', response_model=PostResponse)
def update_status(post_id: PostId, body: StatusUpdate, db: DB, user: CurrentUser):
    return posts.close_post(db, post_id, body.status, user)
