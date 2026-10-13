from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.rate_limit import RateLimiter
from app.core.security import UserRole, require_role
from app.db.session import get_db
from app.schemas.pagination import PaginatedResponse
from app.schemas.playbook import (
    PlaybookApprovalRequest,
    PlaybookExecuteRequest,
    PlaybookToggleRequest,
    PlaybookValidateResponse,
    RecoveryExecutionResponse,
    RecoveryPlaybookCreate,
    RecoveryPlaybookDetailResponse,
    RecoveryPlaybookResponse,
    RecoveryPlaybookUpdate,
)
from app.services.playbook_service import PlaybookService

router = APIRouter()


@router.post(
    "",
    response_model=RecoveryPlaybookDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Recovery Playbook Draft",
    description="Registers a new candidate or draft recovery playbook with ordered allowlisted actions.",
)
def create_playbook(
    payload: RecoveryPlaybookCreate,
    db: Session = Depends(get_db),
) -> RecoveryPlaybookDetailResponse:
    service = PlaybookService(db)
    return service.create_playbook(payload)


@router.get(
    "",
    response_model=PaginatedResponse[RecoveryPlaybookResponse],
    summary="List and Filter Recovery Playbooks",
    description="Queries playbooks with filtering by service, approval status, enabled status, strategy, and pattern.",
)
def list_playbooks(
    skip: int = Query(0, ge=0, description="Offset index"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    service_name: Optional[str] = Query(None, description="Filter by applicable microservice"),
    approval_status: Optional[str] = Query(None, description="Filter by approval status (draft, pending_approval, approved, rejected)"),
    is_enabled: Optional[bool] = Query(None, description="Filter by enabled status"),
    recovery_strategy: Optional[str] = Query(None, description="Filter by recovery strategy"),
    pattern_ref: Optional[str] = Query(None, description="Filter by associated failure pattern"),
    db: Session = Depends(get_db),
) -> PaginatedResponse[RecoveryPlaybookResponse]:
    service = PlaybookService(db)
    return service.list_playbooks(
        skip=skip,
        limit=limit,
        service_name=service_name,
        approval_status=approval_status,
        is_enabled=is_enabled,
        recovery_strategy=recovery_strategy,
        pattern_ref=pattern_ref,
    )


@router.get(
    "/executions/{execution_id}",
    response_model=RecoveryExecutionResponse,
    summary="Get Recovery Execution Audit Record",
    description="Retrieves a specific recovery execution audit record by execution ID.",
)
def get_execution(
    execution_id: str,
    db: Session = Depends(get_db),
) -> RecoveryExecutionResponse:
    service = PlaybookService(db)
    return service.get_execution(execution_id)


@router.get(
    "/{playbook_id}",
    response_model=RecoveryPlaybookDetailResponse,
    summary="Retrieve Playbook Details",
    description="Retrieves comprehensive details of a playbook including all ordered recovery actions.",
)
def get_playbook(
    playbook_id: str,
    db: Session = Depends(get_db),
) -> RecoveryPlaybookDetailResponse:
    service = PlaybookService(db)
    return service.get_playbook(playbook_id)


@router.put(
    "/{playbook_id}",
    response_model=RecoveryPlaybookDetailResponse,
    summary="Edit Playbook Draft",
    description="Updates playbook fields or action steps. Modifying an approved playbook resets its status to draft.",
)
def update_playbook(
    playbook_id: str,
    payload: RecoveryPlaybookUpdate,
    db: Session = Depends(get_db),
) -> RecoveryPlaybookDetailResponse:
    service = PlaybookService(db)
    return service.update_playbook(playbook_id, payload)


@router.post(
    "/{playbook_id}/validate",
    response_model=PlaybookValidateResponse,
    summary="Validate Playbook Actions & Safety Rules",
    description="Validates all playbook actions against the allowlisted registry and verifies risk approval rules.",
)
def validate_playbook(
    playbook_id: str,
    db: Session = Depends(get_db),
) -> PlaybookValidateResponse:
    service = PlaybookService(db)
    return service.validate_playbook(playbook_id)


@router.post(
    "/{playbook_id}/submit",
    response_model=RecoveryPlaybookResponse,
    summary="Submit Playbook for Approval",
    description="Submits a valid draft playbook to the human approval queue (draft -> pending_approval).",
)
def submit_for_approval(
    playbook_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.OPERATOR)),
) -> RecoveryPlaybookResponse:
    service = PlaybookService(db)
    return service.submit_for_approval(playbook_id)


@router.post(
    "/{playbook_id}/approve",
    response_model=RecoveryPlaybookResponse,
    summary="Approve or Reject Playbook",
    description="Human operator approval or rejection of a pending playbook (pending_approval -> approved / rejected).",
)
def approve_or_reject(
    playbook_id: str,
    payload: PlaybookApprovalRequest,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.ADMIN)),
) -> RecoveryPlaybookResponse:
    service = PlaybookService(db)
    return service.approve_or_reject(playbook_id, payload)


@router.patch(
    "/{playbook_id}/toggle",
    response_model=RecoveryPlaybookResponse,
    summary="Enable or Disable Approved Playbook",
    description="Enables or disables an approved playbook for automated recovery. Drafts cannot be enabled.",
)
def toggle_playbook(
    playbook_id: str,
    payload: PlaybookToggleRequest,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.OPERATOR)),
) -> RecoveryPlaybookResponse:
    service = PlaybookService(db)
    return service.toggle_playbook(playbook_id, payload.is_enabled)


@router.post(
    "/{playbook_id}/simulate",
    response_model=RecoveryExecutionResponse,
    summary="Test Playbook in Simulation Mode",
    description="Runs playbook in dry-run simulation mode without mutating external services or circuit breakers.",
)
def simulate_playbook(
    playbook_id: str,
    payload: PlaybookExecuteRequest,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.OPERATOR)),
) -> RecoveryExecutionResponse:
    service = PlaybookService(db)
    return service.simulate_playbook(playbook_id, payload)


@router.post(
    "/{playbook_id}/execute",
    response_model=RecoveryExecutionResponse,
    summary="Execute Recovery Playbook",
    description="Executes approved playbook with approval guards, bounded retries, cooldown, and payment safety.",
)
def execute_playbook(
    playbook_id: str,
    payload: PlaybookExecuteRequest,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.OPERATOR)),
    _rate_limit=Depends(RateLimiter(requests_limit=30, window_seconds=60)),
) -> RecoveryExecutionResponse:
    service = PlaybookService(db)
    return service.execute_playbook(playbook_id, payload)


@router.get(
    "/{playbook_id}/executions",
    response_model=PaginatedResponse[RecoveryExecutionResponse],
    summary="View Playbook Execution History",
    description="Lists chronological audit records and outcomes for all executions of this playbook.",
)
def list_playbook_executions(
    playbook_id: str,
    skip: int = Query(0, ge=0, description="Offset index"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    db: Session = Depends(get_db),
) -> PaginatedResponse[RecoveryExecutionResponse]:
    service = PlaybookService(db)
    return service.list_executions(playbook_id, skip=skip, limit=limit)
