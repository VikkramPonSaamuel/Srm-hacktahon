"""create_incident_investigations_table

Revision ID: d58b29c1e7a4
Revises: c49a37e191d0
Create Date: 2026-10-13 12:06:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd58b29c1e7a4'
down_revision: Union[str, None] = 'c49a37e191d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'incident_investigations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('analysis_id', sa.String(length=64), nullable=False),
        sa.Column('incident_id', sa.Integer(), nullable=False),
        sa.Column('incident_ref', sa.String(length=64), nullable=False),
        sa.Column('analysis_mode', sa.String(length=30), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=True),
        sa.Column('model_name', sa.String(length=100), nullable=True),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('customer_impact', sa.Text(), nullable=False),
        sa.Column('failed_component', sa.String(length=100), nullable=True),
        sa.Column('failed_step', sa.String(length=100), nullable=True),
        sa.Column('root_cause_hypothesis', sa.Text(), nullable=False),
        sa.Column('alternative_explanations', sa.JSON(), nullable=False),
        sa.Column('confidence_score', sa.Float(), nullable=False),
        sa.Column('evidence_assessment', sa.String(length=50), nullable=False),
        sa.Column('human_investigation_required', sa.Boolean(), nullable=False),
        sa.Column('recommended_playbook_id', sa.String(length=64), nullable=True),
        sa.Column('recommended_action', sa.String(length=100), nullable=True),
        sa.Column('playbook_eligibility', sa.JSON(), nullable=False),
        sa.Column('evidence_references', sa.JSON(), nullable=False),
        sa.Column('related_incident_ids', sa.JSON(), nullable=False),
        sa.Column('matching_pattern_ids', sa.JSON(), nullable=False),
        sa.Column('raw_model_response', sa.JSON(), nullable=True),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_incident_investigations_analysis_id'), 'incident_investigations', ['analysis_id'], unique=True)
    op.create_index(op.f('ix_incident_investigations_incident_id'), 'incident_investigations', ['incident_id'], unique=False)
    op.create_index(op.f('ix_incident_investigations_incident_ref'), 'incident_investigations', ['incident_ref'], unique=False)
    op.create_index(op.f('ix_incident_investigations_analysis_mode'), 'incident_investigations', ['analysis_mode'], unique=False)
    op.create_index(op.f('ix_incident_investigations_human_investigation_required'), 'incident_investigations', ['human_investigation_required'], unique=False)
    op.create_index(op.f('ix_incident_investigations_recommended_playbook_id'), 'incident_investigations', ['recommended_playbook_id'], unique=False)
    op.create_index(op.f('ix_incident_investigations_is_demo'), 'incident_investigations', ['is_demo'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_incident_investigations_is_demo'), table_name='incident_investigations')
    op.drop_index(op.f('ix_incident_investigations_recommended_playbook_id'), table_name='incident_investigations')
    op.drop_index(op.f('ix_incident_investigations_human_investigation_required'), table_name='incident_investigations')
    op.drop_index(op.f('ix_incident_investigations_analysis_mode'), table_name='incident_investigations')
    op.drop_index(op.f('ix_incident_investigations_incident_ref'), table_name='incident_investigations')
    op.drop_index(op.f('ix_incident_investigations_incident_id'), table_name='incident_investigations')
    op.drop_index(op.f('ix_incident_investigations_analysis_id'), table_name='incident_investigations')
    op.drop_table('incident_investigations')
