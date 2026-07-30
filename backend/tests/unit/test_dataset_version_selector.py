"""Tests for dataset version selection in evaluation creation and runner."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.base import Score
from app.core.providers import ProviderProfile, provider_registry
from app.models.dataset import Dataset, DatasetItem, DatasetVersion, DatasetVersionItem
from app.models.evaluation import Evaluation
from app.schemas.evaluation import EvaluationCreate
from app.services.eval_runner import run_evaluation


@pytest.fixture(autouse=True)
def _register_test_judge_provider():
    provider_registry._items["__test__"] = ProviderProfile(
        id="__test__",
        name="Test Judge",
        default_model="test-judge-model",
    )
    yield
    provider_registry._items.pop("__test__", None)


@pytest.fixture
async def dataset_with_versions(db_session: AsyncSession):
    """Create a dataset with live items and a versioned snapshot."""
    dataset = Dataset(name="versioned-ds", item_count=2)
    db_session.add(dataset)
    await db_session.flush()

    live_items = [
        DatasetItem(
            dataset_id=dataset.id,
            question="Live Q1",
            expected_answer="Live A1",
            order_index=0,
        ),
        DatasetItem(
            dataset_id=dataset.id,
            question="Live Q2",
            expected_answer="Live A2",
            order_index=1,
        ),
    ]
    for item in live_items:
        db_session.add(item)
    await db_session.flush()

    version = DatasetVersion(
        dataset_id=dataset.id,
        change_note="Snapshot v1",
        item_count=2,
    )
    db_session.add(version)
    await db_session.flush()

    version_items = [
        DatasetVersionItem(
            version_id=version.id,
            question="Versioned Q1",
            expected_answer="Versioned A1",
            order_index=0,
        ),
        DatasetVersionItem(
            version_id=version.id,
            question="Versioned Q2",
            expected_answer="Versioned A2",
            order_index=1,
        ),
    ]
    for vi in version_items:
        db_session.add(vi)

    dataset.latest_version_id = version.id
    await db_session.commit()

    return dataset, live_items, version, version_items


@pytest.fixture
async def dataset_without_versions(db_session: AsyncSession):
    """Create a dataset with live items but no versioned snapshots."""
    dataset = Dataset(name="no-version-ds", item_count=2)
    db_session.add(dataset)
    await db_session.flush()

    live_items = [
        DatasetItem(
            dataset_id=dataset.id,
            question="Live Q1",
            expected_answer="Live A1",
            order_index=0,
        ),
        DatasetItem(
            dataset_id=dataset.id,
            question="Live Q2",
            expected_answer="Live A2",
            order_index=1,
        ),
    ]
    for item in live_items:
        db_session.add(item)
    await db_session.commit()

    return dataset, live_items


class TestEvaluationCreateSchema:
    """Tests for dataset_version_id field on EvaluationCreate schema."""

    def test_create_schema_accepts_dataset_version_id(self):
        schema = EvaluationCreate(
            name="Test",
            mode="qa",
            dataset_id="ds-123",
            dataset_version_id="ver-456",
            config={},
        )
        assert schema.dataset_version_id == "ver-456"

    def test_create_schema_version_id_defaults_to_none(self):
        schema = EvaluationCreate(
            name="Test",
            mode="qa",
            dataset_id="ds-123",
            config={},
        )
        assert schema.dataset_version_id is None

    def test_create_schema_without_version_backward_compat(self):
        schema = EvaluationCreate(
            name="Test",
            mode="qa",
            config={},
        )
        assert schema.dataset_version_id is None
        assert schema.dataset_id is None


@pytest.mark.asyncio
class TestCreateEvaluationWithVersion:
    """Tests for creating evaluations with dataset_version_id via API."""

    async def test_create_evaluation_with_valid_version(self, client, dataset_with_versions):
        dataset, _, version, _ = dataset_with_versions

        resp = await client.post(
            "/api/v1/evaluations",
            json={
                "name": "Versioned eval",
                "mode": "qa",
                "dataset_id": dataset.id,
                "dataset_version_id": version.id,
                "config": {},
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["dataset_version_id"] == version.id

    async def test_create_evaluation_with_invalid_version(self, client, dataset_with_versions):
        """Version ID that doesn't belong to the specified dataset should fail."""
        dataset, _, _, _ = dataset_with_versions

        # Create a second dataset with its own version
        resp = await client.post(
            "/api/v1/datasets",
            json={
                "name": "Other dataset",
                "format": "qa_pairs",
                "items": [{"question": "Q", "expected_answer": "A"}],
            },
        )
        other_dataset = resp.json()

        versions_resp = await client.get(f"/api/v1/datasets/{other_dataset['id']}/versions")
        other_version_id = versions_resp.json()[0]["id"]

        # Try to use the other dataset's version with the first dataset
        resp = await client.post(
            "/api/v1/evaluations",
            json={
                "name": "Bad version eval",
                "mode": "qa",
                "dataset_id": dataset.id,
                "dataset_version_id": other_version_id,
                "config": {},
            },
        )
        assert resp.status_code == 422

    async def test_create_evaluation_with_nonexistent_version(self, client, dataset_with_versions):
        dataset, _, _, _ = dataset_with_versions

        resp = await client.post(
            "/api/v1/evaluations",
            json={
                "name": "Nonexistent version eval",
                "mode": "qa",
                "dataset_id": dataset.id,
                "dataset_version_id": "nonexistent-version-id",
                "config": {},
            },
        )
        assert resp.status_code == 422

    async def test_create_evaluation_without_version_backward_compat(self, client, dataset_with_versions):
        dataset, _, _, _ = dataset_with_versions

        resp = await client.post(
            "/api/v1/evaluations",
            json={
                "name": "No version eval",
                "mode": "qa",
                "dataset_id": dataset.id,
                "config": {},
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["dataset_version_id"] is None


@pytest.mark.asyncio
class TestEvalRunnerVersionItems:
    """Tests for eval runner loading items from versioned snapshots."""

    async def test_eval_runner_loads_version_items_when_specified(
        self, db_session: AsyncSession, dataset_with_versions
    ):
        """When dataset_version_id is set at creation, items come from DatasetVersionItem."""
        dataset, _, version, _version_items = dataset_with_versions

        evaluation = Evaluation(
            name="version eval",
            mode="qa",
            status="pending",
            dataset_id=dataset.id,
            dataset_version_id=version.id,
            config={
                "model_endpoint": {"default_model": "test-model"},
                "judge_config": {"provider_id": "__test__"},
            },
        )
        db_session.add(evaluation)
        await db_session.commit()

        captured_questions = []

        async def mock_call_model(resolved, question, **kwargs):
            captured_questions.append(question)
            return "Model answer"

        mock_evaluate_qa = AsyncMock(return_value=Score(value=0.9, passed=True, reasoning="Good"))

        with (
            patch("app.services.eval_runner.call_model", side_effect=mock_call_model),
            patch("app.adapters.litellm_judge.LiteLLMJudgeAdapter.evaluate_qa", mock_evaluate_qa),
            patch("app.services.eval_runner.broadcast_progress", new_callable=AsyncMock),
        ):
            await run_evaluation(evaluation.id, db_session)

        result = await db_session.execute(select(Evaluation).where(Evaluation.id == evaluation.id))
        eval_obj = result.scalar_one()
        assert eval_obj.status == "completed"
        assert eval_obj.dataset_version_id == version.id

        # The runner should have used VERSIONED questions, not live ones
        assert "Versioned Q1" in captured_questions
        assert "Versioned Q2" in captured_questions
        assert "Live Q1" not in captured_questions
        assert "Live Q2" not in captured_questions

    async def test_eval_runner_auto_pins_latest_version(self, db_session: AsyncSession, dataset_with_versions):
        """When no version specified but versions exist, auto-pins latest version."""
        dataset, _, version, _ = dataset_with_versions

        evaluation = Evaluation(
            name="auto-pin eval",
            mode="qa",
            status="pending",
            dataset_id=dataset.id,
            dataset_version_id=None,
            config={
                "model_endpoint": {"default_model": "test-model"},
                "judge_config": {"provider_id": "__test__"},
            },
        )
        db_session.add(evaluation)
        await db_session.commit()

        captured_questions = []

        async def mock_call_model(resolved, question, **kwargs):
            captured_questions.append(question)
            return "Model answer"

        mock_evaluate_qa = AsyncMock(return_value=Score(value=0.9, passed=True, reasoning="Good"))

        with (
            patch("app.services.eval_runner.call_model", side_effect=mock_call_model),
            patch("app.adapters.litellm_judge.LiteLLMJudgeAdapter.evaluate_qa", mock_evaluate_qa),
            patch("app.services.eval_runner.broadcast_progress", new_callable=AsyncMock),
        ):
            await run_evaluation(evaluation.id, db_session)

        result = await db_session.execute(select(Evaluation).where(Evaluation.id == evaluation.id))
        eval_obj = result.scalar_one()
        assert eval_obj.status == "completed"
        assert eval_obj.dataset_version_id == version.id

        # Should use versioned items since auto-pinned
        assert "Versioned Q1" in captured_questions
        assert "Versioned Q2" in captured_questions

    async def test_eval_runner_falls_back_to_live_items(self, db_session: AsyncSession, dataset_without_versions):
        """When no version specified and no versions exist, uses live items."""
        dataset, _live_items = dataset_without_versions

        evaluation = Evaluation(
            name="live items eval",
            mode="qa",
            status="pending",
            dataset_id=dataset.id,
            config={
                "model_endpoint": {"default_model": "test-model"},
                "judge_config": {"provider_id": "__test__"},
            },
        )
        db_session.add(evaluation)
        await db_session.commit()

        captured_questions = []

        async def mock_call_model(resolved, question, **kwargs):
            captured_questions.append(question)
            return "Model answer"

        mock_evaluate_qa = AsyncMock(return_value=Score(value=0.9, passed=True, reasoning="Good"))

        with (
            patch("app.services.eval_runner.call_model", side_effect=mock_call_model),
            patch("app.adapters.litellm_judge.LiteLLMJudgeAdapter.evaluate_qa", mock_evaluate_qa),
            patch("app.services.eval_runner.broadcast_progress", new_callable=AsyncMock),
        ):
            await run_evaluation(evaluation.id, db_session)

        result = await db_session.execute(select(Evaluation).where(Evaluation.id == evaluation.id))
        eval_obj = result.scalar_one()
        assert eval_obj.status == "completed"
        assert eval_obj.dataset_version_id is None

        assert "Live Q1" in captured_questions
        assert "Live Q2" in captured_questions


@pytest.mark.asyncio
class TestEvaluationResponseVersionSummary:
    """Tests for dataset_version info in evaluation responses."""

    async def test_evaluation_response_includes_version_summary(self, client, dataset_with_versions):
        dataset, _, version, _ = dataset_with_versions

        resp = await client.post(
            "/api/v1/evaluations",
            json={
                "name": "Versioned eval",
                "mode": "qa",
                "dataset_id": dataset.id,
                "dataset_version_id": version.id,
                "config": {},
            },
        )
        assert resp.status_code == 201
        eval_data = resp.json()
        eval_id = eval_data["id"]

        detail_resp = await client.get(f"/api/v1/evaluations/{eval_id}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert detail["dataset_version"] is not None
        assert detail["dataset_version"]["id"] == version.id
        assert detail["dataset_version"]["change_note"] == "Snapshot v1"
        assert detail["dataset_version"]["item_count"] == 2

    async def test_evaluation_response_no_version_returns_null(self, client, dataset_with_versions):
        dataset, _, _, _ = dataset_with_versions

        resp = await client.post(
            "/api/v1/evaluations",
            json={
                "name": "No version eval",
                "mode": "qa",
                "dataset_id": dataset.id,
                "config": {},
            },
        )
        assert resp.status_code == 201
        eval_data = resp.json()
        eval_id = eval_data["id"]

        detail_resp = await client.get(f"/api/v1/evaluations/{eval_id}")
        detail = detail_resp.json()
        assert detail["dataset_version"] is None


@pytest.mark.asyncio
class TestComparisonVersionInfo:
    """Tests for version info in comparison responses."""

    async def test_comparison_includes_version_info(self, client, dataset_with_versions):
        dataset, _, version, _ = dataset_with_versions

        eval_ids = []
        for i in range(2):
            resp = await client.post(
                "/api/v1/evaluations",
                json={
                    "name": f"Compare eval {i}",
                    "mode": "qa",
                    "dataset_id": dataset.id,
                    "dataset_version_id": version.id,
                    "config": {},
                },
            )
            assert resp.status_code == 201
            eval_ids.append(resp.json()["id"])

        params = "&".join(f"evaluation_id={eid}" for eid in eval_ids)
        resp = await client.get(f"/api/v1/results/compare?{params}")
        assert resp.status_code == 200
        data = resp.json()

        for eval_item in data["evaluations"]:
            assert "dataset_version_id" in eval_item
            assert eval_item["dataset_version_id"] == version.id
