# Synthetic Business Transactions — Autonomous Transaction Monitoring & Recovery

**Autonomous Transaction Monitoring & Recovery** is an enterprise resilience platform that monitors end-to-end business journeys, identifies failures, learns recurring failure patterns from historical records, prepares countermeasures, and safely executes approved recovery actions.

---

## Repository Structure

```
.
├── backend/                  # FastAPI backend service (Python 3.11+, SQLAlchemy, Alembic)
│   ├── app/                  # Application source code
│   ├── alembic/              # Database migration scripts
│   ├── tests/                # Automated tests
│   ├── .env.example          # Environment variables template
│   ├── alembic.ini           # Alembic migration configuration
│   ├── docker-compose.yml    # Docker Compose for local PostgreSQL
│   ├── pytest.ini            # Pytest configuration
│   └── requirements.txt      # Dependency specification
├── docker-compose.yml        # Root compose definition for convenience
└── README.md                 # Project root documentation
```

---

## Quick Start (Backend)

For full setup instructions, see [backend/README.md](file:///c:/srm/backend/README.md).

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest -v
uvicorn app.main:app --reload
```

Interactive documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).
Health diagnostics endpoint is at [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health).
