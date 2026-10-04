import logging

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

logger = logging.getLogger(__name__)


class APIError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


def error_response(status, code, message, details=None, headers=None):
    return JSONResponse(
        status_code=status,
        content={'error': {'code': code, 'message': message, 'details': details or []}},
        headers=headers,
    )


def install_handlers(app):
    @app.exception_handler(APIError)
    async def api_error(request: Request, exc: APIError):
        return error_response(exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        details = []
        for error in exc.errors():
            # Remove transport and discriminated-union labels from UI field paths.
            location = [str(part) for part in error['loc'] if part not in (
                'body', 'query', 'path', 'header', 'RIDE', 'STUDY', 'RESTAURANT', 'COMMUNITY',
            )]
            details.append({'field': '.'.join(location) or 'body', 'message': error['msg']})
        return error_response(422, 'VALIDATION_ERROR', 'Correct the highlighted fields.', details)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        code = {
            400: 'INVALID_OPERATION', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN',
            404: 'NOT_FOUND', 405: 'METHOD_NOT_ALLOWED', 409: 'CONFLICT',
        }.get(exc.status_code, 'HTTP_ERROR')
        return error_response(exc.status_code, code, str(exc.detail), headers=exc.headers)

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        # Deliberately omit request body and exception contents from logs/output.
        logger.error('Unhandled API failure (%s)', type(exc).__name__)
        # ServerErrorMiddleware runs outside CORS; keep its response readable by
        # the configured frontend as well as regular handled error responses.
        headers = {}
        origin = request.headers.get('origin')
        if origin in request.app.state.settings.allowed_origins:
            headers = {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin'}
        return error_response(500, 'INTERNAL_ERROR', 'An unexpected error occurred.', headers=headers)
