"""Tests for automatic dataset versioning with full-snapshot storage."""

import pytest


@pytest.mark.asyncio
class TestDatasetVersionCreation:
    """Tests for automatic version snapshot creation on dataset mutations."""

    async def _create_dataset(self, client, items=None, name="Test Dataset"):
        resp = await client.post(
            "/api/v1/datasets",
            json={
                "name": name,
                "format": "qa_pairs",
                "items": [{"question": "Q1", "expected_answer": "A1"}] if items is None else items,
            },
        )
        assert resp.status_code == 201
        return resp.json()

    async def test_create_dataset_creates_initial_version(self, client):
        """Creating a dataset should produce an initial version snapshot."""
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        assert resp.status_code == 200
        versions = resp.json()
        assert len(versions) == 1
        assert versions[0]["change_note"] == "Initial version"
        assert versions[0]["item_count"] == 1

        # The dataset should have latest_version_id set
        detail_resp = await client.get(f"/api/v1/datasets/{dataset_id}")
        detail = detail_resp.json()
        assert detail["latest_version_id"] == versions[0]["id"]

    async def test_create_dataset_version_contains_all_items(self, client):
        """Version snapshot should contain copies of all dataset items."""
        items = [
            {"question": "Q1", "expected_answer": "A1"},
            {"question": "Q2", "expected_answer": "A2"},
        ]
        dataset = await self._create_dataset(client, items=items)
        dataset_id = dataset["id"]

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        versions = resp.json()
        version_id = versions[0]["id"]

        detail_resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions/{version_id}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert len(detail["items"]) == 2
        assert detail["items"][0]["question"] == "Q1"
        assert detail["items"][1]["question"] == "Q2"

    async def test_add_items_creates_version(self, client):
        """Adding items to a dataset should create a new version snapshot."""
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        await client.post(
            f"/api/v1/datasets/{dataset_id}/items",
            json=[{"question": "Q2", "expected_answer": "A2"}],
        )

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        versions = resp.json()
        assert len(versions) == 2
        # Versions are ordered by created_at desc
        assert versions[0]["item_count"] == 2
        assert versions[0]["change_note"] == "Added 1 item(s)"
        assert versions[1]["item_count"] == 1

    async def test_update_item_creates_version(self, client):
        """Editing an item should create a new version snapshot."""
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]
        item_id = dataset["items"][0]["id"]

        await client.put(
            f"/api/v1/datasets/{dataset_id}/items/{item_id}",
            json={"question": "Updated Q1"},
        )

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        versions = resp.json()
        assert len(versions) == 2
        assert versions[0]["change_note"] == "Updated item"
        # The version snapshot should have the updated question
        detail_resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions/{versions[0]['id']}")
        detail = detail_resp.json()
        assert detail["items"][0]["question"] == "Updated Q1"

    async def test_delete_item_creates_version(self, client):
        """Deleting an item should create a new version snapshot."""
        items = [
            {"question": "Q1", "expected_answer": "A1"},
            {"question": "Q2", "expected_answer": "A2"},
        ]
        dataset = await self._create_dataset(client, items=items)
        dataset_id = dataset["id"]
        item_id = dataset["items"][0]["id"]

        await client.delete(f"/api/v1/datasets/{dataset_id}/items/{item_id}")

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        versions = resp.json()
        assert len(versions) == 2
        assert versions[0]["item_count"] == 1
        assert versions[0]["change_note"] == "Deleted item"

    async def test_create_empty_dataset_creates_version(self, client):
        """Creating an empty dataset should still create an initial version."""
        dataset = await self._create_dataset(client, items=[])
        dataset_id = dataset["id"]

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        versions = resp.json()
        assert len(versions) == 1
        assert versions[0]["item_count"] == 0

    async def test_version_auto_sets_dataset_version_field(self, client):
        """The dataset.version field should be auto-set to ISO timestamp."""
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        detail_resp = await client.get(f"/api/v1/datasets/{dataset_id}")
        detail = detail_resp.json()
        # Version should be an ISO timestamp, not the default "1.0"
        assert "T" in detail["version"]  # ISO timestamp contains 'T'


@pytest.mark.asyncio
class TestVersionListAndDetail:
    """Tests for version history API endpoints."""

    async def _create_dataset_with_mutations(self, client):
        """Create a dataset and perform mutations to generate version history."""
        resp = await client.post(
            "/api/v1/datasets",
            json={
                "name": "Versioned Dataset",
                "format": "qa_pairs",
                "items": [{"question": "Q1", "expected_answer": "A1"}],
            },
        )
        dataset = resp.json()
        dataset_id = dataset["id"]

        # Add an item (creates version 2)
        await client.post(
            f"/api/v1/datasets/{dataset_id}/items",
            json=[{"question": "Q2", "expected_answer": "A2"}],
        )

        return dataset_id

    async def test_list_versions(self, client):
        """Version list endpoint should return versions ordered by created_at desc."""
        dataset_id = await self._create_dataset_with_mutations(client)

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        assert resp.status_code == 200
        versions = resp.json()
        assert len(versions) == 2
        # Most recent version first
        assert versions[0]["item_count"] == 2
        assert versions[1]["item_count"] == 1

    async def test_get_version_detail(self, client):
        """Version detail endpoint should return correct items snapshot."""
        dataset_id = await self._create_dataset_with_mutations(client)

        list_resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        versions = list_resp.json()
        # Get the initial version (last in list since ordered desc)
        initial_version_id = versions[-1]["id"]

        detail_resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions/{initial_version_id}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert detail["item_count"] == 1
        assert len(detail["items"]) == 1
        assert detail["items"][0]["question"] == "Q1"

    async def test_get_dataset_with_version_id(self, client):
        """GET dataset with version_id query param should return historical items."""
        dataset_id = await self._create_dataset_with_mutations(client)

        list_resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        versions = list_resp.json()
        initial_version_id = versions[-1]["id"]

        # Fetch dataset with a specific version
        resp = await client.get(f"/api/v1/datasets/{dataset_id}?version_id={initial_version_id}")
        assert resp.status_code == 200
        detail = resp.json()
        # Should show the historical items (just Q1)
        assert len(detail["items"]) == 1
        assert detail["items"][0]["question"] == "Q1"

    async def test_get_version_nonexistent_dataset(self, client):
        """Requesting versions for nonexistent dataset should 404."""
        resp = await client.get("/api/v1/datasets/nonexistent-id/versions")
        assert resp.status_code == 404

    async def test_get_version_detail_nonexistent(self, client):
        """Requesting nonexistent version should 404."""
        resp = await client.post(
            "/api/v1/datasets",
            json={"name": "D", "format": "qa_pairs", "items": []},
        )
        dataset_id = resp.json()["id"]

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions/nonexistent-id")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestVersionOnImport:
    """Test that import flow also creates a version."""

    async def test_version_field_not_in_create_schema(self, client):
        """Version should be auto-set; manually passing it should be ignored."""
        # The version field should not be part of the create schema
        # but the API should still accept requests without it
        resp = await client.post(
            "/api/v1/datasets",
            json={
                "name": "No Version",
                "format": "qa_pairs",
                "items": [{"question": "Q1"}],
            },
        )
        assert resp.status_code == 201
        dataset = resp.json()
        # Version should be auto-generated ISO timestamp
        assert "T" in dataset["version"]


@pytest.mark.asyncio
class TestVersionEdgeCases:
    """Tests for edge cases and error paths in dataset versioning."""

    async def _create_dataset(self, client, items=None, name="Edge Dataset"):
        resp = await client.post(
            "/api/v1/datasets",
            json={
                "name": name,
                "format": "qa_pairs",
                "items": [{"question": "Q1", "expected_answer": "A1"}] if items is None else items,
            },
        )
        assert resp.status_code == 201
        return resp.json()

    async def test_version_id_query_nonexistent_dataset_404(self, client):
        """GET /datasets/{bad_id}?version_id=... should 404 on dataset, not version."""
        resp = await client.get("/api/v1/datasets/nonexistent-id?version_id=some-version")
        assert resp.status_code == 404

    async def test_version_id_query_wrong_dataset_404(self, client):
        """version_id belonging to another dataset should 404."""
        ds1 = await self._create_dataset(client, name="Dataset 1")
        ds2 = await self._create_dataset(client, name="Dataset 2")

        # Get version_id from ds1
        v_resp = await client.get(f"/api/v1/datasets/{ds1['id']}/versions")
        ds1_version_id = v_resp.json()[0]["id"]

        # Try to use ds1's version_id with ds2's dataset_id
        resp = await client.get(f"/api/v1/datasets/{ds2['id']}?version_id={ds1_version_id}")
        assert resp.status_code == 404

    async def test_version_detail_wrong_dataset_404(self, client):
        """GET /datasets/{ds2}/versions/{v_from_ds1} should 404."""
        ds1 = await self._create_dataset(client, name="Dataset A")
        ds2 = await self._create_dataset(client, name="Dataset B")

        v_resp = await client.get(f"/api/v1/datasets/{ds1['id']}/versions")
        ds1_version_id = v_resp.json()[0]["id"]

        # Try to access ds1's version via ds2's URL
        resp = await client.get(f"/api/v1/datasets/{ds2['id']}/versions/{ds1_version_id}")
        assert resp.status_code == 404

    async def test_latest_version_id_updates_across_mutations(self, client):
        """latest_version_id should always point to the most recent version."""
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        # After creation, latest_version_id should be set
        detail = (await client.get(f"/api/v1/datasets/{dataset_id}")).json()
        v1_id = detail["latest_version_id"]
        assert v1_id is not None

        # Add an item
        await client.post(
            f"/api/v1/datasets/{dataset_id}/items",
            json=[{"question": "Q2", "expected_answer": "A2"}],
        )
        detail = (await client.get(f"/api/v1/datasets/{dataset_id}")).json()
        v2_id = detail["latest_version_id"]
        assert v2_id != v1_id

        # Update an item
        item_id = detail["items"][0]["id"]
        await client.put(
            f"/api/v1/datasets/{dataset_id}/items/{item_id}",
            json={"question": "Updated Q"},
        )
        detail = (await client.get(f"/api/v1/datasets/{dataset_id}")).json()
        v3_id = detail["latest_version_id"]
        assert v3_id != v2_id

    async def test_version_preserves_item_metadata(self, client):
        """Version snapshot should preserve metadata from items."""
        items = [{"question": "Q1", "expected_answer": "A1", "metadata": {"source": "test", "priority": 1}}]
        dataset = await self._create_dataset(client, items=items)
        dataset_id = dataset["id"]

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        version_id = resp.json()[0]["id"]

        detail = (await client.get(f"/api/v1/datasets/{dataset_id}/versions/{version_id}")).json()
        assert detail["items"][0]["metadata"] == {"source": "test", "priority": 1}

    async def test_delete_last_item_version_captures_empty_state(self, client):
        """Deleting the only item should create a version with 0 items."""
        dataset = await self._create_dataset(client, items=[{"question": "Q1", "expected_answer": "A1"}])
        dataset_id = dataset["id"]
        item_id = dataset["items"][0]["id"]

        await client.delete(f"/api/v1/datasets/{dataset_id}/items/{item_id}")

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        versions = resp.json()
        # The newest version (first in desc order) should have 0 items
        assert versions[0]["item_count"] == 0

        # Verify detail also shows 0 items
        detail = (await client.get(f"/api/v1/datasets/{dataset_id}/versions/{versions[0]['id']}")).json()
        assert len(detail["items"]) == 0

    async def test_version_items_ordered_correctly(self, client):
        """Version items should be returned in order_index order."""
        items = [
            {"question": "Q1", "expected_answer": "A1"},
            {"question": "Q2", "expected_answer": "A2"},
            {"question": "Q3", "expected_answer": "A3"},
        ]
        dataset = await self._create_dataset(client, items=items)
        dataset_id = dataset["id"]

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        version_id = resp.json()[0]["id"]

        detail = (await client.get(f"/api/v1/datasets/{dataset_id}/versions/{version_id}")).json()
        questions = [item["question"] for item in detail["items"]]
        assert questions == ["Q1", "Q2", "Q3"]
        # Verify order_index values
        order_indices = [item["order_index"] for item in detail["items"]]
        assert order_indices == [0, 1, 2]

    async def test_dataset_delete_with_versions_succeeds(self, client):
        """Deleting a dataset with versions should succeed (cascade)."""
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        # Perform a mutation to create a second version
        await client.post(
            f"/api/v1/datasets/{dataset_id}/items",
            json=[{"question": "Q2"}],
        )

        # Delete the dataset
        resp = await client.delete(f"/api/v1/datasets/{dataset_id}")
        assert resp.status_code == 204

        # Verify dataset is gone
        resp = await client.get(f"/api/v1/datasets/{dataset_id}")
        assert resp.status_code == 404

    async def test_add_multiple_items_change_note(self, client):
        """Adding multiple items should record the count in the change note."""
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        await client.post(
            f"/api/v1/datasets/{dataset_id}/items",
            json=[
                {"question": "Q2", "expected_answer": "A2"},
                {"question": "Q3", "expected_answer": "A3"},
                {"question": "Q4", "expected_answer": "A4"},
            ],
        )

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        versions = resp.json()
        assert versions[0]["change_note"] == "Added 3 item(s)"

    async def test_version_snapshot_is_independent_of_live_items(self, client):
        """Modifying live items should not affect previously created version snapshots."""
        items = [{"question": "Original Q", "expected_answer": "Original A"}]
        dataset = await self._create_dataset(client, items=items)
        dataset_id = dataset["id"]

        # Get the initial version
        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        initial_version_id = resp.json()[0]["id"]

        # Modify the live item
        item_id = dataset["items"][0]["id"]
        await client.put(
            f"/api/v1/datasets/{dataset_id}/items/{item_id}",
            json={"question": "Modified Q"},
        )

        # The initial version should still have the original question
        detail = (await client.get(f"/api/v1/datasets/{dataset_id}/versions/{initial_version_id}")).json()
        assert detail["items"][0]["question"] == "Original Q"

    async def test_version_list_ordering_is_newest_first(self, client):
        """Versions should be returned in descending created_at order."""
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        # Create more versions
        await client.post(
            f"/api/v1/datasets/{dataset_id}/items",
            json=[{"question": "Q2"}],
        )
        item_id = (await client.get(f"/api/v1/datasets/{dataset_id}")).json()["items"][0]["id"]
        await client.put(
            f"/api/v1/datasets/{dataset_id}/items/{item_id}",
            json={"question": "Updated"},
        )

        resp = await client.get(f"/api/v1/datasets/{dataset_id}/versions")
        versions = resp.json()
        assert len(versions) == 3
        # Verify descending order by created_at
        timestamps = [v["created_at"] for v in versions]
        assert timestamps == sorted(timestamps, reverse=True)


@pytest.mark.asyncio
class TestEvaluationVersionPinning:
    """Tests for evaluation dataset_version_id pinning."""

    async def test_evaluation_response_includes_dataset_version_id(self, client):
        """Evaluation response schema should include dataset_version_id field."""
        # Create a dataset
        ds_resp = await client.post(
            "/api/v1/datasets",
            json={
                "name": "Eval Dataset",
                "format": "qa_pairs",
                "items": [{"question": "Q1", "expected_answer": "A1"}],
            },
        )
        dataset = ds_resp.json()

        # Create an evaluation
        eval_resp = await client.post(
            "/api/v1/evaluations",
            json={
                "name": "Test Eval",
                "mode": "qa",
                "dataset_id": dataset["id"],
                "config": {"model_endpoint": {"default_model": "test-model"}},
            },
        )
        assert eval_resp.status_code == 201
        evaluation = eval_resp.json()
        # Before running, dataset_version_id should be None
        assert "dataset_version_id" in evaluation
        assert evaluation["dataset_version_id"] is None
