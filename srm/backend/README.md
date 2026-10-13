# Synthetic Business Transactions — Autonomous Transaction Monitoring & Recovery

Backend service built with **Python 3.11+, FastAPI, PostgreSQL, SQLAlchemy 2.0, Alembic, and Pydantic v2**.

This platform monitors end-to-end business journeys, identifies failures, retains historical execution records to detect recurring failure patterns, prepares safe countermeasures, and executes approved recovery actions with deterministic guardrails.

---

## Architecture Overview (Phases 1 through 8)

```
backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── endpoints/
│   │       │   ├── dashboard.py       # Reliability KPIs, health matrices, CSV export & demo seeding
│   │       │   ├── executions.py      # Journey execution tracking & step results
│   │       │   ├── health.py          # /api/v1/health probe endpoint
│   │       │   ├── incidents.py       # Incident recording, filtering & timeline events
│   │       │   ├── investigations.py  # Evidence-based root-cause analysis & AI diagnostics
│   │       │   ├── journeys.py        # Journey configuration, steps & toggles
│   │       │   ├── patterns.py        # Failure pattern detection, evidence & frequency
│   │       │   ├── playbooks.py       # Playbook lifecycle, validation, approval & dry-run
│   │       │   ├── service_health.py  # Service telemetry snapshots & history
│   │       │   └── synthetic.py       # Synthetic journey execution & simulation engine
│   │       └── router.py              # Central v1 router registry
│   ├── core/
│   │   ├── config.py                  # Pydantic BaseSettings & env validation
│   │   ├── exceptions.py              # Centralized domain exceptions & standard JSON errors
│   │   ├── logging.py                 # Structured logging & request context correlation
│   │   ├── rate_limit.py              # Sliding-window rate limiter for sensitive endpoints
│   │   ├── sanitizer.py               # Sensitive credential, card & token sanitization
│   │   ├── security.py                # Role-Based Access Control (RBAC) & API key validation
│   │   └── time.py                    # Time presets and UTC helper utilities
│   ├── db/
│   │   ├── base.py                    # SQLAlchemy 2.0 Base & TimestampMixin
│   │   └── session.py                 # Engine pooling, session dependency & DB probe
│   ├── investigations/                # Root-Cause Diagnostics & Investigation Service
│   │   ├── collector.py               # Multi-source telemetry evidence aggregator
│   │   ├── deterministic.py           # Rule-based deterministic failure analyzer
│   │   ├── providers.py               # Sandboxed LLM provider interface (OpenAI, Anthropic, Gemini, Mock)
│   │   ├── safety.py                  # Telemetry sanitization & prompt-injection defense
│   │   └── service.py                 # Unified investigation service orchestrator
│   ├── middleware/
│   │   └── request_id.py              # Correlation IDs (X-Request-ID) & execution timing
│   ├── models/
│   │   ├── execution.py               # JourneyExecution, StepExecution
│   │   ├── health.py                  # ServiceHealthSnapshot
│   │   ├── incident.py                # Incident, IncidentEvent
│   │   ├── investigation.py           # IncidentInvestigation (AI & deterministic diagnosis)
│   │   ├── journey.py                 # BusinessJourney, JourneyStep
│   │   ├── pattern.py                 # FailurePattern, PatternMatch
│   │   └── playbook.py                # RecoveryPlaybook, RecoveryAction, RecoveryExecution
│   ├── orchestrator/                  # End-to-End Autonomous Orchestrator
│   │   ├── notifications.py           # Notification dispatcher (#ops-alerts, #finance-ops)
│   │   └── service.py                 # Closed-loop monitor-to-incident-to-recovery orchestrator
│   ├── patterns/                      # Historical Failure-Pattern Detection Engine
│   │   ├── detector.py                # Rule-based clustering & pattern match engine
│   │   └── features.py                # Feature extraction & incident similarity scoring
│   ├── playbooks/                     # Safe Recovery Countermeasure Engine
│   │   ├── adapters.py                # Mock external service recovery adapters
│   │   ├── engine.py                  # Guarded execution runner (cooldown, retries, approval)
│   │   └── registry.py                # Allowlisted ActionRegistry & schema validator
│   ├── repositories/                  # Clean Repository Pattern Data Access Layer
│   │   ├── base.py                    # Generic BaseRepository CRUD abstraction
│   │   ├── execution_repository.py    # Execution & step result persistence
│   │   ├── incident_repository.py     # Incident queries & timeline events
│   │   ├── journey_repository.py      # Journey configuration & step ordering
│   │   ├── pattern_repository.py      # Failure pattern queries & matches
│   │   ├── playbook_repository.py     # Playbooks, actions & executions
│   │   └── service_health_repository.py# Health snapshot querying
│   ├── schemas/                       # Pydantic v2 Request/Response Schemas
│   ├── scripts/
│   │   ├── seed.py                    # Idempotent development dataset seeder
│   │   └── seed_dashboard.py          # 7-day comprehensive dashboard demo dataset seeder
│   ├── services/                      # Application Business Logic Layer
│   ├── synthetic/                     # Modular Synthetic Execution & Monitoring Engine
│   │   ├── classifier.py              # SLA & failure classification engine
│   │   ├── engine.py                  # Sequential journey execution orchestrator
│   │   ├── mocks.py                   # 8 mock business services with controlled simulations
│   │   ├── scenarios.py               # Predefined simulation failure scenarios enum
│   │   ├── templates.py               # Predefined business journey templates
│   │   └── thresholds.py              # Configurable service SLA & latency thresholds
│   └── main.py                        # FastAPI application factory & lifespan management
├── alembic/                           # Database migration scripts & environment
│   ├── env.py
│   └── versions/                      # Migration version files (4 migration heads)
├── tests/                             # Comprehensive automated test suite (103 tests, 91% coverage)
├── .env.example                       # Documented environment configuration template
├── alembic.ini                        # Alembic configuration
├── docker-compose.yml                 # Local PostgreSQL container service
├── pytest.ini                         # Pytest configuration
└── requirements.txt                   # Production and testing Python dependencies
```

---

## Synthetic Business Journey Engine

The synthetic monitoring engine monitors complete customer transactions rather than simple ping health checks.

### Mock Business Services
1. **Authentication & Login** (`auth-service`)
2. **Product Search** (`search-service`)
3. **Shopping Cart** (`cart-service`)
4. **Checkout** (`checkout-service`)
5. **Primary Payment Gateway** (`primary-payment-gateway`)
6. **Secondary Payment Gateway** (`secondary-payment-gateway`)
7. **Order Creation** (`order-service`)
8. **Order Confirmation** (`order-confirmation-service`)

### Realistic Simulated Failure Modes
- `auth_5xx`: Authentication API returns HTTP 500 error.
- `auth_timeout`: Token verification request times out.
- `search_slow`: Product search latency spike (2850ms) exceeding SLA threshold.
- `checkout_5xx`: Calculation crash in tax resolver.
- `primary_payment_timeout`: Primary gateway times out (> 6000ms).
- `secondary_gateway_down`: Secondary processor returns HTTP 503.
- `confirmation_delayed`: Notification queue backlog delays SMS/Email (3400ms).
- `dependency_unhealthy`: Cart Redis cache cluster unreachable.
- `unexpected_response`: Order service returns unexpected schema missing `order_id`.

---

## Critical Safety & Resilience Rules

1. **Safety Guard Against Live Systems**:
   - Failure injection scenarios and demo data seeding are strictly prohibited if `ENVIRONMENT` is set to `production`. Any attempt immediately raises HTTP 400 Bad Request or exits.
2. **Payment Safety & Indeterminate State Handling**:
   - A payment is **NEVER** assumed failed solely because the gateway request timed out.
   - **Blind retries are strictly prohibited** when the outcome is uncertain (`INDETERMINATE_PAYMENT_STATE`).
   - Mock payment gateways require and enforce **idempotency keys** (`idem_{execution_id}_pay`). Replaying with the same key returns the cached transaction rather than double-charging.
3. **Draft & Disabled Playbook Protection**:
   - Playbooks in `draft`, `pending_approval`, or `rejected` status cannot be executed.
   - Disabled playbooks (`is_enabled=False`) are rejected immediately.
4. **Bounded Retries & Cooldowns**:
   - Automated recovery attempts are strictly bounded by `max_attempts`.
   - Repeated triggers within `cooldown_seconds` are skipped to prevent flapping.
   - Concurrent duplicate recovery runs on the same incident are deduplicated.
5. **Correlation Tracing**:
   - Every synthetic execution is assigned a unique `correlation_id` propagated across step records, telemetry snapshots, incident events, investigations, and recovery jobs.

---

## API Security & Role-Based Access Control (RBAC)

### 1. Role Hierarchy
When `AUTH_ENABLED=True`, incoming requests must present a valid key via `X-API-Key` or `Authorization: Bearer <key>`.

| Role | Access Level | Permitted Operations |
|---|---|---|
| **Viewer** | Level 1 | Read-only access to dashboard KPIs, journey health, incident history, pattern analytics, investigation evidence. |
| **Operator** | Level 2 | All Viewer permissions + initiating synthetic journeys, manual recovery retries, incident escalations, and triggering root-cause investigations. |
| **Admin** | Level 3 | Full access + creating/editing recovery playbooks, approving playbooks, modifying SLA thresholds, and seeding demo data. |

### 2. Rate Limiting for Sensitive Endpoints
A thread-safe sliding-window `RateLimiter` (`RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW_SECONDS`) protects high-impact endpoints from abuse or unintended flooding:
- `POST /api/v1/playbooks/{id}/execute`
- `POST /api/v1/incidents/{id}/retry-recovery`
- `POST /api/v1/incidents/{id}/escalate`
- `POST /api/v1/incidents/{id}/analyze`
- `POST /api/v1/dashboard/seed-demo-data`
- `POST /api/v1/brands/{id}/review`

Exceeding the threshold returns `429 Too Many Requests` with a JSON response containing `retry_after_seconds`.

---

## Environment Variable Reference

| Variable | Default Value | Description |
|---|---|---|
| `PROJECT_NAME` | `"Synthetic Business Transactions..."` | Application name in OpenAPI docs and headers. |
| `ENVIRONMENT` | `development` | Deployment environment (`development`, `staging`, `production`). |
| `DEBUG` | `True` | FastAPI debug mode. |
| `API_V1_STR` | `/api/v1` | Base route prefix for API v1. |
| `LOG_LEVEL` | `INFO` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |
| `LOG_FORMAT` | `console` | Log format (`console` or `json`). |
| `AUTH_ENABLED` | `False` | When `True`, enforces API key authentication & RBAC. |
| `ADMIN_API_KEY` | `srm-admin-key-secret` | Secret key granting Admin privileges. |
| `OPERATOR_API_KEY`| `srm-operator-key-secret` | Secret key granting Operator privileges. |
| `VIEWER_API_KEY` | `srm-viewer-key-secret` | Secret key granting Viewer privileges. |
| `RATE_LIMIT_ENABLED` | `True` | Enables sliding-window rate limiting on sensitive endpoints. |
| `RATE_LIMIT_REQUESTS`| `60` | Max requests allowed in sliding window. |
| `RATE_LIMIT_WINDOW_SECONDS`| `60` | Duration of rate limiting window in seconds. |
| `LLM_PROVIDER` | `none` | AI analysis provider: `none`, `mock`, `openai`, `anthropic`, `gemini`. |
| `LLM_API_KEY` | `None` | External LLM API key. |
| `LLM_MODEL_NAME` | `deterministic_fallback` | Model identifier (e.g. `gpt-4o`, `claude-3-sonnet`). |
| `LLM_API_BASE` | `None` | Custom LLM endpoint URL (e.g., local Ollama or vLLM). |
| `BACKEND_CORS_ORIGINS` | `["http://localhost:3000", ...]` | JSON array or comma-separated allowed CORS origins. |
| `POSTGRES_SERVER` | `localhost` | PostgreSQL host. |
| `POSTGRES_PORT` | `5432` | PostgreSQL port. |
| `POSTGRES_USER` | `srm_user` | PostgreSQL database username. |
| `POSTGRES_PASSWORD` | `srm_secure_password` | PostgreSQL database password. |
| `POSTGRES_DB` | `srm_db` | PostgreSQL database name. |
| `DATABASE_URL` | `None` | Direct SQLAlchemy URI override (e.g., `sqlite:///./dev.db`). |

---

## Component Implementation Status & Boundaries

| Component | Status | Notes / External Dependencies |
|---|---|---|
| **Journey Monitoring Engine** | **Fully Implemented** | Native Python sequential execution, step timers, SLA classification. |
| **8 Mock Business Services** | **Simulated** | In-memory mocks with deterministic latencies, idempotency key tracking, and failure modes. |
| **Pattern Detection Engine** | **Fully Implemented** | Rule-based feature extractor, similarity scoring, and database clustering. |
| **Playbook Safety Engine** | **Fully Implemented** | Allowlist validation, cooldown enforcement, risk gating, and audit records. |
| **Payment Gateway Adapter** | **Simulated** | Simulates primary and secondary payment rails with idempotency protection and status inquiries. |
| **Notification Dispatcher** | **Simulated / Adapter** | Mock adapters dispatch to log and capture payloads for `#ops-alerts` and `#finance-ops`. |
| **Root-Cause Investigation** | **Fully Implemented** | Deterministic engine always active; external LLM provider behind configurable HTTP interface. |
| **Database & Migrations** | **Fully Implemented** | PostgreSQL support with Alembic migrations (`8ce6c7d6a070 -> beda0339d7f5 -> c49a37e191d0 -> d58b29c1e7a4 -> e71a93b42c11`). |
| **RBAC & Rate Limiting** | **Fully Implemented** | Thread-safe sliding window rate limiter and multi-tiered role enforcement. |
| **Brand Protection Foundation** | **Fully Implemented** | Normalized official domain registry, content/magic-byte asset verification, admin review gating. |

---

## Setup & Operational Commands (Windows PowerShell)

```powershell
cd c:\srm\backend

# 1. Activate virtual environment
.\.venv\Scripts\Activate.ps1

# 2. Database Setup:
# If running PostgreSQL via Docker:
docker compose up -d

# Run Database Migrations to latest revision (Alembic):
alembic upgrade head

# 3. Seed Base Playbooks & 7-Day Demonstration Telemetry:
python -m app.scripts.seed
python -m app.scripts.seed_dashboard

# 4. Run Automated Test Suite (111 tests):
pytest -v

# Run with full line-by-line coverage report:
pytest -v --cov=app --cov-report=term-missing

# 5. Start Development Server:
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## Local Demonstration Procedure

You can test and demonstrate the complete closed-loop monitoring and recovery workflow using PowerShell:

### Step 1: Verify System Health
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/health" -Method Get
```

### Step 2: Run End-to-End Synthetic Journey with Payment Failure
```powershell
$body = @{
    scenario_override = "primary_payment_timeout"
    environment = "development"
} | ConvertTo-Json

$resp = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/synthetic/start" -Method Post -Body $body -ContentType "application/json"
$resp
```

### Step 3: Run Full Autonomous Recovery Demonstration Workflow
```powershell
$demo = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/synthetic/demonstrate-workflow" -Method Post
$demo | ConvertTo-Json -Depth 5
```

### Step 4: Investigate the Resulting Incident (AI & Deterministic Analysis)
```powershell
$incidentId = $demo.incident.incident_id
$analysis = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/incidents/$incidentId/analyze" -Method Post -Body "{}" -ContentType "application/json"
$analysis | ConvertTo-Json -Depth 5
```

### Step 5: Explore Reliability KPIs & Dashboard Endpoints
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/dashboard/overview?preset=24h" -Method Get
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/dashboard/journey-health" -Method Get
```

---

## Interactive Documentation

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc UI**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **OpenAPI Schema**: [http://localhost:8000/api/v1/openapi.json](http://localhost:8000/api/v1/openapi.json)
