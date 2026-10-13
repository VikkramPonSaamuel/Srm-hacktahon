from collections import defaultdict
from typing import Any, Dict, List, Optional
import uuid
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.core.logging import get_logger
from app.models.incident import Incident
from app.models.pattern import FailurePattern
from app.models.playbook import RecoveryAction, RecoveryExecution, RecoveryPlaybook
from app.playbooks.engine import RecoveryEngine
from app.playbooks.registry import ActionRegistry
from app.repositories.playbook_repository import PlaybookRepository
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

logger = get_logger("app.services.playbook_service")


class PlaybookService:
    """Service orchestrating recovery playbook lifecycle, validation, approval, and execution."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = PlaybookRepository(db)
        self.engine = RecoveryEngine(db)

    def _find_playbook(self, identifier: str) -> RecoveryPlaybook:
        playbook = self.repo.get_by_playbook_id(identifier)
        if not playbook and identifier.isdigit():
            playbook = self.repo.get_by_id_with_actions(int(identifier))
        if not playbook:
            raise NotFoundError(message=f"Recovery playbook '{identifier}' was not found.")
        return playbook

    def create_playbook(self, data: RecoveryPlaybookCreate) -> RecoveryPlaybookDetailResponse:
        playbook_id = data.playbook_id or f"pb_{uuid.uuid4().hex[:10]}"

        # Prevent duplicate playbook_id
        if self.repo.get_by_playbook_id(playbook_id):
            raise ConflictError(message=f"Playbook with ID '{playbook_id}' already exists.")

        # Resolve pattern if pattern_ref provided
        pattern_id = None
        if data.pattern_ref:
            pattern = self.db.query(FailurePattern).filter(FailurePattern.pattern_id == data.pattern_ref).first()
            if pattern:
                pattern_id = pattern.id

        # Validate each action before creation
        actions: List[RecoveryAction] = []
        for i, a in enumerate(data.actions, start=1):
            ActionRegistry.validate_action(a.action_type, a.parameters, a.risk_level)
            requires_approval = a.requires_approval or (a.risk_level in ("high", "critical"))
            actions.append(
                RecoveryAction(
                    action_order=a.action_order or i,
                    action_type=a.action_type,
                    parameters=a.parameters,
                    risk_level=a.risk_level,
                    preconditions=a.preconditions,
                    expected_outcome=a.expected_outcome,
                    timeout_seconds=a.timeout_seconds,
                    requires_approval=requires_approval,
                )
            )

        playbook = RecoveryPlaybook(
            playbook_id=playbook_id,
            name=data.name,
            description=data.description,
            pattern_id=pattern_id,
            pattern_ref=data.pattern_ref,
            applicable_services=data.applicable_services,
            applicable_journeys=data.applicable_journeys,
            trigger_conditions=data.trigger_conditions,
            recovery_strategy=data.recovery_strategy,
            approval_status="draft",  # Always starts as draft
            is_enabled=False,  # Drafts cannot be enabled
            max_attempts=data.max_attempts,
            cooldown_seconds=data.cooldown_seconds,
            verification_conditions=data.verification_conditions,
            rollback_instructions=data.rollback_instructions,
            is_demo=data.is_demo,
        )

        saved = self.repo.create_playbook(playbook, actions)
        return RecoveryPlaybookDetailResponse.model_validate(saved)

    def get_playbook(self, identifier: str) -> RecoveryPlaybookDetailResponse:
        playbook = self._find_playbook(identifier)
        return RecoveryPlaybookDetailResponse.model_validate(playbook)

    def list_playbooks(
        self,
        skip: int = 0,
        limit: int = 50,
        service_name: Optional[str] = None,
        approval_status: Optional[str] = None,
        is_enabled: Optional[bool] = None,
        recovery_strategy: Optional[str] = None,
        pattern_ref: Optional[str] = None,
    ) -> PaginatedResponse[RecoveryPlaybookResponse]:
        limit = min(limit, 100)
        items, total = self.repo.list_playbooks(
            skip=skip,
            limit=limit,
            service_name=service_name,
            approval_status=approval_status,
            is_enabled=is_enabled,
            recovery_strategy=recovery_strategy,
            pattern_ref=pattern_ref,
        )

        return PaginatedResponse(
            items=[RecoveryPlaybookResponse.model_validate(p) for p in items],
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + len(items)) < total,
        )

    def update_playbook(self, identifier: str, data: RecoveryPlaybookUpdate) -> RecoveryPlaybookDetailResponse:
        playbook = self._find_playbook(identifier)

        # Apply scalar updates
        update_data = data.model_dump(exclude_unset=True, exclude={"actions"})
        for field, value in update_data.items():
            setattr(playbook, field, value)

        # Modifying a playbook resets approval to draft for safety
        playbook.approval_status = "draft"
        playbook.is_enabled = False

        # Apply action updates if provided
        if data.actions is not None:
            new_actions = []
            for i, a in enumerate(data.actions, start=1):
                ActionRegistry.validate_action(a.action_type, a.parameters, a.risk_level)
                requires_approval = a.requires_approval or (a.risk_level in ("high", "critical"))
                new_actions.append(
                    RecoveryAction(
                        action_order=a.action_order or i,
                        action_type=a.action_type,
                        parameters=a.parameters,
                        risk_level=a.risk_level,
                        preconditions=a.preconditions,
                        expected_outcome=a.expected_outcome,
                        timeout_seconds=a.timeout_seconds,
                        requires_approval=requires_approval,
                    )
                )
            playbook = self.repo.update_playbook_actions(playbook, new_actions)
        else:
            self.db.commit()
            self.db.refresh(playbook)

        return RecoveryPlaybookDetailResponse.model_validate(playbook)

    def validate_playbook(self, identifier: str) -> PlaybookValidateResponse:
        playbook = self._find_playbook(identifier)
        errors: List[str] = []
        risk_counts: Dict[str, int] = defaultdict(int)

        if not playbook.actions:
            errors.append("Playbook must define at least one recovery action.")

        for action in playbook.actions:
            try:
                ActionRegistry.validate_action(action.action_type, action.parameters, action.risk_level)
            except Exception as e:
                errors.append(f"Action #{action.action_order} ({action.action_type}) invalid: {e}")

            risk_counts[action.risk_level] += 1
            if action.risk_level in ("high", "critical") and not action.requires_approval:
                errors.append(f"Action #{action.action_order} is high-risk and must require human approval.")

        return PlaybookValidateResponse(
            is_valid=len(errors) == 0,
            validation_errors=errors,
            risk_summary=dict(risk_counts),
            allowlisted_action_count=len(playbook.actions),
        )

    def submit_for_approval(self, identifier: str) -> RecoveryPlaybookResponse:
        playbook = self._find_playbook(identifier)
        if playbook.approval_status != "draft":
            raise BadRequestError(message=f"Only draft playbooks can be submitted for approval (current: {playbook.approval_status}).")

        # Validate first
        val = self.validate_playbook(identifier)
        if not val.is_valid:
            raise BadRequestError(
                message=f"Playbook validation failed: {'; '.join(val.validation_errors)}"
            )

        playbook.approval_status = "pending_approval"
        self.db.commit()
        self.db.refresh(playbook)
        logger.info(f"Playbook '{playbook.name}' submitted for approval.")
        return RecoveryPlaybookResponse.model_validate(playbook)

    def approve_or_reject(self, identifier: str, payload: PlaybookApprovalRequest) -> RecoveryPlaybookResponse:
        playbook = self._find_playbook(identifier)
        if playbook.approval_status != "pending_approval":
            raise BadRequestError(
                message=f"Playbook must be in 'pending_approval' state to approve or reject (current: {playbook.approval_status})."
            )

        if payload.status not in ("approved", "rejected"):
            raise BadRequestError(message="Status must be either 'approved' or 'rejected'.")

        playbook.approval_status = payload.status
        if payload.status == "rejected":
            playbook.is_enabled = False

        self.db.commit()
        self.db.refresh(playbook)
        logger.info(f"Playbook '{playbook.name}' status updated to '{payload.status}' (notes: {payload.notes})")
        return RecoveryPlaybookResponse.model_validate(playbook)

    def toggle_playbook(self, identifier: str, is_enabled: bool) -> RecoveryPlaybookResponse:
        playbook = self._find_playbook(identifier)
        if is_enabled and playbook.approval_status != "approved":
            raise BadRequestError(
                message=f"Only approved playbooks can be enabled for execution. Current status is '{playbook.approval_status}'."
            )

        playbook.is_enabled = is_enabled
        self.db.commit()
        self.db.refresh(playbook)
        logger.info(f"Playbook '{playbook.name}' enabled status set to {is_enabled}")
        return RecoveryPlaybookResponse.model_validate(playbook)

    def simulate_playbook(self, identifier: str, payload: PlaybookExecuteRequest) -> RecoveryExecutionResponse:
        playbook = self._find_playbook(identifier)
        incident = None
        if payload.incident_id:
            incident = self.db.query(Incident).filter(Incident.incident_id == payload.incident_id).first()

        execution = self.engine.execute_playbook(
            playbook=playbook,
            incident=incident,
            is_simulation=True,
            operator_override=payload.operator_override,
            idempotency_key=payload.idempotency_key,
        )
        return RecoveryExecutionResponse.model_validate(execution)

    def execute_playbook(self, identifier: str, payload: PlaybookExecuteRequest) -> RecoveryExecutionResponse:
        playbook = self._find_playbook(identifier)
        incident = None
        if payload.incident_id:
            incident = self.db.query(Incident).filter(Incident.incident_id == payload.incident_id).first()
            if not incident:
                raise NotFoundError(message=f"Incident '{payload.incident_id}' not found.")

        execution = self.engine.execute_playbook(
            playbook=playbook,
            incident=incident,
            is_simulation=payload.is_simulation,
            operator_override=payload.operator_override,
            idempotency_key=payload.idempotency_key,
        )
        return RecoveryExecutionResponse.model_validate(execution)

    def list_executions(
        self,
        identifier: str,
        skip: int = 0,
        limit: int = 50,
    ) -> PaginatedResponse[RecoveryExecutionResponse]:
        playbook = self._find_playbook(identifier)
        limit = min(limit, 100)
        items, total = self.repo.list_executions_for_playbook(playbook.id, skip=skip, limit=limit)

        return PaginatedResponse(
            items=[RecoveryExecutionResponse.model_validate(e) for e in items],
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + len(items)) < total,
        )

    def get_execution(self, execution_id: str) -> RecoveryExecutionResponse:
        execution = self.repo.get_execution_by_id(execution_id)
        if not execution:
            raise NotFoundError(message=f"Recovery execution '{execution_id}' was not found.")
        return RecoveryExecutionResponse.model_validate(execution)
