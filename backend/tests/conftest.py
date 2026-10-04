from datetime import date

import pytest
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.seed import seed


@pytest.fixture
def settings(tmp_path):
    return Settings(
        _env_file=None, database_url='sqlite:///' + (tmp_path / 'test.db').as_posix(),
        demo_mode=True, demo_date=date(2026, 10, 3), demo_timezone='America/Chicago',
        cors_origins='http://localhost:5173',
        openai_api_key='',
        gemini_api_key='',
        ai_provider='heuristic', ai_fallback_enabled=True, embedding_provider='heuristic',
    )


@pytest.fixture
def client(settings):
    seed(settings)
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture
def headers():
    return {'X-Demo-User-Id': '1'}


@pytest.fixture
def study():
    return {
        'category': 'STUDY', 'intent': 'REQUEST', 'title': 'Help with SQL joins',
        'text': 'I need help studying SQL joins tonight', 'location': 'Library',
        'starts_at': '2026-10-03T18:00:00-05:00', 'ends_at': '2026-10-03T19:00:00-05:00',
        'details': {'course': 'SQL', 'topic': 'joins', 'skill_level': 'BEGINNER', 'mode': 'IN_PERSON'},
    }
