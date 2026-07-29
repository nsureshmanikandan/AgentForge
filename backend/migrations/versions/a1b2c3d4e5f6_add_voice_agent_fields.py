"""add voice agent fields to agents table

Revision ID: a1b2c3d4e5f6
Revises: e3f4a5b6c7d8
Create Date: 2026-07-29 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    existing = [r[0] for r in bind.execute(sa.text(
        "SELECT column_name FROM information_schema.columns WHERE table_name='agents'"
    ))]

    if 'is_voice_agent' not in existing:
        op.add_column('agents',
            sa.Column('is_voice_agent', sa.Boolean(), nullable=True, server_default='false'))

    if 'voice_config' not in existing:
        op.add_column('agents',
            sa.Column('voice_config', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('agents', 'voice_config')
    op.drop_column('agents', 'is_voice_agent')
