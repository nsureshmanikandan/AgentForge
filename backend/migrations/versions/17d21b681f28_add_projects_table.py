"""add projects table

Revision ID: 17d21b681f28
Revises: bf36fbece89c
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '17d21b681f28'
down_revision: Union[str, None] = 'bf36fbece89c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('projects',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('owner_id', sa.String(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('summary', sa.String(), nullable=False),
    sa.Column('original_prompt', sa.Text(), nullable=False),
    sa.Column('plan', sa.JSON(), nullable=False),
    sa.Column('ui_html', sa.Text(), nullable=False),
    sa.Column('files', sa.JSON(), nullable=False),
    sa.Column('chat_history', sa.JSON(), nullable=False),
    sa.Column('app_type', sa.String(), nullable=False),
    sa.Column('visibility', sa.String(), nullable=False),
    sa.Column('shared_with', sa.JSON(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_projects_owner_id'), 'projects', ['owner_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_projects_owner_id'), table_name='projects')
    op.drop_table('projects')
