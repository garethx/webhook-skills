import os
import hmac
import hashlib
import json

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["EXACT_WEBHOOK_SECRET"] = "test_exact_webhook_secret"

from main import app, verify_exact_webhook

client = TestClient(app)

SECRET = os.environ["EXACT_WEBHOOK_SECRET"]

SAMPLE_CONTENT = {
    "Topic": "Accounts",
    "Action": "Update",
    "Key": "d4d4c8b6-1a2b-4c3d-9e8f-1234567890ab",
    "Division": 123456,
    "ClientId": "0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
}


def build_webhook(content: dict, secret: str = SECRET) -> str:
    """Build a valid Exact Online webhook body for a given Content object.

    The HashCode is HMAC-SHA256 over the exact raw JSON substring of Content.
    """
    content_json = json.dumps(content)
    hash_code = hmac.new(
        secret.encode("utf-8"),
        content_json.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest().upper()
    return f'{{"Content":{content_json},"HashCode":"{hash_code}"}}'


class TestVerifyExactWebhook:
    """Tests for the HashCode verification function."""

    def test_valid_hashcode_returns_true(self):
        body = build_webhook(SAMPLE_CONTENT).encode("utf-8")
        assert verify_exact_webhook(body, SECRET) is True

    def test_tampered_content_returns_false(self):
        body = build_webhook(SAMPLE_CONTENT).replace("Update", "Delete").encode("utf-8")
        assert verify_exact_webhook(body, SECRET) is False

    def test_wrong_secret_returns_false(self):
        body = build_webhook(SAMPLE_CONTENT).encode("utf-8")
        assert verify_exact_webhook(body, "wrong_secret") is False

    def test_missing_hashcode_returns_false(self):
        content_json = json.dumps(SAMPLE_CONTENT)
        body = f'{{"Content":{content_json}}}'.encode("utf-8")
        assert verify_exact_webhook(body, SECRET) is False

    def test_lowercase_hex_hashcode_accepted(self):
        content_json = json.dumps(SAMPLE_CONTENT)
        hash_code = hmac.new(
            SECRET.encode("utf-8"),
            content_json.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()  # lowercase
        body = f'{{"Content":{content_json},"HashCode":"{hash_code}"}}'.encode("utf-8")
        assert verify_exact_webhook(body, SECRET) is True


class TestExactWebhookEndpoint:
    """Tests for the webhook endpoint."""

    def _post(self, body: str):
        return client.post(
            "/webhooks/exact-online",
            content=body,
            headers={"Content-Type": "application/json"},
        )

    def test_valid_signature_returns_200(self):
        response = self._post(build_webhook(SAMPLE_CONTENT))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_invalid_signature_returns_401(self):
        content_json = json.dumps(SAMPLE_CONTENT)
        body = f'{{"Content":{content_json},"HashCode":"DEADBEEF"}}'
        response = self._post(body)
        assert response.status_code == 401

    def test_tampered_payload_returns_401(self):
        body = build_webhook(SAMPLE_CONTENT).replace("Accounts", "Items")
        response = self._post(body)
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "topic",
        [
            "Accounts",
            "Items",
            "StockPositions",
            "FinancialTransactions",
            "GoodsDeliveries",
            "Contacts",
        ],
    )
    def test_handles_each_topic(self, topic):
        content = {**SAMPLE_CONTENT, "Topic": topic}
        response = self._post(build_webhook(content))
        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

def test_empty_post_is_acknowledged():
    """Exact validates the callback URL on subscription creation with an empty
    POST. Rejecting it can leave the subscription unvalidated."""
    response = client.post(
        "/webhooks/exact-online",
        content=b"",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 200
