import math

import structlog
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ConflictException, NotFoundException
from app.core.security import require_auth
from app.models.dataset import Dataset, DatasetVersion, DatasetVersionItem
from app.models.evaluation import Evaluation
from app.schemas.common import PaginatedResponse
from app.schemas.dataset import (
    DatasetCreate,
    DatasetDetailResponse,
    DatasetItemCreate,
    DatasetItemResponse,
    DatasetItemUpdate,
    DatasetResponse,
    DatasetUpdate,
    DatasetVersionDetailResponse,
    DatasetVersionItemResponse,
    DatasetVersionResponse,
)
from app.services.dataset_service import (
    add_items_to_dataset,
    create_dataset_with_items,
    delete_dataset_item,
    to_detail_response,
    to_detail_response_from_version,
    update_dataset_item,
)

logger = structlog.get_logger()

router = APIRouter(prefix="/datasets", tags=["datasets"], dependencies=[Depends(require_auth)])


@router.post("", response_model=DatasetDetailResponse, status_code=201)
async def create_dataset(payload: DatasetCreate, db: AsyncSession = Depends(get_db)) -> DatasetDetailResponse:
    """Create a new dataset with optional items."""
    items_data = [
        {"question": item.question, "expected_answer": item.expected_answer, "metadata": item.metadata}
        for item in payload.items
    ]
    dataset, db_items = await create_dataset_with_items(
        db,
        name=payload.name,
        description=payload.description,
        format=payload.format,
        tags=payload.tags,
        source_type="upload",
        items=items_data,
    )
    logger.info("dataset.created", id=dataset.id, name=dataset.name, item_count=len(payload.items))
    return to_detail_response(dataset, db_items)


@router.get("", response_model=PaginatedResponse[DatasetResponse])
async def list_datasets(
    page: int = 1,
    page_size: int = 20,
    name: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[DatasetResponse]:
    """List datasets with pagination and optional name filter."""
    query = select(Dataset)
    count_query = select(sa_func.count(Dataset.id))

    if name:
        query = query.where(Dataset.name.ilike(f"%{name}%"))
        count_query = count_query.where(Dataset.name.ilike(f"%{name}%"))

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    query = query.offset((page - 1) * page_size).limit(page_size).order_by(Dataset.created_at.desc())
    result = await db.execute(query)
    datasets = result.scalars().all()

    return PaginatedResponse[DatasetResponse](
        items=[DatasetResponse.model_validate(d) for d in datasets],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.get("/{dataset_id}", response_model=DatasetDetailResponse)
async def get_dataset(
    dataset_id: str,
    version_id: str | None = Query(default=None, description="Return items from a specific version snapshot"),
    db: AsyncSession = Depends(get_db),
) -> DatasetDetailResponse:
    """Get a dataset by ID with all its items.

    If version_id is provided, returns items from that historical version snapshot
    instead of the current live items.
    """
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise NotFoundException("Dataset", dataset_id)

    if version_id:
        # Return items from the specified version
        version_result = await db.execute(
            select(DatasetVersion).where(
                DatasetVersion.id == version_id,
                DatasetVersion.dataset_id == dataset_id,
            )
        )
        version = version_result.scalar_one_or_none()
        if not version:
            raise NotFoundException("DatasetVersion", version_id)

        vi_result = await db.execute(
            select(DatasetVersionItem)
            .where(DatasetVersionItem.version_id == version_id)
            .order_by(DatasetVersionItem.order_index)
        )
        version_items = list(vi_result.scalars().all())
        return to_detail_response_from_version(dataset, version_items)

    return to_detail_response(dataset, sorted(dataset.items, key=lambda i: i.order_index))


@router.put("/{dataset_id}", response_model=DatasetResponse)
async def update_dataset(
    dataset_id: str, payload: DatasetUpdate, db: AsyncSession = Depends(get_db)
) -> DatasetResponse:
    """Update dataset metadata (does not modify items)."""
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise NotFoundException("Dataset", dataset_id)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(dataset, field, value)

    await db.commit()
    await db.refresh(dataset)
    logger.info("dataset.updated", id=dataset_id)
    return DatasetResponse.model_validate(dataset)


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    """Delete a dataset and all its items."""
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise NotFoundException("Dataset", dataset_id)

    ref_result = await db.execute(select(sa_func.count(Evaluation.id)).where(Evaluation.dataset_id == dataset_id))
    ref_count = ref_result.scalar_one()
    if ref_count > 0:
        raise ConflictException(
            f"Cannot delete dataset: {ref_count} evaluation(s) reference it. "
            "Delete or reassign those evaluations first."
        )

    # Clear latest_version_id FK before cascade-deleting versions
    dataset.latest_version_id = None
    await db.flush()

    await db.delete(dataset)
    await db.commit()
    logger.info("dataset.deleted", id=dataset_id)
    return Response(status_code=204)


@router.post(
    "/{dataset_id}/items",
    response_model=list[DatasetItemResponse],
    status_code=201,
)
async def add_items(
    dataset_id: str,
    items: list[DatasetItemCreate],
    db: AsyncSession = Depends(get_db),
) -> list[DatasetItemResponse]:
    db_items = await add_items_to_dataset(db, dataset_id, items)
    logger.info("dataset.items_added", dataset_id=dataset_id, count=len(items))
    return [
        DatasetItemResponse(
            id=item.id,
            question=item.question,
            expected_answer=item.expected_answer,
            metadata=item.metadata_,
            order_index=item.order_index,
        )
        for item in db_items
    ]


@router.put(
    "/{dataset_id}/items/{item_id}",
    response_model=DatasetItemResponse,
)
async def update_item(
    dataset_id: str,
    item_id: str,
    payload: DatasetItemUpdate,
    db: AsyncSession = Depends(get_db),
) -> DatasetItemResponse:
    item = await update_dataset_item(db, dataset_id, item_id, payload)
    logger.info("dataset.item_updated", dataset_id=dataset_id, item_id=item_id)
    return DatasetItemResponse(
        id=item.id,
        question=item.question,
        expected_answer=item.expected_answer,
        metadata=item.metadata_,
        order_index=item.order_index,
    )


@router.delete("/{dataset_id}/items/{item_id}", status_code=204)
async def delete_item(
    dataset_id: str,
    item_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    await delete_dataset_item(db, dataset_id, item_id)
    logger.info("dataset.item_deleted", dataset_id=dataset_id, item_id=item_id)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Version history endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{dataset_id}/versions",
    response_model=list[DatasetVersionResponse],
)
async def list_versions(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[DatasetVersionResponse]:
    """List all version snapshots for a dataset, newest first."""
    # Verify dataset exists
    ds_result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    if not ds_result.scalar_one_or_none():
        raise NotFoundException("Dataset", dataset_id)

    result = await db.execute(
        select(DatasetVersion).where(DatasetVersion.dataset_id == dataset_id).order_by(DatasetVersion.created_at.desc())
    )
    versions = result.scalars().all()
    return [DatasetVersionResponse.model_validate(v) for v in versions]


@router.get(
    "/{dataset_id}/versions/{version_id}",
    response_model=DatasetVersionDetailResponse,
)
async def get_version_detail(
    dataset_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
) -> DatasetVersionDetailResponse:
    """Get a version snapshot with its items."""
    version_result = await db.execute(
        select(DatasetVersion).where(
            DatasetVersion.id == version_id,
            DatasetVersion.dataset_id == dataset_id,
        )
    )
    version = version_result.scalar_one_or_none()
    if not version:
        raise NotFoundException("DatasetVersion", version_id)

    vi_result = await db.execute(
        select(DatasetVersionItem)
        .where(DatasetVersionItem.version_id == version_id)
        .order_by(DatasetVersionItem.order_index)
    )
    version_items = vi_result.scalars().all()

    return DatasetVersionDetailResponse(
        id=version.id,
        dataset_id=version.dataset_id,
        created_at=version.created_at,
        change_note=version.change_note,
        item_count=version.item_count,
        items=[
            DatasetVersionItemResponse(
                id=vi.id,
                question=vi.question,
                expected_answer=vi.expected_answer,
                metadata=vi.metadata_,
                order_index=vi.order_index,
            )
            for vi in version_items
        ],
    )
