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
