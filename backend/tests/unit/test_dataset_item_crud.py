"""Tests for dataset item-level CRUD endpoints."""

import pytest


@pytest.mark.asyncio
class TestAddItems:
    """Tests for POST /api/v1/datasets/{id}/items."""

    async def _create_dataset(self, client, items=None):
        resp = await client.post(
            "/api/v1/datasets",
            json={
                "name": "Test Dataset",
                "format": "qa_pairs",
                "items": [{"question": "Q1", "expected_answer": "A1"}] if items is None else items,
            },
        )
        assert resp.status_code == 201
        return resp.json()

    async def test_add_single_item(self, client):
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        resp = await client.post(
            f"/api/v1/datasets/{dataset_id}/items",
            json=[{"question": "Q2", "expected_answer": "A2"}],
        )
        assert resp.status_code == 201
        body = resp.json()
        assert len(body) == 1
        assert body[0]["question"] == "Q2"
        assert body[0]["expected_answer"] == "A2"
        assert body[0]["order_index"] == 1

    async def test_add_multiple_items(self, client):
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        resp = await client.post(
            f"/api/v1/datasets/{dataset_id}/items",
            json=[
                {"question": "Q2", "expected_answer": "A2"},
                {"question": "Q3"},
            ],
        )
        assert resp.status_code == 201
        body = resp.json()
        assert len(body) == 2
        assert body[0]["order_index"] == 1
        assert body[1]["order_index"] == 2

    async def test_add_items_updates_item_count(self, client):
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]
        assert dataset["item_count"] == 1

        await client.post(
            f"/api/v1/datasets/{dataset_id}/items",
            json=[{"question": "Q2"}, {"question": "Q3"}],
        )

        resp = await client.get(f"/api/v1/datasets/{dataset_id}")
        assert resp.status_code == 200
        assert resp.json()["item_count"] == 3

    async def test_add_items_to_empty_dataset(self, client):
        dataset = await self._create_dataset(client, items=[])
        dataset_id = dataset["id"]
        assert dataset["item_count"] == 0

        resp = await client.post(
            f"/api/v1/datasets/{dataset_id}/items",
            json=[{"question": "Q1", "expected_answer": "A1"}],
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body[0]["order_index"] == 0

    async def test_add_items_to_nonexistent_dataset(self, client):
        resp = await client.post(
            "/api/v1/datasets/nonexistent-id/items",
            json=[{"question": "Q1"}],
        )
        assert resp.status_code == 404

    async def test_add_item_with_metadata(self, client):
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        resp = await client.post(
            f"/api/v1/datasets/{dataset_id}/items",
            json=[{"question": "Q2", "metadata": {"source": "manual"}}],
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body[0]["metadata"] == {"source": "manual"}


@pytest.mark.asyncio
class TestUpdateItem:
    """Tests for PUT /api/v1/datasets/{id}/items/{item_id}."""

    async def _create_dataset(self, client):
        resp = await client.post(
            "/api/v1/datasets",
            json={
                "name": "Test Dataset",
                "format": "qa_pairs",
                "items": [
                    {"question": "Q1", "expected_answer": "A1"},
                    {"question": "Q2", "expected_answer": "A2"},
                ],
            },
        )
        assert resp.status_code == 201
        return resp.json()

    async def test_update_question_and_answer(self, client):
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]
        item_id = dataset["items"][0]["id"]

        resp = await client.put(
            f"/api/v1/datasets/{dataset_id}/items/{item_id}",
            json={"question": "Updated Q", "expected_answer": "Updated A"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["question"] == "Updated Q"
        assert body["expected_answer"] == "Updated A"

    async def test_partial_update_question_only(self, client):
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]
        item_id = dataset["items"][0]["id"]

        resp = await client.put(
            f"/api/v1/datasets/{dataset_id}/items/{item_id}",
            json={"question": "New Q"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["question"] == "New Q"
        assert body["expected_answer"] == "A1"

    async def test_partial_update_answer_only(self, client):
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]
        item_id = dataset["items"][0]["id"]

        resp = await client.put(
            f"/api/v1/datasets/{dataset_id}/items/{item_id}",
            json={"expected_answer": "New A"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["question"] == "Q1"
        assert body["expected_answer"] == "New A"

    async def test_update_nonexistent_item(self, client):
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        resp = await client.put(
            f"/api/v1/datasets/{dataset_id}/items/nonexistent-id",
            json={"question": "Updated"},
        )
        assert resp.status_code == 404

    async def test_update_item_wrong_dataset(self, client):
        dataset1 = await self._create_dataset(client)
        resp2 = await client.post(
            "/api/v1/datasets",
            json={
                "name": "Other Dataset",
                "format": "qa_pairs",
                "items": [{"question": "OQ1"}],
            },
        )
        dataset2 = resp2.json()
        item_from_d2 = dataset2["items"][0]["id"]

        resp = await client.put(
            f"/api/v1/datasets/{dataset1['id']}/items/{item_from_d2}",
            json={"question": "Hijack"},
        )
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestDeleteItem:
    """Tests for DELETE /api/v1/datasets/{id}/items/{item_id}."""

    async def _create_dataset(self, client):
        resp = await client.post(
            "/api/v1/datasets",
            json={
                "name": "Test Dataset",
                "format": "qa_pairs",
                "items": [
                    {"question": "Q1", "expected_answer": "A1"},
                    {"question": "Q2", "expected_answer": "A2"},
                ],
            },
        )
        assert resp.status_code == 201
        return resp.json()

    async def test_delete_item(self, client):
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]
        item_id = dataset["items"][0]["id"]

        resp = await client.delete(f"/api/v1/datasets/{dataset_id}/items/{item_id}")
        assert resp.status_code == 204

    async def test_delete_item_decrements_count(self, client):
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]
        item_id = dataset["items"][0]["id"]
        assert dataset["item_count"] == 2

        await client.delete(f"/api/v1/datasets/{dataset_id}/items/{item_id}")

        resp = await client.get(f"/api/v1/datasets/{dataset_id}")
        assert resp.json()["item_count"] == 1

    async def test_delete_nonexistent_item(self, client):
        dataset = await self._create_dataset(client)
        dataset_id = dataset["id"]

        resp = await client.delete(f"/api/v1/datasets/{dataset_id}/items/nonexistent-id")
        assert resp.status_code == 404

    async def test_delete_item_wrong_dataset(self, client):
        dataset1 = await self._create_dataset(client)
        resp2 = await client.post(
            "/api/v1/datasets",
            json={
                "name": "Other Dataset",
                "format": "qa_pairs",
                "items": [{"question": "OQ1"}],
            },
        )
        dataset2 = resp2.json()
        item_from_d2 = dataset2["items"][0]["id"]

        resp = await client.delete(f"/api/v1/datasets/{dataset1['id']}/items/{item_from_d2}")
        assert resp.status_code == 404
