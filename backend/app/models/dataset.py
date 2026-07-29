from datetime import datetime

from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TZDateTime
from app.core.database import utcnow as _utcnow


class Dataset(Base):
    __tablename__ = "datasets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    format: Mapped[str] = mapped_column(String(50), nullable=False, default="qa_pairs")
    version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0")
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, default="upload")
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latest_version_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("dataset_versions.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=_utcnow, onupdate=_utcnow)

    items: Mapped[list["DatasetItem"]] = relationship(
        "DatasetItem", back_populates="dataset", cascade="all, delete-orphan", lazy="selectin"
    )
    versions: Mapped[list["DatasetVersion"]] = relationship(
        "DatasetVersion",
        back_populates="dataset",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
        foreign_keys="DatasetVersion.dataset_id",
    )


class DatasetItem(Base):
    __tablename__ = "dataset_items"

    dataset_id: Mapped[str] = mapped_column(String(36), ForeignKey("datasets.id"), nullable=False, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    expected_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    dataset: Mapped["Dataset"] = relationship("Dataset", back_populates="items")


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"

    dataset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    change_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    dataset: Mapped["Dataset"] = relationship("Dataset", back_populates="versions", foreign_keys=[dataset_id])
    version_items: Mapped[list["DatasetVersionItem"]] = relationship(
        "DatasetVersionItem",
        back_populates="version",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )


class DatasetVersionItem(Base):
    __tablename__ = "dataset_version_items"

    version_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    expected_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    version: Mapped["DatasetVersion"] = relationship("DatasetVersion", back_populates="version_items")
