from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import Settings
from .ai.embeddings import EmbeddingService
from .cors import APICORSMiddleware
from .database import make_engine, session_factory
from .dining import DiningService
from .errors import install_handlers
from .routes import router
from .accounts import LoginThrottle, prepare_database, provision_accounts
from .security.service import SecurityService
from .rides import backfill_reservations


def create_app(settings: Settings | None = None, *, embedding_provider=None, security_provider=None, dining_provider=None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        engine = make_engine(settings.database_url)
        app.state.engine = engine
        app.state.session_factory = session_factory(engine)
        try:
            prepare_database(engine)
            with app.state.session_factory.begin() as db:
                provision_accounts(db, settings)
            with app.state.session_factory() as db:
                backfill_reservations(db)
            yield
        finally:
            engine.dispose()

    app = FastAPI(title='ConnectHub', version='0.1.0', lifespan=lifespan)
    app.state.settings = settings
    app.state.embeddings = EmbeddingService(settings, embedding_provider)
    app.state.login_throttle = LoginThrottle()
    app.state.security = SecurityService(settings, security_provider)
    app.state.dining = DiningService(dining_provider)
    app.add_middleware(
        APICORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=['GET', 'POST', 'PUT', 'PATCH'],
        allow_headers=['Content-Type', 'X-CSRF-Token'],
        allow_credentials=True,
    )
    install_handlers(app)
    app.include_router(router)
    return app


app = create_app()
