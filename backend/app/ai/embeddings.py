"""Versioned public-post embeddings; no private previews are embedded or stored."""
import argparse
import hashlib
import json
import math
from dataclasses import dataclass, field
from typing import Protocol
from urllib.request import HTTPRedirectHandler, Request, build_opener

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert

from ..config import Settings
from ..database import Base, make_engine, session_factory, utcnow
from ..errors import APIError
from ..models import Post, PostEmbedding

INPUT_VERSION = 'title-text-v1'
BATCH_SIZE = 16
MAX_RESPONSE_BYTES = 2_000_000


class EmbeddingUnavailable(Exception):
    pass


@dataclass(frozen=True)
class EmbeddingSpec:
    provider: str
    model: str
    dimensions: int
    input_version: str = INPUT_VERSION


class EmbeddingProvider(Protocol):
    spec: EmbeddingSpec

    def embed(self, texts: list[str]) -> list[list[float]]: ...


def embedding_text(post: Post) -> str:
    # Keep the semantic input consistent with the documented title/text component.
    return post.title.strip() + '\n' + post.text.strip()


def fingerprint(post: Post) -> str:
    return hashlib.sha256(embedding_text(post).encode('utf-8')).hexdigest()


def validate_vector(vector, dimensions: int) -> list[float]:
    if not isinstance(vector, list) or len(vector) != dimensions:
        raise ValueError('Invalid embedding dimensions')
    if any(type(value) not in (int, float) or not math.isfinite(value) for value in vector):
        raise ValueError('Embedding must contain finite numbers')
    norm = math.hypot(*vector)
    if not math.isfinite(norm) or norm == 0:
        raise ValueError('Invalid embedding norm')
    return [float(value) for value in vector]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        raise ValueError('Cannot compare different embedding dimensions')
    a = validate_vector(left, len(left))
    b = validate_vector(right, len(right))
    a_norm, b_norm = math.hypot(*a), math.hypot(*b)
    value = math.fsum((x / a_norm) * (y / b_norm) for x, y in zip(a, b))
    return max(0.0, min(1.0, value))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class OpenAIEmbeddingProvider:
    def __init__(self, settings: Settings, opener=None):
        self.spec = EmbeddingSpec('openai', settings.embedding_model, settings.embedding_dimensions)
        self.api_key = settings.openai_api_key
        self.timeout = settings.embedding_timeout_seconds
        self.opener = opener or build_opener(NoRedirect()).open

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not self.api_key.get_secret_value():
            raise EmbeddingUnavailable('Embedding provider is unavailable')
        request = Request('https://api.openai.com/v1/embeddings', method='POST',
            data=json.dumps({'model': self.spec.model, 'input': texts,
                             'encoding_format': 'float', 'dimensions': self.spec.dimensions}).encode(),
            headers={'Content-Type': 'application/json',
                     'Authorization': 'Bearer ' + self.api_key.get_secret_value()})
        try:
            with self.opener(request, timeout=self.timeout) as response:
                data = response.read(MAX_RESPONSE_BYTES + 1)
            if len(data) > MAX_RESPONSE_BYTES:
                raise ValueError('Oversized embedding response')
            body = json.loads(data)
            if body.get('model') != self.spec.model or len(body['data']) != len(texts):
                raise ValueError('Unexpected embedding model or count')
            vectors = {}
            for item in body['data']:
                index = item['index']
                if type(index) is not int or not 0 <= index < len(texts) or index in vectors:
                    raise ValueError('Invalid embedding index')
                vectors[index] = validate_vector(item['embedding'], self.spec.dimensions)
            return [vectors[index] for index in range(len(texts))]
        except Exception:
            # Never propagate provider response bodies, input text, or credentials.
            raise EmbeddingUnavailable('Embedding provider is unavailable') from None


@dataclass
class EmbeddingResult:
    mode: str = 'HEURISTIC'
    vectors: dict[int, list[float]] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


class EmbeddingService:
    def __init__(self, settings: Settings, provider: EmbeddingProvider | None = None):
        self.settings = settings
        self.provider = provider
        if provider is None and settings.embedding_provider == 'openai':
            self.provider = OpenAIEmbeddingProvider(settings)

    def prepare(self, db, posts: list[Post], *, refresh=False) -> EmbeddingResult:
        if not posts or (self.provider is None and self.settings.embedding_provider == 'heuristic'):
            return EmbeddingResult()
        try:
            if self.provider is None:
                raise EmbeddingUnavailable('No embedding provider configured')
            spec = self.provider.spec
            ids = [post.id for post in posts]
            stored = {row.post_id: row for row in db.scalars(select(PostEmbedding).where(PostEmbedding.post_id.in_(ids))
                      .execution_options(populate_existing=True))}
            vectors, missing = {}, []
            for post in posts:
                row = stored.get(post.id)
                valid_metadata = row is not None and (
                    row.provider, row.model, row.dimensions, row.input_version, row.input_hash
                ) == (spec.provider, spec.model, spec.dimensions, spec.input_version, fingerprint(post))
                if valid_metadata and not refresh:
                    try:
                        vectors[post.id] = validate_vector(row.vector, spec.dimensions)
                        continue
                    except (ValueError, TypeError, OverflowError):
                        pass
                missing.append(post)
            for start in range(0, len(missing), BATCH_SIZE):
                batch = missing[start:start + BATCH_SIZE]
                try:
                    output = self.provider.embed([embedding_text(post) for post in batch])
                    if not isinstance(output, list) or len(output) != len(batch):
                        raise ValueError('Unexpected embedding count')
                    validated = [validate_vector(vector, spec.dimensions) for vector in output]
                except Exception:
                    raise EmbeddingUnavailable('Embedding provider is unavailable') from None
                vectors.update({post.id: vector for post, vector in zip(batch, validated)})
        except EmbeddingUnavailable:
            if not self.settings.ai_fallback_enabled:
                raise APIError(503, 'PROVIDER_UNAVAILABLE', 'Embedding provider is unavailable.') from None
            return EmbeddingResult(warnings=['Embedding provider is unavailable; using heuristic ranking for all candidates.'])
        # Persist only after every batch passes validation. Never mix scoring modes.
        if missing:
            rows = [dict(post_id=post.id, provider=spec.provider, model=spec.model,
                         dimensions=spec.dimensions, input_version=spec.input_version,
                         input_hash=fingerprint(post), vector=vectors[post.id], created_at=utcnow()) for post in missing]
            for start in range(0, len(rows), BATCH_SIZE):
                statement = insert(PostEmbedding).values(rows[start:start + BATCH_SIZE])
                db.execute(statement.on_conflict_do_update(index_elements=['post_id'],
                    set_={name: getattr(statement.excluded, name) for name in rows[0] if name != 'post_id'}))
            db.commit()
        return EmbeddingResult(mode='SEMANTIC', vectors=vectors)


def main():
    parser = argparse.ArgumentParser(description='Backfill embeddings for confirmed OPEN non-Ride posts.')
    parser.add_argument('--refresh', action='store_true', help='Regenerate current-model vectors instead of reusing valid cache')
    args = parser.parse_args()
    settings = Settings()
    engine = make_engine(settings.database_url)
    try:
        Base.metadata.create_all(engine)
        with session_factory(engine)() as db:
            posts = list(db.scalars(select(Post).where(Post.status == 'OPEN', Post.category != 'RIDE').order_by(Post.id)))
            try:
                result = EmbeddingService(settings).prepare(db, posts, refresh=args.refresh)
            except APIError as error:
                parser.exit(1, error.message + '\n')
            print(json.dumps({'matching_mode': result.mode, 'embedded_posts': len(result.vectors), 'warnings': result.warnings}))
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()
