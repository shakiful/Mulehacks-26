from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AliasChoices, Field, SecretStr, ValidationInfo, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT / 'backend' / '.env', ROOT / '.env'), extra='ignore',
    )

    database_url: str = 'sqlite:///' + (ROOT / 'backend' / 'connecthub.db').as_posix()
    cors_origins: str = 'http://localhost:5173'
    seed_date: date | None = None
    seed_timezone: str = 'America/Chicago'
    rafi_login_password: SecretStr = SecretStr('')
    afsana_login_password: SecretStr = SecretStr('')
    session_cookie_secure: bool = False
    session_lifetime_seconds: int = Field(default=43200, ge=300, le=604800)
    ai_provider: str = 'gemini'
    ai_model: str = 'gemini-3.5-flash-lite'
    ai_timeout_seconds: float = Field(default=30, gt=0, le=60, allow_inf_nan=False)
    ai_fallback_enabled: bool = True
    embedding_provider: str = 'gemini'
    embedding_model: str = 'gemini-embedding-001'
    embedding_dimensions: int = Field(default=768, ge=1, le=3072)
    embedding_timeout_seconds: float = Field(default=10, gt=0, le=60, allow_inf_nan=False)
    openai_api_key: SecretStr = SecretStr('')
    gemini_api_key: SecretStr = Field(default=SecretStr(''),
        validation_alias=AliasChoices('gemini_api_key', 'google_api_key'))

    @model_validator(mode='before')
    @classmethod
    def provider_defaults(cls, values):
        if isinstance(values, dict) and values.get('embedding_provider') == 'openai':
            values = dict(values)
            values.setdefault('embedding_model', 'text-embedding-3-small')
            values.setdefault('embedding_dimensions', 1536)
        return values

    @field_validator('embedding_model', mode='before')
    @classmethod
    def default_embedding_model(cls, value, info: ValidationInfo):
        if isinstance(value, str):
            return value.strip() or ('text-embedding-3-small' if info.data.get('embedding_provider') == 'openai'
                                     else 'gemini-embedding-001')
        return value

    @field_validator('seed_date', mode='before')
    @classmethod
    def empty_date(cls, value):
        return None if value == '' else value

    @field_validator('seed_timezone')
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
