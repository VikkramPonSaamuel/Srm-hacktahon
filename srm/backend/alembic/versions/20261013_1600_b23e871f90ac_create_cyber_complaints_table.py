"""create_cyber_complaints_table

Revision ID: b23e871f90ac
Revises: f82c04d1a322
Create Date: 2026-10-13 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b23e871f90ac'
down_revision: Union[str, None] = 'f82c04d1a322'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cyber_complaints',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('complaint_id', sa.String(length=64), nullable=False),
        sa.Column('brand_id', sa.Integer(), nullable=False),
        sa.Column('brand_ref', sa.String(length=64), nullable=True),
        sa.Column('incident_id', sa.Integer(), nullable=True),
        sa.Column('incident_ref', sa.String(length=64), nullable=True),
        sa.Column('detection_id', sa.String(length=64), nullable=True),
        sa.Column('reporting_party_id', sa.String(length=100), nullable=False),
        sa.Column('reporting_party_name', sa.String(length=150), nullable=False),
        sa.Column('reporting_party_email', sa.String(length=255), nullable=True),
        sa.Column('suspected_domain', sa.String(length=255), nullable=False),
        sa.Column('suspected_url', sa.Text(), nullable=False),
        sa.Column('incident_description', sa.Text(), nullable=False),
        sa.Column('detection_timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('evidence_references', sa.JSON(), nullable=False),
        sa.Column('threat_assessment_summary', sa.JSON(), nullable=False),
        sa.Column('reporting_channel', sa.String(length=50), nullable=False),
        sa.Column('complaint_status', sa.String(length=30), nullable=False),
        sa.Column('submission_status', sa.String(length=30), nullable=False),
        sa.Column('narrative_sections', sa.JSON(), nullable=False),
        sa.Column('unsupported_allegations', sa.JSON(), nullable=False),
        sa.Column('missing_evidence', sa.JSON(), nullable=False),
        sa.Column('official_reference_number', sa.String(length=100), nullable=True),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('submitted_by', sa.String(length=100), nullable=True),
        sa.Column('submission_details', sa.JSON(), nullable=False),
        sa.Column('resolution_status', sa.String(length=30), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
        sa.Column('reviewed_by', sa.String(length=100), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['brand_id'], ['brand_profiles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cyber_complaints_complaint_id'), 'cyber_complaints', ['complaint_id'], unique=True)
    op.create_index(op.f('ix_cyber_complaints_brand_id'), 'cyber_complaints', ['brand_id'], unique=False)
    op.create_index(op.f('ix_cyber_complaints_brand_ref'), 'cyber_complaints', ['brand_ref'], unique=False)
    op.create_index(op.f('ix_cyber_complaints_incident_id'), 'cyber_complaints', ['incident_id'], unique=False)
    op.create_index(op.f('ix_cyber_complaints_incident_ref'), 'cyber_complaints', ['incident_ref'], unique=False)
    op.create_index(op.f('ix_cyber_complaints_detection_id'), 'cyber_complaints', ['detection_id'], unique=False)
    op.create_index(op.f('ix_cyber_complaints_reporting_party_id'), 'cyber_complaints', ['reporting_party_id'], unique=False)
    op.create_index(op.f('ix_cyber_complaints_suspected_domain'), 'cyber_complaints', ['suspected_domain'], unique=False)
    op.create_index(op.f('ix_cyber_complaints_reporting_channel'), 'cyber_complaints', ['reporting_channel'], unique=False)
    op.create_index(op.f('ix_cyber_complaints_complaint_status'), 'cyber_complaints', ['complaint_status'], unique=False)
    op.create_index(op.f('ix_cyber_complaints_submission_status'), 'cyber_complaints', ['submission_status'], unique=False)
    op.create_index(op.f('ix_cyber_complaints_official_reference_number'), 'cyber_complaints', ['official_reference_number'], unique=False)
    op.create_index(op.f('ix_cyber_complaints_resolution_status'), 'cyber_complaints', ['resolution_status'], unique=False)

    op.create_table(
        'complaint_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('event_id', sa.String(length=64), nullable=False),
        sa.Column('complaint_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('actor_id', sa.String(length=100), nullable=False),
        sa.Column('actor_role', sa.String(length=50), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('event_data', sa.JSON(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['complaint_id'], ['cyber_complaints.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_complaint_events_event_id'), 'complaint_events', ['event_id'], unique=True)
    op.create_index(op.f('ix_complaint_events_complaint_id'), 'complaint_events', ['complaint_id'], unique=False)
    op.create_index(op.f('ix_complaint_events_event_type'), 'complaint_events', ['event_type'], unique=False)
    op.create_index(op.f('ix_complaint_events_timestamp'), 'complaint_events', ['timestamp'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_complaint_events_timestamp'), table_name='complaint_events')
    op.drop_index(op.f('ix_complaint_events_event_type'), table_name='complaint_events')
    op.drop_index(op.f('ix_complaint_events_complaint_id'), table_name='complaint_events')
    op.drop_index(op.f('ix_complaint_events_event_id'), table_name='complaint_events')
    op.drop_table('complaint_events')

    op.drop_index(op.f('ix_cyber_complaints_resolution_status'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_official_reference_number'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_submission_status'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_complaint_status'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_reporting_channel'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_suspected_domain'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_reporting_party_id'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_detection_id'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_incident_ref'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_incident_id'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_brand_ref'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_brand_id'), table_name='cyber_complaints')
    op.drop_index(op.f('ix_cyber_complaints_complaint_id'), table_name='cyber_complaints')
    op.drop_table('cyber_complaints')
