from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT / 'backend' / '.env', ROOT / '.env'), extra='ignore',
    )

    demo_mode: bool = True
    database_url: str = 'sqlite:///' + (ROOT / 'backend' / 'connecthub.db').as_posix()
    cors_origins: str = 'http://localhost:5173'
    demo_date: date | None = None
    demo_timezone: str = 'America/Chicago'
    ai_provider: str = 'heuristic'
    ai_fallback_enabled: bool = True

    @field_validator('demo_date', mode='before')
    @classmethod
    def empty_date(cls, value):
        return None if value == '' else value

    @field_validator('demo_timezone')
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError('Use a valid IANA timezone') from exc
        return value

    @field_validator('cors_origins')
    @classmethod
    def explicit_origins(cls, value):
        if '*' in value:
            raise ValueError('CORS requires explicit frontend origins')
        return value

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(',') if origin.strip()]
