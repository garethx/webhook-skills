import os
import json
import time
import hmac
import hashlib
import base64
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["WALMART_WEBHOOK_SECRET"] = "test_walmart_secret"

from main import app, verify_walmart_webhook, is_timestamp_fresh

client = TestClient(app)

SECRET = os.environ["WALMART_WEBHOOK_SECRET"]
PATH = "/webhooks/walmart"


def generate_walmart_signature(path_with_query: str, timestamp: str, body: bytes, secret: str, method: str = "POST") -> str:
    """Generate a valid Walmart signature for testing, mirroring Walmart's algorithm."""
    body_hash = hashlib.sha256(body).hexdigest()
    string_to_sign = "\n".join([method.upper(), path_with_query, timestamp, body_hash])
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")


def now_seconds() -> str:
    return str(int(time.time()))


class TestVerifyWalmartWebhook:
    """Tests for the Walmart signature verification function."""

    def test_valid_signature_returns_true(self):
        timestamp = now_seconds()
        body = b'{"eventType":"PO_CREATED"}'
        signature = generate_walmart_signature(PATH, timestamp, body, SECRET)
        assert verify_walmart_webhook("POST", PATH, timestamp, body, signature, SECRET) is True

    def test_invalid_signature_returns_false(self):
        timestamp = now_seconds()
        assert verify_walmart_webhook("POST", PATH, timestamp, b"{}", "nope", SECRET) is False

    def test_tampered_body_returns_false(self):
        timestamp = now_seconds()
        body = b'{"eventType":"PO_CREATED","amount":100}'
        signature = generate_walmart_signature(PATH, timestamp, body, SECRET)
        assert verify_walmart_webhook("POST", PATH, timestamp, b'{"eventType":"PO_CREATED","amount":999}', signature, SECRET) is False

    def test_wrong_secret_returns_false(self):
        timestamp = now_seconds()
        body = b'{"eventType":"PO_CREATED"}'
        signature = generate_walmart_signature(PATH, timestamp, body, SECRET)
        assert verify_walmart_webhook("POST", PATH, timestamp, body, signature, "wrong") is False

    def test_query_string_is_bound_to_signature(self):
        timestamp = now_seconds()
        path_with_query = f"{PATH}?tenant=abc"
        body = b'{"eventType":"PO_CREATED"}'
        signature = generate_walmart_signature(path_with_query, timestamp, body, SECRET)
        assert verify_walmart_webhook("POST", path_with_query, timestamp, body, signature, SECRET) is True
        # Dropping the query string must invalidate the same signature
        assert verify_walmart_webhook("POST", PATH, timestamp, body, signature, SECRET) is False

    def test_missing_headers_return_false(self):
        assert verify_walmart_webhook("POST", PATH, None, b"{}", None, SECRET) is False


class TestIsTimestampFresh:
    def test_current_timestamp_is_fresh(self):
        assert is_timestamp_fresh(now_seconds()) is True

    def test_old_timestamp_is_stale(self):
        assert is_timestamp_fresh(str(int(time.time()) - 10 * 60)) is False

    def test_non_numeric_timestamp_is_stale(self):
        assert is_timestamp_fresh("not-a-number") is False


class TestWalmartWebhookEndpoint:
    def _headers(self, timestamp=None, signature=None):
        headers = {"Content-Type": "application/json"}
        if timestamp is not None:
            headers["WM_SEC.TIMESTAMP"] = str(timestamp)
        if signature is not None:
            headers["WM_SEC.SIGNATURE"] = signature
        return headers

    def test_missing_signature_returns_400(self):
        response = client.post(PATH, content=b'{"eventType":"PO_CREATED"}', headers=self._headers(timestamp=int(time.time())))
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        response = client.post(
            PATH, content=b'{"eventType":"PO_CREATED"}',
            headers=self._headers(timestamp=int(time.time()), signature="invalid"),
        )
        assert response.status_code == 400

    def test_stale_timestamp_returns_400(self):
        timestamp = str(int(time.time()) - 10 * 60)
        body = b'{"eventType":"PO_CREATED"}'
        signature = generate_walmart_signature(PATH, timestamp, body, SECRET)
        response = client.post(PATH, content=body, headers=self._headers(timestamp=timestamp, signature=signature))
        assert response.status_code == 400
        assert "Stale timestamp" in response.json()["detail"]

    def test_valid_signature_returns_200(self):
        timestamp = now_seconds()
        body = json.dumps({
            "eventType": "PO_CREATED", "resourceName": "ORDER",
            "sellerId": "123", "resource": {"purchaseOrderId": "PO-1"},
        }).encode("utf-8")
        signature = generate_walmart_signature(PATH, timestamp, body, SECRET)
        response = client.post(PATH, content=body, headers=self._headers(timestamp=timestamp, signature=signature))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_documented_event_types(self):
        event_types = [
            "PO_CREATED", "PO_LINE_AUTOCANCELLED", "INTENT_TO_CANCEL", "INVENTORY_OOS",
            "OFFER_PUBLISHED", "OFFER_UNPUBLISHED", "BUY_BOX_CHANGED", "RETURN_CREATED",
            "REPORT_STATUS", "SELLER_PERFORMANCE_ALARMS",
        ]
        for event_type in event_types:
            timestamp = now_seconds()
            body = json.dumps({"eventType": event_type, "resourceName": "ORDER", "sellerId": "123", "resource": {}}).encode("utf-8")
            signature = generate_walmart_signature(PATH, timestamp, body, SECRET)
            response = client.post(PATH, content=body, headers=self._headers(timestamp=timestamp, signature=signature))
            assert response.status_code == 200, f"Failed for event type: {event_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
