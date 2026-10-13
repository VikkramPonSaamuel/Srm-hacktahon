from typing import List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.playbook import RecoveryAction, RecoveryExecution, RecoveryPlaybook
from app.repositories.base import BaseRepository


class PlaybookRepository(BaseRepository[RecoveryPlaybook]):
    """Repository handling RecoveryPlaybook, RecoveryAction, and RecoveryExecution persistence."""

    def __init__(self, db: Session) -> None:
        super().__init__(RecoveryPlaybook, db)

    def get_by_playbook_id(self, playbook_id: str) -> Optional[RecoveryPlaybook]:
        stmt = (
            select(RecoveryPlaybook)
            .options(
                selectinload(RecoveryPlaybook.actions),
                selectinload(RecoveryPlaybook.executions),
            )
            .where(RecoveryPlaybook.playbook_id == playbook_id)
        )
        return self.db.scalars(stmt).first()

    def get_by_id_with_actions(self, id: int) -> Optional[RecoveryPlaybook]:
        stmt = (
            select(RecoveryPlaybook)
            .options(
                selectinload(RecoveryPlaybook.actions),
                selectinload(RecoveryPlaybook.executions),
            )
            .where(RecoveryPlaybook.id == id)
        )
        return self.db.scalars(stmt).first()

    def list_playbooks(
        self,
        skip: int = 0,
        limit: int = 50,
        service_name: Optional[str] = None,
        approval_status: Optional[str] = None,
        is_enabled: Optional[bool] = None,
        recovery_strategy: Optional[str] = None,
        pattern_ref: Optional[str] = None,
    ) -> Tuple[List[RecoveryPlaybook], int]:
        base_query = select(RecoveryPlaybook).options(selectinload(RecoveryPlaybook.actions))
        count_query = select(func.count(RecoveryPlaybook.id))

        if approval_status:
            base_query = base_query.where(RecoveryPlaybook.approval_status == approval_status)
            count_query = count_query.where(RecoveryPlaybook.approval_status == approval_status)

        if is_enabled is not None:
            base_query = base_query.where(RecoveryPlaybook.is_enabled.is_(is_enabled))
            count_query = count_query.where(RecoveryPlaybook.is_enabled.is_(is_enabled))

        if recovery_strategy:
            base_query = base_query.where(RecoveryPlaybook.recovery_strategy == recovery_strategy)
            count_query = count_query.where(RecoveryPlaybook.recovery_strategy == recovery_strategy)

        if pattern_ref:
            base_query = base_query.where(RecoveryPlaybook.pattern_ref == pattern_ref)
            count_query = count_query.where(RecoveryPlaybook.pattern_ref == pattern_ref)

        total = self.db.scalar(count_query) or 0
        stmt = base_query.order_by(RecoveryPlaybook.created_at.desc()).offset(skip).limit(limit)
        items = list(self.db.scalars(stmt).all())

        # Filter by service_name in JSON list if specified
        if service_name:
            filtered_items = [p for p in items if service_name in p.applicable_services]
            return filtered_items, len(filtered_items)

        return items, total

    def create_playbook(self, playbook: RecoveryPlaybook, actions: List[RecoveryAction]) -> RecoveryPlaybook:
        self.db.add(playbook)
        self.db.flush()

        for action in actions:
            action.playbook_id = playbook.id
            self.db.add(action)

        self.db.commit()
        self.db.refresh(playbook)
        return playbook

    def update_playbook_actions(self, playbook: RecoveryPlaybook, new_actions: List[RecoveryAction]) -> RecoveryPlaybook:
        # Delete existing actions
        self.db.query(RecoveryAction).filter(RecoveryAction.playbook_id == playbook.id).delete()
        self.db.flush()

        for action in new_actions:
            action.playbook_id = playbook.id
            self.db.add(action)

        self.db.commit()
        self.db.refresh(playbook)
        return playbook

    def get_execution_by_id(self, execution_id: str) -> Optional[RecoveryExecution]:
        stmt = select(RecoveryExecution).where(RecoveryExecution.execution_id == execution_id)
        return self.db.scalars(stmt).first()

    def list_executions_for_playbook(
        self,
        playbook_id: int,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[RecoveryExecution], int]:
        count_query = select(func.count(RecoveryExecution.id)).where(RecoveryExecution.playbook_id == playbook_id)
        total = self.db.scalar(count_query) or 0

        stmt = (
            select(RecoveryExecution)
            .where(RecoveryExecution.playbook_id == playbook_id)
            .order_by(RecoveryExecution.started_at.desc())
            .offset(skip)
            .limit(limit)
        )
        items = list(self.db.scalars(stmt).all())
        return items, total
