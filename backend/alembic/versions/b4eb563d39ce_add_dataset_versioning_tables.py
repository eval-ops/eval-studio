"""add dataset versioning tables

Revision ID: b4eb563d39ce
Revises: ac7b4c2df9b6
Create Date: 2026-07-29 15:11:22.385562

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4eb563d39ce"
down_revision: str | None = "ac7b4c2df9b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dataset_versions",
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.Column("item_count", sa.Integer(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("dataset_versions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_dataset_versions_dataset_id"), ["dataset_id"], unique=False)

    op.create_table(
        "dataset_version_items",
        sa.Column("version_id", sa.String(length=36), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("expected_answer", sa.Text(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["version_id"], ["dataset_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("dataset_version_items", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_dataset_version_items_version_id"), ["version_id"], unique=False)

    with op.batch_alter_table("datasets", schema=None) as batch_op:
        batch_op.add_column(sa.Column("latest_version_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key(
            "fk_datasets_latest_version_id", "dataset_versions", ["latest_version_id"], ["id"], ondelete="SET NULL"
        )

    with op.batch_alter_table("evaluations", schema=None) as batch_op:
        batch_op.add_column(sa.Column("dataset_version_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key(
            "fk_evaluations_dataset_version_id", "dataset_versions", ["dataset_version_id"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    with op.batch_alter_table("evaluations", schema=None) as batch_op:
        batch_op.drop_constraint("fk_evaluations_dataset_version_id", type_="foreignkey")
        batch_op.drop_column("dataset_version_id")

    with op.batch_alter_table("datasets", schema=None) as batch_op:
        batch_op.drop_constraint("fk_datasets_latest_version_id", type_="foreignkey")
        batch_op.drop_column("latest_version_id")

    with op.batch_alter_table("dataset_version_items", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_dataset_version_items_version_id"))

    op.drop_table("dataset_version_items")
    with op.batch_alter_table("dataset_versions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_dataset_versions_dataset_id"))

    op.drop_table("dataset_versions")
