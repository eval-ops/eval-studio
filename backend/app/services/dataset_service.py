"""Shared helpers for creating datasets and building detail responses."""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import iso_now
from app.core.exceptions import NotFoundException
from app.models.dataset import Dataset, DatasetItem, DatasetVersion, DatasetVersionItem
from app.schemas.dataset import (
    DatasetDetailResponse,
    DatasetItemCreate,
    DatasetItemResponse,
    DatasetItemUpdate,
)


async def create_version_snapshot(
    db: AsyncSession,
    dataset: Dataset,
    items: list[DatasetItem],
    change_note: str | None = None,
) -> DatasetVersion:
    """Create a full-snapshot version of the dataset's current items.

    1. Creates a DatasetVersion row.
    2. Copies all items into DatasetVersionItem rows (full snapshot).
    3. Updates dataset.latest_version_id and dataset.version (ISO timestamp).
    """
    version = DatasetVersion(
        dataset_id=dataset.id,
        item_count=len(items),
        change_note=change_note,
    )
    db.add(version)
    await db.flush()  # Generate version.id and version.created_at

    for item in items:
        vi = DatasetVersionItem(
            version_id=version.id,
            question=item.question,
            expected_answer=item.expected_answer,
            metadata_=item.metadata_,
            order_index=item.order_index,
        )
        db.add(vi)

    dataset.latest_version_id = version.id
    dataset.version = version.created_at.isoformat() if version.created_at else iso_now()

    return version


async def create_dataset_with_items(
    db: AsyncSession,
    *,
    name: str,
    description: str | None,
    format: str,
    tags: list[str],
    source_type: str,
    items: list[dict[str, Any]],
) -> tuple[Dataset, list[DatasetItem]]:
    """Create a Dataset row with its DatasetItem rows and commit."""
    dataset = Dataset(
        name=name,
        description=description,
        format=format,
        version="pending",  # Will be overwritten by snapshot
        tags=tags,
        source_type=source_type,
        item_count=len(items),
    )
    db.add(dataset)
    await db.flush()

    db_items: list[DatasetItem] = []
    for idx, item_data in enumerate(items):
        db_item = DatasetItem(
            dataset_id=dataset.id,
            question=item_data["question"],
            expected_answer=item_data.get("expected_answer"),
            metadata_=item_data.get("metadata"),
            order_index=idx,
        )
        db.add(db_item)
        db_items.append(db_item)

    await db.flush()

    await create_version_snapshot(db, dataset, db_items, change_note="Initial version")

    await db.commit()
    await db.refresh(dataset)
    return dataset, db_items


def to_detail_response(dataset: Dataset, items: list[DatasetItem]) -> DatasetDetailResponse:
    """Build a DatasetDetailResponse from ORM objects."""
    return DatasetDetailResponse(
        id=dataset.id,
        name=dataset.name,
        description=dataset.description,
        format=dataset.format,
        version=dataset.version,
        tags=dataset.tags or [],
        source_type=dataset.source_type,
        item_count=dataset.item_count,
        latest_version_id=dataset.latest_version_id,
        created_at=dataset.created_at,
        updated_at=dataset.updated_at,
        items=[
            DatasetItemResponse(
                id=item.id,
                question=item.question,
                expected_answer=item.expected_answer,
                metadata=item.metadata_,
                order_index=item.order_index,
            )
            for item in items
        ],
    )


def to_detail_response_from_version(
    dataset: Dataset,
    version_items: list[DatasetVersionItem],
) -> DatasetDetailResponse:
    """Build a DatasetDetailResponse using items from a specific version snapshot."""
    return DatasetDetailResponse(
        id=dataset.id,
        name=dataset.name,
        description=dataset.description,
        format=dataset.format,
        version=dataset.version,
        tags=dataset.tags or [],
        source_type=dataset.source_type,
        item_count=len(version_items),
        latest_version_id=dataset.latest_version_id,
        created_at=dataset.created_at,
        updated_at=dataset.updated_at,
        items=[
            DatasetItemResponse(
                id=vi.id,
                question=vi.question,
                expected_answer=vi.expected_answer,
                metadata=vi.metadata_,
                order_index=vi.order_index,
            )
            for vi in version_items
        ],
    )


async def _get_dataset_or_raise(db: AsyncSession, dataset_id: str) -> Dataset:
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise NotFoundException("Dataset", dataset_id)
    return dataset


async def _get_item_or_raise(db: AsyncSession, dataset_id: str, item_id: str) -> DatasetItem:
    result = await db.execute(
        select(DatasetItem).where(DatasetItem.id == item_id, DatasetItem.dataset_id == dataset_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundException("DatasetItem", item_id)
    return item


async def _get_all_items(db: AsyncSession, dataset_id: str) -> list[DatasetItem]:
    """Fetch all current items for a dataset, ordered by order_index."""
    result = await db.execute(
        select(DatasetItem).where(DatasetItem.dataset_id == dataset_id).order_by(DatasetItem.order_index)
    )
    return list(result.scalars().all())


async def add_items_to_dataset(db: AsyncSession, dataset_id: str, items: list[DatasetItemCreate]) -> list[DatasetItem]:
    dataset = await _get_dataset_or_raise(db, dataset_id)

    max_idx_result = await db.execute(
        select(func.coalesce(func.max(DatasetItem.order_index), -1)).where(DatasetItem.dataset_id == dataset_id)
    )
    current_max = max_idx_result.scalar_one()

    db_items: list[DatasetItem] = []
    for offset, item_data in enumerate(items):
        db_item = DatasetItem(
            dataset_id=dataset_id,
            question=item_data.question,
            expected_answer=item_data.expected_answer,
            metadata_=item_data.metadata,
            order_index=current_max + 1 + offset,
        )
        db.add(db_item)
        db_items.append(db_item)

    dataset.item_count += len(items)
    await db.flush()

    # Create version snapshot with all current items
    all_items = await _get_all_items(db, dataset_id)
    await create_version_snapshot(db, dataset, all_items, change_note=f"Added {len(items)} item(s)")

    await db.commit()

    for item in db_items:
        await db.refresh(item)

    return db_items


async def update_dataset_item(
    db: AsyncSession, dataset_id: str, item_id: str, payload: DatasetItemUpdate
) -> DatasetItem:
    dataset = await _get_dataset_or_raise(db, dataset_id)
    item = await _get_item_or_raise(db, dataset_id, item_id)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "metadata":
            item.metadata_ = value
        else:
            setattr(item, field, value)

    await db.flush()

    # Create version snapshot with all current items
    all_items = await _get_all_items(db, dataset_id)
    await create_version_snapshot(db, dataset, all_items, change_note="Updated item")

    await db.commit()
    await db.refresh(item)
    return item


async def delete_dataset_item(db: AsyncSession, dataset_id: str, item_id: str) -> None:
    dataset = await _get_dataset_or_raise(db, dataset_id)
    item = await _get_item_or_raise(db, dataset_id, item_id)

    await db.delete(item)
    dataset.item_count -= 1
    await db.flush()

    # Create version snapshot with remaining items
    all_items = await _get_all_items(db, dataset_id)
    await create_version_snapshot(db, dataset, all_items, change_note="Deleted item")

    await db.commit()
