from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, Response

from . import auth, connections, joins, matching, messages, notifications, posts
from .ai.understanding import UnderstandingService
from .dependencies import CurrentUser, DB
from .schemas import (
    Category, Health, LoginInput, SessionResponse, PostCreate, PostList, PostResponse, PostStatus, StatusUpdate,
    ConnectionInput, ConnectionList, ConnectionResponse, ConnectionStatus, ConnectionUpdate,
    MatchInput, MatchResponse, UnderstandInput, Understanding,
    SecurityInput, SecurityResult, DiningMenus,
    JoinInput, JoinList, JoinResponse, MessageInput, MessageList, MessageResponse,
    NotificationList, NotificationResponse, NotificationRead, NotificationReadThrough, NotificationThreadRead, UnreadCount,
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


@router.get('/dining/menus', response_model=DiningMenus)
def dining_menus(request: Request, response: Response):
    # Public campus information; no identity, submitted URLs or database reads.
    response.headers['Cache-Control'] = 'no-store'
    return request.app.state.dining.today()


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


@router.post('/posts/{post_id}/join', response_model=JoinResponse, status_code=201)
def join_post(post_id: PostId, body: JoinInput, db: DB, user: CurrentUser, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return joins.create_join(db, user, post_id, body)


@router.get('/joins', response_model=JoinList)
def join_inbox(db: DB, user: CurrentUser, response: Response, status: ConnectionStatus | None = None):
    response.headers['Cache-Control'] = 'no-store'
    return joins.list_joins(db, user, status)


@router.get('/joins/{join_id}', response_model=JoinResponse)
def get_join(join_id: PostId, db: DB, user: CurrentUser, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return joins.get_join(db, user, join_id)


@router.patch('/joins/{join_id}', response_model=JoinResponse)
def update_join(join_id: PostId, body: ConnectionUpdate, db: DB, user: CurrentUser, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return joins.transition(db, user, join_id, body.status)


@router.post('/matches', response_model=MatchResponse)
def matches(body: MatchInput, request: Request, db: DB, user: CurrentUser):
    return matching.find_matches(db, user, body.post_id, body.limit, request.app.state.embeddings)


@router.post('/connections', response_model=ConnectionResponse, status_code=201)
def connect(body: ConnectionInput, db: DB, user: CurrentUser):
    return connections.create_connection(db, user, body)


@router.get('/connections', response_model=ConnectionList)
def inbox(db: DB, user: CurrentUser, status: ConnectionStatus | None = None):
    return connections.list_connections(db, user, status)


@router.get('/connections/{connection_id}', response_model=ConnectionResponse)
def get_connection(connection_id: PostId, db: DB, user: CurrentUser, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return messages.get_connection(db, user, connection_id)


@router.patch('/connections/{connection_id}', response_model=ConnectionResponse)
def update_connection(connection_id: Annotated[int, Path(ge=1)], body: ConnectionUpdate, db: DB, user: CurrentUser):
    return connections.transition(db, user, connection_id, body.status)


# Both thread types share the same authorization, pagination and message service.
def message_routes(prefix, kind):
    @router.get(prefix + '/{thread_id}/messages', response_model=MessageList)
    def list_thread_messages(
        thread_id: PostId, db: DB, user: CurrentUser, response: Response,
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        before_id: Annotated[int | None, Query(ge=1)] = None,
        after_id: Annotated[int | None, Query(ge=1)] = None,
    ):
        response.headers['Cache-Control'] = 'no-store'
        return messages.list_messages(db, user, kind, thread_id, limit, before_id, after_id)

    @router.post(prefix + '/{thread_id}/messages', response_model=MessageResponse, status_code=201)
    def send_thread_message(thread_id: PostId, body: MessageInput, db: DB, user: CurrentUser, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        return messages.send_message(db, user, kind, thread_id, body)


message_routes('/connections', 'connection')
message_routes('/joins', 'join')


@router.get('/notifications', response_model=NotificationList)
def notification_inbox(
    db: DB, user: CurrentUser, response: Response,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    unread_only: bool = False,
    before_id: Annotated[int | None, Query(ge=1)] = None,
    after_id: Annotated[int | None, Query(ge=0)] = None,
):
    response.headers['Cache-Control'] = 'no-store'
    return notifications.list_notifications(db, user, limit, unread_only, before_id, after_id)


@router.patch('/notifications/{notification_id}', response_model=NotificationResponse)
def read_notification(notification_id: PostId, body: NotificationRead, db: DB, user: CurrentUser, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return notifications.mark_read(db, user, notification_id)


@router.post('/notifications/read', response_model=UnreadCount)
def read_notifications(body: NotificationReadThrough, db: DB, user: CurrentUser, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return notifications.mark_through(db, user, body.through_id)


@router.post('/notifications/read-thread', response_model=UnreadCount)
def read_thread_notifications(body: NotificationThreadRead, db: DB, user: CurrentUser, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return notifications.mark_thread(db, user, body)


@router.post('/security/analyze', response_model=SecurityResult)
def analyze_security(body: SecurityInput, request: Request, response: Response, user: CurrentUser):
    response.headers['Cache-Control'] = 'no-store'
    return request.app.state.security.analyze(body)
