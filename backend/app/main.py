from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import Settings
from .ai.embeddings import EmbeddingService
from .cors import APICORSMiddleware
from .database import Base, make_engine, session_factory
from .errors import install_handlers
from .routes import router


def create_app(settings: Settings | None = None, *, embedding_provider=None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        engine = make_engine(settings.database_url)
        app.state.engine = engine
        app.state.session_factory = session_factory(engine)
        try:
            Base.metadata.create_all(engine)
            yield
        finally:
            engine.dispose()

    app = FastAPI(title='ConnectHub', version='0.1.0', lifespan=lifespan)
    app.state.settings = settings
    app.state.embeddings = EmbeddingService(settings, embedding_provider)
    app.add_middleware(
        APICORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=['GET', 'POST', 'PATCH'],
        allow_headers=['Content-Type', 'X-Demo-User-Id'],
    )
    install_handlers(app)
    app.include_router(router)
    return app


app = create_app()
