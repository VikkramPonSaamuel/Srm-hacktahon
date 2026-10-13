from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import get_logger, setup_logging
from app.db.session import engine
from app.middleware.request_id import RequestContextMiddleware

# Initialize logging configuration before instantiating components
setup_logging(log_level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
logger = get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifecycle events management."""
    logger.info(
        f"Starting {settings.PROJECT_NAME} v{settings.VERSION} "
        f"[env: {settings.ENVIRONMENT}, debug: {settings.DEBUG}]"
    )
    yield
    logger.info("Gracefully shutting down backend services...")
    engine.dispose()
    logger.info("Database connection pools disposed.")


def create_application() -> FastAPI:
    """Factory function to build and configure the FastAPI application."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description=(
            "Synthetic Business Transactions — Autonomous Transaction Monitoring & Recovery.\n\n"
            "An enterprise resilience platform that monitors end-to-end business journeys, "
            "identifies failures, learns recurring failure patterns from historical records, "
            "prepares countermeasures, and safely executes approved recovery actions."
        ),
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # 1. CORS Configuration
    if settings.BACKEND_CORS_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.BACKEND_CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # 2. Request Correlation & Context Middleware
    app.add_middleware(RequestContextMiddleware)

    # 3. Centralized Exception Handling
    register_exception_handlers(app)

    # 4. API Routers
    app.include_router(api_v1_router, prefix=settings.API_V1_STR)

    # 5. Root & Health discovery endpoints
    @app.get("/api/health", tags=["Health"])
    @app.get("/health", tags=["Health"])
    def global_health():
        return {
            "status": "healthy",
            "service": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "environment": settings.ENVIRONMENT,
        }

    @app.get("/", tags=["Root"])
    def root():
        return {
            "name": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "environment": settings.ENVIRONMENT,
            "docs": "/docs",
            "health": f"{settings.API_V1_STR}/health",
        }

    return app


app = create_application()
