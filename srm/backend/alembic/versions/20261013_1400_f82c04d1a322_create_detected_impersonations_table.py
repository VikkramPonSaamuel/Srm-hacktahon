"""create_detected_impersonations_table

Revision ID: f82c04d1a322
Revises: e71a93b42c11
Create Date: 2026-10-13 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f82c04d1a322'
down_revision: Union[str, None] = 'e71a93b42c11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'detected_impersonations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('detection_id', sa.String(length=64), nullable=False),
        sa.Column('brand_id', sa.Integer(), nullable=False),
        sa.Column('incident_id', sa.Integer(), nullable=True),
        sa.Column('incident_ref', sa.String(length=64), nullable=True),
        sa.Column('suspicious_url', sa.Text(), nullable=False),
        sa.Column('suspicious_domain', sa.String(length=255), nullable=False),
        sa.Column('intake_source', sa.String(length=50), nullable=False),
        sa.Column('attack_vector', sa.String(length=50), nullable=False),
        sa.Column('risk_score', sa.Float(), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False),
        sa.Column('confidence_score', sa.Float(), nullable=False),
        sa.Column('evidence_quality', sa.String(length=30), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('detection_reasons', sa.JSON(), nullable=False),
        sa.Column('evidence_references', sa.JSON(), nullable=False),
        sa.Column('missing_evidence', sa.JSON(), nullable=False),
        sa.Column('review_recommendation', sa.String(length=50), nullable=False),
        sa.Column('reviewed_by', sa.String(length=100), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
        sa.Column('correlation_id', sa.String(length=64), nullable=True),
        sa.Column('first_detected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_analyzed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['brand_id'], ['brand_profiles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_detected_impersonations_detection_id'), 'detected_impersonations', ['detection_id'], unique=True)
    op.create_index(op.f('ix_detected_impersonations_brand_id'), 'detected_impersonations', ['brand_id'], unique=False)
    op.create_index(op.f('ix_detected_impersonations_incident_id'), 'detected_impersonations', ['incident_id'], unique=False)
    op.create_index(op.f('ix_detected_impersonations_incident_ref'), 'detected_impersonations', ['incident_ref'], unique=False)
    op.create_index(op.f('ix_detected_impersonations_suspicious_domain'), 'detected_impersonations', ['suspicious_domain'], unique=False)
    op.create_index(op.f('ix_detected_impersonations_intake_source'), 'detected_impersonations', ['intake_source'], unique=False)
    op.create_index(op.f('ix_detected_impersonations_attack_vector'), 'detected_impersonations', ['attack_vector'], unique=False)
    op.create_index(op.f('ix_detected_impersonations_severity'), 'detected_impersonations', ['severity'], unique=False)
    op.create_index(op.f('ix_detected_impersonations_status'), 'detected_impersonations', ['status'], unique=False)
    op.create_index(op.f('ix_detected_impersonations_correlation_id'), 'detected_impersonations', ['correlation_id'], unique=False)
    op.create_index(op.f('ix_detected_impersonations_first_detected_at'), 'detected_impersonations', ['first_detected_at'], unique=False)
    op.create_index(op.f('ix_detected_impersonations_is_demo'), 'detected_impersonations', ['is_demo'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_detected_impersonations_is_demo'), table_name='detected_impersonations')
    op.drop_index(op.f('ix_detected_impersonations_first_detected_at'), table_name='detected_impersonations')
    op.drop_index(op.f('ix_detected_impersonations_correlation_id'), table_name='detected_impersonations')
    op.drop_index(op.f('ix_detected_impersonations_status'), table_name='detected_impersonations')
    op.drop_index(op.f('ix_detected_impersonations_severity'), table_name='detected_impersonations')
    op.drop_index(op.f('ix_detected_impersonations_attack_vector'), table_name='detected_impersonations')
    op.drop_index(op.f('ix_detected_impersonations_intake_source'), table_name='detected_impersonations')
    op.drop_index(op.f('ix_detected_impersonations_suspicious_domain'), table_name='detected_impersonations')
    op.drop_index(op.f('ix_detected_impersonations_incident_ref'), table_name='detected_impersonations')
    op.drop_index(op.f('ix_detected_impersonations_incident_id'), table_name='detected_impersonations')
    op.drop_index(op.f('ix_detected_impersonations_brand_id'), table_name='detected_impersonations')
    op.drop_index(op.f('ix_detected_impersonations_detection_id'), table_name='detected_impersonations')
    op.drop_table('detected_impersonations')
