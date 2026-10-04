from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, Response

from . import auth, connections, matching, posts
from .ai.understanding import UnderstandingService
from .dependencies import CurrentUser, DB
from .schemas import (
    Category, Health, LoginInput, SessionResponse, PostCreate, PostList, PostResponse, PostStatus, StatusUpdate,
    ConnectionInput, ConnectionList, ConnectionResponse, ConnectionStatus, ConnectionUpdate,
    MatchInput, MatchResponse, UnderstandInput, Understanding,
)

router = APIRouter(prefix='/api')
PostId = Annotated[int, Path(ge=1)]


@router.get('/health', response_model=Health)
def health(request: Request):
    return Health()


@router.post('/auth/login', response_model=SessionResponse)
def login(body: LoginInput, request: Request, response: Response, db: DB):
    return auth.login(db, request, response, body.username, body.password.get_secret_value())


@router.get('/auth/session', response_model=SessionResponse)
def session(request: Request, response: Response, db: DB):
    response.headers['Cache-Control'] = 'no-store'
    return auth.session_response(auth.authenticated(request, db))


@router.post('/auth/logout', response_model=SessionResponse)
def logout(request: Request, response: Response, db: DB):
    return auth.logout(db, request, response)


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


@router.put('/posts/{post_id}', response_model=PostResponse)
def edit_post(post_id: PostId, body: PostCreate, db: DB, user: CurrentUser):
    return posts.edit_post(db, post_id, body, user)


@router.patch('/posts/{post_id}', response_model=PostResponse)
def update_status(post_id: PostId, body: StatusUpdate, db: DB, user: CurrentUser):
    return posts.close_post(db, post_id, body.status, user)


@router.post('/understand', response_model=Understanding)
def understand(body: UnderstandInput, request: Request, user: CurrentUser):
    return UnderstandingService(request.app.state.settings).preview(body)


@router.post('/matches', response_model=MatchResponse)
def matches(body: MatchInput, request: Request, db: DB, user: CurrentUser):
    return matching.find_matches(db, user, body.post_id, body.limit, request.app.state.embeddings)


@router.post('/connections', response_model=ConnectionResponse, status_code=201)
def connect(body: ConnectionInput, db: DB, user: CurrentUser):
    return connections.create_connection(db, user, body)


@router.get('/connections', response_model=ConnectionList)
def inbox(db: DB, user: CurrentUser, status: ConnectionStatus | None = None):
    return connections.list_connections(db, user, status)


@router.patch('/connections/{connection_id}', response_model=ConnectionResponse)
def update_connection(connection_id: Annotated[int, Path(ge=1)], body: ConnectionUpdate, db: DB, user: CurrentUser):
    return connections.transition(db, user, connection_id, body.status)
