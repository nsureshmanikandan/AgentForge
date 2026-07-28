"""add knowledge graph tables

Revision ID: e3f4a5b6c7d8
Revises: 7ddae7dfdd05
Create Date: 2026-07-28 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = '7ddae7dfdd05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # Add kb_type only if it doesn't already exist
    cols = [r[0] for r in bind.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='knowledge_bases' AND column_name='kb_type'"
    ))]
    if not cols:
        op.add_column('knowledge_bases',
            sa.Column('kb_type', sa.String(), nullable=False, server_default='basic')
        )

    # Create graph_entities only if it doesn't already exist
    exists = bind.execute(sa.text("SELECT to_regclass('graph_entities')")).scalar()
    if not exists:
        op.create_table('graph_entities',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('kb_id', sa.String(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('entity_type', sa.String(), nullable=False, server_default='CONCEPT'),
            sa.Column('description', sa.Text(), nullable=False, server_default=''),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['kb_id'], ['knowledge_bases.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    # Create graph_relationships only if it doesn't already exist
    exists = bind.execute(sa.text("SELECT to_regclass('graph_relationships')")).scalar()
    if not exists:
        op.create_table('graph_relationships',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('kb_id', sa.String(), nullable=False),
            sa.Column('source_id', sa.String(), nullable=False),
            sa.Column('target_id', sa.String(), nullable=False),
            sa.Column('relation_type', sa.String(), nullable=False),
            sa.Column('context', sa.Text(), nullable=False, server_default=''),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['kb_id'], ['knowledge_bases.id']),
            sa.ForeignKeyConstraint(['source_id'], ['graph_entities.id']),
            sa.ForeignKeyConstraint(['target_id'], ['graph_entities.id']),
            sa.PrimaryKeyConstraint('id'),
        )


def downgrade() -> None:
    op.drop_table('graph_relationships')
    op.drop_table('graph_entities')
    op.drop_column('knowledge_bases', 'kb_type')
