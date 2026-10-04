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
