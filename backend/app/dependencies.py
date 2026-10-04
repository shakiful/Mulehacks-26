from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .errors import APIError
from .models import User
from .auth import authenticated, check_csrf


def get_db(request: Request):
    with request.app.state.session_factory() as session:
        yield session


DB = Annotated[Session, Depends(get_db)]


def current_user(request: Request, db: DB) -> User:
    identity = authenticated(request, db)
    if identity is None:
        raise APIError(401, 'UNAUTHORIZED', 'Sign in to continue.')
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        check_csrf(request, identity[2])
    return identity[0]


CurrentUser = Annotated[User, Depends(current_user)]
