import re
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from .errors import APIError
from .models import User


def get_db(request: Request):
    with request.app.state.session_factory() as session:
        yield session


DB = Annotated[Session, Depends(get_db)]


def demo_user(
    request: Request, db: DB,
    identity: Annotated[str | None, Header(alias='X-Demo-User-Id')] = None,
) -> User:
    if not request.app.state.settings.demo_mode:
        raise APIError(401, 'UNAUTHORIZED', 'Demo identity is disabled; authentication is unavailable.')
    if identity is None or not re.fullmatch(r'[1-9][0-9]*', identity) or len(identity) > 10:
        raise APIError(401, 'UNAUTHORIZED', 'Select an existing synthetic demo profile.')
    user = db.get(User, int(identity))
    if user is None or not user.is_demo:
        raise APIError(401, 'UNAUTHORIZED', 'Select an existing synthetic demo profile.')
    return user


CurrentUser = Annotated[User, Depends(demo_user)]
