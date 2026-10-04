from datetime import date

import pytest
from pydantic import ValidationError

from backend.app.config import Settings


def test_local_configuration_and_environment_override(tmp_path, monkeypatch):
    env = tmp_path / '.env'
    env.write_text(
        'DEMO_MODE=false\nDEMO_DATE=\nDEMO_TIMEZONE=America/Chicago\n'
        'CORS_ORIGINS=http://localhost:5173, http://127.0.0.1:5173\n'
        'AI_PROVIDER=heuristic\n', encoding='utf-8',
    )
    settings = Settings(_env_file=env)
    assert settings.demo_mode is False
    assert settings.demo_date is None
    assert settings.allowed_origins == ['http://localhost:5173', 'http://127.0.0.1:5173']
    monkeypatch.setenv('DEMO_MODE', 'true')
    monkeypatch.setenv('DEMO_DATE', '2026-10-04')
    settings = Settings(_env_file=env)
    assert settings.demo_mode is True
    assert settings.demo_date == date(2026, 10, 4)


@pytest.mark.parametrize('values', [
    {'cors_origins': '*'}, {'demo_timezone': 'invalid/timezone'}, {'demo_date': 'tomorrow'},
])
def test_invalid_config_is_rejected(values):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **values)


def test_gemini_is_primary_with_automatic_fallback_and_provider_specific_models():
    settings = Settings(_env_file=None, gemini_api_key='', openai_api_key='')
    assert settings.ai_provider == settings.embedding_provider == 'gemini'
    assert settings.ai_fallback_enabled is True
    assert settings.embedding_model == 'gemini-embedding-001' and settings.embedding_dimensions == 768
    openai = Settings(_env_file=None, embedding_provider='openai')
    assert openai.embedding_model == 'text-embedding-3-small' and openai.embedding_dimensions == 1536
