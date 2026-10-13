"""create_website_threat_detection_tables

Revision ID: c34f982a10bd
Revises: b23e871f90ac
Create Date: 2026-10-13 18:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c34f982a10bd'
down_revision: Union[str, None] = 'b23e871f90ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'security_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('event_id', sa.String(length=64), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('source_integration', sa.String(length=50), nullable=False),
        sa.Column('service_name', sa.String(length=100), nullable=False),
        sa.Column('http_method', sa.String(length=10), nullable=False),
        sa.Column('endpoint', sa.String(length=255), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=False),
        sa.Column('event_category', sa.String(length=50), nullable=False),
        sa.Column('rule_id', sa.String(length=100), nullable=True),
        sa.Column('client_ip', sa.String(length=64), nullable=False),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('request_indicators', sa.JSON(), nullable=False),
        sa.Column('auth_outcome', sa.String(length=20), nullable=False),
        sa.Column('action_taken', sa.String(length=30), nullable=False),
        sa.Column('correlation_id', sa.String(length=64), nullable=True),
        sa.Column('environment', sa.String(length=30), nullable=False),
        sa.Column('provenance', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_security_events_event_id'), 'security_events', ['event_id'], unique=True)
    op.create_index(op.f('ix_security_events_timestamp'), 'security_events', ['timestamp'], unique=False)
    op.create_index(op.f('ix_security_events_source_integration'), 'security_events', ['source_integration'], unique=False)
    op.create_index(op.f('ix_security_events_service_name'), 'security_events', ['service_name'], unique=False)
    op.create_index(op.f('ix_security_events_endpoint'), 'security_events', ['endpoint'], unique=False)
    op.create_index(op.f('ix_security_events_status_code'), 'security_events', ['status_code'], unique=False)
    op.create_index(op.f('ix_security_events_event_category'), 'security_events', ['event_category'], unique=False)
    op.create_index(op.f('ix_security_events_client_ip'), 'security_events', ['client_ip'], unique=False)
    op.create_index(op.f('ix_security_events_auth_outcome'), 'security_events', ['auth_outcome'], unique=False)
    op.create_index(op.f('ix_security_events_action_taken'), 'security_events', ['action_taken'], unique=False)
    op.create_index(op.f('ix_security_events_correlation_id'), 'security_events', ['correlation_id'], unique=False)

    op.create_table(
        'detected_website_threats',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('threat_id', sa.String(length=64), nullable=False),
        sa.Column('threat_category', sa.String(length=50), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False),
        sa.Column('risk_score', sa.Float(), nullable=False),
        sa.Column('detection_rule_id', sa.String(length=100), nullable=False),
        sa.Column('rule_name', sa.String(length=150), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('service_name', sa.String(length=100), nullable=False),
        sa.Column('endpoint', sa.String(length=255), nullable=False),
        sa.Column('client_ip', sa.String(length=64), nullable=True),
        sa.Column('first_observed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_observed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('correlated_event_count', sa.Integer(), nullable=False),
        sa.Column('confidence_score', sa.Float(), nullable=False),
        sa.Column('evidence_quality', sa.String(length=30), nullable=False),
        sa.Column('recommended_response', sa.String(length=50), nullable=False),
        sa.Column('requires_human_review', sa.Boolean(), nullable=False),
        sa.Column('evidence_references', sa.JSON(), nullable=False),
        sa.Column('detection_reasons', sa.JSON(), nullable=False),
        sa.Column('incident_id', sa.Integer(), nullable=True),
        sa.Column('incident_ref', sa.String(length=64), nullable=True),
        sa.Column('correlation_id', sa.String(length=64), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
        sa.Column('reviewed_by', sa.String(length=100), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['incident_id'], ['incidents.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_detected_website_threats_threat_id'), 'detected_website_threats', ['threat_id'], unique=True)
    op.create_index(op.f('ix_detected_website_threats_threat_category'), 'detected_website_threats', ['threat_category'], unique=False)
    op.create_index(op.f('ix_detected_website_threats_severity'), 'detected_website_threats', ['severity'], unique=False)
    op.create_index(op.f('ix_detected_website_threats_detection_rule_id'), 'detected_website_threats', ['detection_rule_id'], unique=False)
    op.create_index(op.f('ix_detected_website_threats_status'), 'detected_website_threats', ['status'], unique=False)
    op.create_index(op.f('ix_detected_website_threats_service_name'), 'detected_website_threats', ['service_name'], unique=False)
    op.create_index(op.f('ix_detected_website_threats_endpoint'), 'detected_website_threats', ['endpoint'], unique=False)
    op.create_index(op.f('ix_detected_website_threats_client_ip'), 'detected_website_threats', ['client_ip'], unique=False)
    op.create_index(op.f('ix_detected_website_threats_first_observed_at'), 'detected_website_threats', ['first_observed_at'], unique=False)
    op.create_index(op.f('ix_detected_website_threats_last_observed_at'), 'detected_website_threats', ['last_observed_at'], unique=False)
    op.create_index(op.f('ix_detected_website_threats_incident_id'), 'detected_website_threats', ['incident_id'], unique=False)
    op.create_index(op.f('ix_detected_website_threats_correlation_id'), 'detected_website_threats', ['correlation_id'], unique=False)

    op.create_table(
        'threat_detection_rules',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('rule_id', sa.String(length=100), nullable=False),
        sa.Column('rule_name', sa.String(length=150), nullable=False),
        sa.Column('threat_category', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False),
        sa.Column('threshold_count', sa.Integer(), nullable=False),
        sa.Column('time_window_seconds', sa.Integer(), nullable=False),
        sa.Column('config_parameters', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_threat_detection_rules_rule_id'), 'threat_detection_rules', ['rule_id'], unique=True)
    op.create_index(op.f('ix_threat_detection_rules_threat_category'), 'threat_detection_rules', ['threat_category'], unique=False)
    op.create_index(op.f('ix_threat_detection_rules_is_enabled'), 'threat_detection_rules', ['is_enabled'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_threat_detection_rules_is_enabled'), table_name='threat_detection_rules')
    op.drop_index(op.f('ix_threat_detection_rules_threat_category'), table_name='threat_detection_rules')
    op.drop_index(op.f('ix_threat_detection_rules_rule_id'), table_name='threat_detection_rules')
    op.drop_table('threat_detection_rules')

    op.drop_index(op.f('ix_detected_website_threats_correlation_id'), table_name='detected_website_threats')
    op.drop_index(op.f('ix_detected_website_threats_incident_id'), table_name='detected_website_threats')
    op.drop_index(op.f('ix_detected_website_threats_last_observed_at'), table_name='detected_website_threats')
    op.drop_index(op.f('ix_detected_website_threats_first_observed_at'), table_name='detected_website_threats')
    op.drop_index(op.f('ix_detected_website_threats_client_ip'), table_name='detected_website_threats')
    op.drop_index(op.f('ix_detected_website_threats_endpoint'), table_name='detected_website_threats')
    op.drop_index(op.f('ix_detected_website_threats_service_name'), table_name='detected_website_threats')
    op.drop_index(op.f('ix_detected_website_threats_status'), table_name='detected_website_threats')
    op.drop_index(op.f('ix_detected_website_threats_detection_rule_id'), table_name='detected_website_threats')
    op.drop_index(op.f('ix_detected_website_threats_severity'), table_name='detected_website_threats')
    op.drop_index(op.f('ix_detected_website_threats_threat_category'), table_name='detected_website_threats')
    op.drop_index(op.f('ix_detected_website_threats_threat_id'), table_name='detected_website_threats')
    op.drop_table('detected_website_threats')

    op.drop_index(op.f('ix_security_events_correlation_id'), table_name='security_events')
    op.drop_index(op.f('ix_security_events_action_taken'), table_name='security_events')
    op.drop_index(op.f('ix_security_events_auth_outcome'), table_name='security_events')
    op.drop_index(op.f('ix_security_events_client_ip'), table_name='security_events')
    op.drop_index(op.f('ix_security_events_event_category'), table_name='security_events')
    op.drop_index(op.f('ix_security_events_status_code'), table_name='security_events')
    op.drop_index(op.f('ix_security_events_endpoint'), table_name='security_events')
    op.drop_index(op.f('ix_security_events_service_name'), table_name='security_events')
    op.drop_index(op.f('ix_security_events_source_integration'), table_name='security_events')
    op.drop_index(op.f('ix_security_events_timestamp'), table_name='security_events')
    op.drop_index(op.f('ix_security_events_event_id'), table_name='security_events')
    op.drop_table('security_events')
