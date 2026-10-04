"""Server-only Gemini transport. No redirects, raw error logging, or key in URLs."""
import json
import re
from urllib.request import HTTPRedirectHandler, Request, build_opener

MAX_RESPONSE_BYTES = 2_000_000


class GeminiUnavailable(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GeminiClient:
    def __init__(self, api_key, *, opener=None):
        self.api_key = api_key
        self.opener = opener or build_opener(NoRedirect()).open

    def post(self, model: str, method: str, body: dict, *, timeout: float) -> dict:
        try:
            if not self.api_key.get_secret_value() or not re.fullmatch(r'[a-zA-Z0-9._-]+', model):
                raise ValueError('Missing key or invalid model')
            if method not in ('generateContent', 'batchEmbedContents'):
                raise ValueError('Unsupported operation')
            request = Request(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:{method}',
                method='POST', data=json.dumps(body, allow_nan=False).encode(),
                headers={'Content-Type': 'application/json', 'x-goog-api-key': self.api_key.get_secret_value()})
            with self.opener(request, timeout=timeout) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise ValueError('Oversized provider response')
            result = json.loads(raw)
            if not isinstance(result, dict) or 'error' in result:
                raise ValueError('Invalid provider response')
            return result
        except Exception:
            raise GeminiUnavailable('Gemini provider is unavailable') from None
