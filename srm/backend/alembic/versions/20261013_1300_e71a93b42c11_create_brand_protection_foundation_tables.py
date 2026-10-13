"""create_brand_protection_foundation_tables

Revision ID: e71a93b42c11
Revises: d58b29c1e7a4
Create Date: 2026-10-13 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e71a93b42c11'
down_revision: Union[str, None] = 'd58b29c1e7a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. brand_profiles
    op.create_table(
        'brand_profiles',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('brand_id', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('owner_id', sa.String(length=100), nullable=False),
        sa.Column('contact_email', sa.String(length=255), nullable=True),
        sa.Column('registration_status', sa.String(length=30), nullable=False),
        sa.Column('verification_status', sa.String(length=30), nullable=False),
        sa.Column('reviewed_by', sa.String(length=100), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_brand_profiles_brand_id'), 'brand_profiles', ['brand_id'], unique=True)
    op.create_index(op.f('ix_brand_profiles_name'), 'brand_profiles', ['name'], unique=False)
    op.create_index(op.f('ix_brand_profiles_owner_id'), 'brand_profiles', ['owner_id'], unique=False)
    op.create_index(op.f('ix_brand_profiles_registration_status'), 'brand_profiles', ['registration_status'], unique=False)
    op.create_index(op.f('ix_brand_profiles_verification_status'), 'brand_profiles', ['verification_status'], unique=False)
    op.create_index(op.f('ix_brand_profiles_is_demo'), 'brand_profiles', ['is_demo'], unique=False)

    # 2. official_domains
    op.create_table(
        'official_domains',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('domain_id', sa.String(length=64), nullable=False),
        sa.Column('brand_id', sa.Integer(), nullable=False),
        sa.Column('domain_name', sa.String(length=255), nullable=False),
        sa.Column('verification_status', sa.String(length=30), nullable=False),
        sa.Column('verification_method', sa.String(length=50), nullable=False),
        sa.Column('verification_token', sa.String(length=128), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['brand_id'], ['brand_profiles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_official_domains_domain_id'), 'official_domains', ['domain_id'], unique=True)
    op.create_index(op.f('ix_official_domains_brand_id'), 'official_domains', ['brand_id'], unique=False)
    op.create_index(op.f('ix_official_domains_domain_name'), 'official_domains', ['domain_name'], unique=False)
    op.create_index(op.f('ix_official_domains_verification_status'), 'official_domains', ['verification_status'], unique=False)
    op.create_index(op.f('ix_official_domains_is_active'), 'official_domains', ['is_active'], unique=False)

    # 3. brand_assets
    op.create_table(
        'brand_assets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('asset_id', sa.String(length=64), nullable=False),
        sa.Column('brand_id', sa.Integer(), nullable=False),
        sa.Column('asset_type', sa.String(length=50), nullable=False),
        sa.Column('storage_path', sa.String(length=500), nullable=False),
        sa.Column('file_hash', sa.String(length=64), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False),
        sa.Column('file_size_bytes', sa.Integer(), nullable=False),
        sa.Column('asset_metadata', sa.JSON(), nullable=False),
        sa.Column('verification_status', sa.String(length=30), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['brand_id'], ['brand_profiles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_brand_assets_asset_id'), 'brand_assets', ['asset_id'], unique=True)
    op.create_index(op.f('ix_brand_assets_brand_id'), 'brand_assets', ['brand_id'], unique=False)
    op.create_index(op.f('ix_brand_assets_asset_type'), 'brand_assets', ['asset_type'], unique=False)
    op.create_index(op.f('ix_brand_assets_verification_status'), 'brand_assets', ['verification_status'], unique=False)

    # 4. brand_verification_events
    op.create_table(
        'brand_verification_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('event_id', sa.String(length=64), nullable=False),
        sa.Column('brand_id', sa.Integer(), nullable=False),
        sa.Column('verification_action', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('sanitized_evidence', sa.JSON(), nullable=False),
        sa.Column('reviewed_by', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['brand_id'], ['brand_profiles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_brand_verification_events_event_id'), 'brand_verification_events', ['event_id'], unique=True)
    op.create_index(op.f('ix_brand_verification_events_brand_id'), 'brand_verification_events', ['brand_id'], unique=False)
    op.create_index(op.f('ix_brand_verification_events_verification_action'), 'brand_verification_events', ['verification_action'], unique=False)
    op.create_index(op.f('ix_brand_verification_events_timestamp'), 'brand_verification_events', ['timestamp'], unique=False)


def downgrade() -> None:
    # 4. brand_verification_events
    op.drop_index(op.f('ix_brand_verification_events_timestamp'), table_name='brand_verification_events')
    op.drop_index(op.f('ix_brand_verification_events_verification_action'), table_name='brand_verification_events')
    op.drop_index(op.f('ix_brand_verification_events_brand_id'), table_name='brand_verification_events')
    op.drop_index(op.f('ix_brand_verification_events_event_id'), table_name='brand_verification_events')
    op.drop_table('brand_verification_events')

    # 3. brand_assets
    op.drop_index(op.f('ix_brand_assets_verification_status'), table_name='brand_assets')
    op.drop_index(op.f('ix_brand_assets_asset_type'), table_name='brand_assets')
    op.drop_index(op.f('ix_brand_assets_brand_id'), table_name='brand_assets')
    op.drop_index(op.f('ix_brand_assets_asset_id'), table_name='brand_assets')
    op.drop_table('brand_assets')

    # 2. official_domains
    op.drop_index(op.f('ix_official_domains_is_active'), table_name='official_domains')
    op.drop_index(op.f('ix_official_domains_verification_status'), table_name='official_domains')
    op.drop_index(op.f('ix_official_domains_domain_name'), table_name='official_domains')
    op.drop_index(op.f('ix_official_domains_brand_id'), table_name='official_domains')
    op.drop_index(op.f('ix_official_domains_domain_id'), table_name='official_domains')
    op.drop_table('official_domains')

    # 1. brand_profiles
    op.drop_index(op.f('ix_brand_profiles_is_demo'), table_name='brand_profiles')
    op.drop_index(op.f('ix_brand_profiles_verification_status'), table_name='brand_profiles')
    op.drop_index(op.f('ix_brand_profiles_registration_status'), table_name='brand_profiles')
    op.drop_index(op.f('ix_brand_profiles_owner_id'), table_name='brand_profiles')
    op.drop_index(op.f('ix_brand_profiles_name'), table_name='brand_profiles')
    op.drop_index(op.f('ix_brand_profiles_brand_id'), table_name='brand_profiles')
    op.drop_table('brand_profiles')
