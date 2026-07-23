import asyncio
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["SHIPSTATION_WEBHOOK_SECRET"] = "test_secret_token"
# Deliberately leave API credentials unset so fetch_resource is skipped in the
# endpoint tests (no network). fetch_resource is unit-tested separately below.
os.environ.pop("SHIPSTATION_API_KEY", None)
os.environ.pop("SHIPSTATION_API_SECRET", None)

from main import app, verify_token, fetch_resource

client = TestClient(app)

RESOURCE_URL = "https://ssapi.shipstation.com/orders?importBatch=abc-123"
TOKEN = os.environ["SHIPSTATION_WEBHOOK_SECRET"]

EVENTS = [
    "ORDER_NOTIFY",
    "ITEM_ORDER_NOTIFY",
    "SHIP_NOTIFY",
    "ITEM_SHIP_NOTIFY",
    "FULFILLMENT_SHIPPED",
    "FULFILLMENT_REJECTED",
]


def body(resource_type: str, resource_url: str = RESOURCE_URL) -> str:
    return json.dumps({"resource_url": resource_url, "resource_type": resource_type})


class TestShipStationWebhook:
    def test_missing_token_returns_401(self):
        response = client.post(
            "/webhooks/shipstation",
            content=body("SHIP_NOTIFY"),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    def test_wrong_token_returns_401(self):
        response = client.post(
            "/webhooks/shipstation?token=nope",
            content=body("SHIP_NOTIFY"),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    def test_missing_fields_returns_400(self):
        response = client.post(
            f"/webhooks/shipstation?token={TOKEN}",
            content=json.dumps({"foo": "bar"}),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_valid_request_returns_200(self):
        response = client.post(
            f"/webhooks/shipstation?token={TOKEN}",
            content=body("ORDER_NOTIFY"),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_all_six_event_types(self):
        for event in EVENTS:
            response = client.post(
                f"/webhooks/shipstation?token={TOKEN}",
                content=body(event),
                headers={"Content-Type": "application/json"},
            )
            assert response.status_code == 200, f"Failed for event: {event}"


class TestVerifyToken:
    def test_matching_token(self):
        assert verify_token("test_secret_token", "test_secret_token") is True

    def test_wrong_token(self):
        assert verify_token("nope", "test_secret_token") is False

    def test_missing_token(self):
        assert verify_token(None, "test_secret_token") is False
        assert verify_token("", "test_secret_token") is False

    def test_missing_secret(self):
        assert verify_token("anything", None) is False


class TestFetchResource:
    def test_returns_none_without_credentials(self):
        # Credentials are unset in this test module
        assert asyncio.run(fetch_resource(RESOURCE_URL)) is None

    def test_refuses_non_shipstation_host(self, monkeypatch):
        monkeypatch.setenv("SHIPSTATION_API_KEY", "key")
        monkeypatch.setenv("SHIPSTATION_API_SECRET", "secret")
        with pytest.raises(ValueError, match="non-ShipStation host"):
            asyncio.run(fetch_resource("https://evil.example.com/steal"))

    def test_allows_numbered_shipstation_host(self, monkeypatch):
        # Real V1 resource_url hosts are numbered (ssapi2.shipstation.com) and
        # must pass the SSRF guard rather than being rejected.
        monkeypatch.setenv("SHIPSTATION_API_KEY", "key")
        monkeypatch.setenv("SHIPSTATION_API_SECRET", "secret")

        called = {}

        class FakeResponse:
            status_code = 200
            headers: dict = {}

            def raise_for_status(self):
                pass

            def json(self):
                return {"orders": [{"orderId": 123}]}

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def get(self, url, auth=None):
                called["url"] = url
                return FakeResponse()

        monkeypatch.setattr("main.httpx.AsyncClient", lambda: FakeClient())

        numbered_url = "https://ssapi2.shipstation.com/orders?importBatch=abc-123"
        result = asyncio.run(fetch_resource(numbered_url))
        assert result == {"orders": [{"orderId": 123}]}
        assert called["url"] == numbered_url


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
