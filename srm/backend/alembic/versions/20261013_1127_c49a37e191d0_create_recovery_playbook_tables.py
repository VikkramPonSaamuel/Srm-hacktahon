"""create_recovery_playbook_tables

Revision ID: c49a37e191d0
Revises: beda0339d7f5
Create Date: 2026-10-13 11:27:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c49a37e191d0'
down_revision: Union[str, None] = 'beda0339d7f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'recovery_playbooks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('playbook_id', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('pattern_id', sa.Integer(), nullable=True),
        sa.Column('pattern_ref', sa.String(length=64), nullable=True),
        sa.Column('applicable_services', sa.JSON(), nullable=False),
        sa.Column('applicable_journeys', sa.JSON(), nullable=False),
        sa.Column('trigger_conditions', sa.JSON(), nullable=False),
        sa.Column('recovery_strategy', sa.String(length=50), nullable=False),
        sa.Column('approval_status', sa.String(length=30), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False),
        sa.Column('max_attempts', sa.Integer(), nullable=False),
        sa.Column('cooldown_seconds', sa.Integer(), nullable=False),
        sa.Column('verification_conditions', sa.JSON(), nullable=False),
        sa.Column('rollback_instructions', sa.JSON(), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['pattern_id'], ['failure_patterns.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_recovery_playbooks_approval_status'), 'recovery_playbooks', ['approval_status'], unique=False)
    op.create_index(op.f('ix_recovery_playbooks_is_demo'), 'recovery_playbooks', ['is_demo'], unique=False)
    op.create_index(op.f('ix_recovery_playbooks_is_enabled'), 'recovery_playbooks', ['is_enabled'], unique=False)
    op.create_index(op.f('ix_recovery_playbooks_name'), 'recovery_playbooks', ['name'], unique=False)
    op.create_index(op.f('ix_recovery_playbooks_pattern_id'), 'recovery_playbooks', ['pattern_id'], unique=False)
    op.create_index(op.f('ix_recovery_playbooks_pattern_ref'), 'recovery_playbooks', ['pattern_ref'], unique=False)
    op.create_index(op.f('ix_recovery_playbooks_playbook_id'), 'recovery_playbooks', ['playbook_id'], unique=True)

    op.create_table(
        'recovery_actions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('playbook_id', sa.Integer(), nullable=False),
        sa.Column('action_order', sa.Integer(), nullable=False),
        sa.Column('action_type', sa.String(length=50), nullable=False),
        sa.Column('parameters', sa.JSON(), nullable=False),
        sa.Column('risk_level', sa.String(length=20), nullable=False),
        sa.Column('preconditions', sa.JSON(), nullable=False),
        sa.Column('expected_outcome', sa.Text(), nullable=False),
        sa.Column('timeout_seconds', sa.Integer(), nullable=False),
        sa.Column('requires_approval', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['playbook_id'], ['recovery_playbooks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_recovery_actions_action_type'), 'recovery_actions', ['action_type'], unique=False)
    op.create_index(op.f('ix_recovery_actions_playbook_id'), 'recovery_actions', ['playbook_id'], unique=False)

    op.create_table(
        'recovery_executions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('execution_id', sa.String(length=64), nullable=False),
        sa.Column('playbook_id', sa.Integer(), nullable=False),
        sa.Column('incident_id', sa.Integer(), nullable=True),
        sa.Column('incident_ref', sa.String(length=64), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('is_simulation', sa.Boolean(), nullable=False),
        sa.Column('preconditions_evaluation', sa.JSON(), nullable=False),
        sa.Column('actions_attempted', sa.JSON(), nullable=False),
        sa.Column('result', sa.JSON(), nullable=False),
        sa.Column('verification_result', sa.JSON(), nullable=False),
        sa.Column('failure_details', sa.Text(), nullable=True),
        sa.Column('manual_intervention_required', sa.Boolean(), nullable=False),
        sa.Column('correlation_id', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['playbook_id'], ['recovery_playbooks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_recovery_executions_correlation_id'), 'recovery_executions', ['correlation_id'], unique=False)
    op.create_index(op.f('ix_recovery_executions_execution_id'), 'recovery_executions', ['execution_id'], unique=True)
    op.create_index(op.f('ix_recovery_executions_incident_id'), 'recovery_executions', ['incident_id'], unique=False)
    op.create_index(op.f('ix_recovery_executions_incident_ref'), 'recovery_executions', ['incident_ref'], unique=False)
    op.create_index(op.f('ix_recovery_executions_is_simulation'), 'recovery_executions', ['is_simulation'], unique=False)
    op.create_index(op.f('ix_recovery_executions_manual_intervention_required'), 'recovery_executions', ['manual_intervention_required'], unique=False)
    op.create_index(op.f('ix_recovery_executions_playbook_id'), 'recovery_executions', ['playbook_id'], unique=False)
    op.create_index(op.f('ix_recovery_executions_started_at'), 'recovery_executions', ['started_at'], unique=False)
    op.create_index(op.f('ix_recovery_executions_status'), 'recovery_executions', ['status'], unique=False)


def downgrade() -> None:
    op.drop_table('recovery_executions')
    op.drop_table('recovery_actions')
    op.drop_table('recovery_playbooks')
