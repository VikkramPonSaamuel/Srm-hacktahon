from app.core.config import Settings, parse_cors


def test_default_settings():
    """Verify that Settings loads with expected defaults and valid types."""
    settings = Settings()
    assert settings.API_V1_STR == "/api/v1"
    assert settings.POSTGRES_PORT == 5432
    assert "postgresql+psycopg2://" in settings.SQLALCHEMY_DATABASE_URI
    assert isinstance(settings.BACKEND_CORS_ORIGINS, list)


def test_cors_parser():
    """Verify parse_cors correctly parses various formats."""
    # JSON array string
    result = parse_cors('["http://localhost:3000", "http://example.com/"]')
    assert result == ["http://localhost:3000", "http://example.com"]

    # Comma-separated string
    result2 = parse_cors("http://localhost:3000, https://app.example.com")
    assert result2 == ["http://localhost:3000", "https://app.example.com"]

    # Direct list
    result3 = parse_cors(["http://localhost:8000/"])
    assert result3 == ["http://localhost:8000"]


def test_database_url_override():
    """Verify that an explicit DATABASE_URL overrides individual credentials."""
    custom_url = "sqlite:///./custom_test.db"
    settings = Settings(DATABASE_URL=custom_url)
    assert settings.SQLALCHEMY_DATABASE_URI == custom_url
