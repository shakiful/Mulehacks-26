from fastapi.middleware.cors import CORSMiddleware

from .errors import error_response


class APICORSMiddleware(CORSMiddleware):
    """Keep rejected browser preflights in the API's standard error envelope."""

    def preflight_response(self, request_headers):
        response = super().preflight_response(request_headers)
        if response.status_code >= 400:
            headers = dict(response.headers)
            headers.pop('content-length', None)
            headers.pop('content-type', None)
            return error_response(
                response.status_code, 'INVALID_OPERATION',
                'CORS origin, method or headers are not allowed.', headers=headers,
            )
        return response
