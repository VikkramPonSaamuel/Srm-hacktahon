import json
from functools import lru_cache
from typing import Annotated, Any, List, Union
from pydantic import (
    AnyHttpUrl,
    BeforeValidator,
    computed_field,
)
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_cors(v: Any) -> List[str]:
    """Parse CORS origins from a string or list."""
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",") if i.strip()]
    elif isinstance(v, (list, str)):
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except Exception:
                return [v]
        return [str(origin).rstrip("/") for origin in v]
    return []


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # General Project Information
    PROJECT_NAME: str = "Synthetic Business Transactions — Autonomous Transaction Monitoring & Recovery"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Structured Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "console"  # 'console' or 'json'

    # Authentication & RBAC Configuration
    AUTH_ENABLED: bool = False
    ADMIN_API_KEY: str = "srm-admin-key-secret"
    OPERATOR_API_KEY: str = "srm-operator-key-secret"
    VIEWER_API_KEY: str = "srm-viewer-key-secret"

    # AI & LLM Investigation Configuration
    LLM_PROVIDER: str = "none"  # 'none', 'mock', 'openai', 'anthropic', 'gemini'
    LLM_API_KEY: Union[str, None] = None
    LLM_MODEL_NAME: str = "deterministic_fallback"
    LLM_API_BASE: Union[str, None] = None
    LLM_TEMPERATURE: float = 0.0
    LLM_TIMEOUT_SECONDS: float = 10.0

    # Rate Limiting Configuration for Sensitive Endpoints
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 60
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # CORS Settings
    BACKEND_CORS_ORIGINS: Annotated[
        List[str],
        BeforeValidator(parse_cors),
    ] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    # Database Configuration
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "srm_user"
    POSTGRES_PASSWORD: str = "srm_secure_password"
    POSTGRES_DB: str = "srm_db"

    # Direct database connection string override (e.g. SQLite for lightweight tests)
    DATABASE_URL: Union[str, None] = None

    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_TIMEOUT: int = 30

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@"
            f"{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )


@lru_cache()
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()


settings = get_settings()
