"""add kb retrieval settings

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-04 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('knowledge_bases', sa.Column('retrieval_strategy', sa.String(), nullable=False, server_default='default'))
    op.add_column('knowledge_bases', sa.Column('retrieval_top_k', sa.Integer(), nullable=False, server_default='6'))
    op.add_column('knowledge_bases', sa.Column('retrieval_threshold', sa.Float(), nullable=False, server_default='0.3'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('knowledge_bases', 'retrieval_threshold')
    op.drop_column('knowledge_bases', 'retrieval_top_k')
    op.drop_column('knowledge_bases', 'retrieval_strategy')
