import base64
import hashlib
import hmac
import json
import os
import time

from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["SANITY_WEBHOOK_SECRET"] = "test_webhook_secret"

from main import app

client = TestClient(app)

WEBHOOK_SECRET = os.environ["SANITY_WEBHOOK_SECRET"]


def generate_sanity_signature(payload: str, secret: str) -> str:
    """Generate a valid Sanity webhook signature for testing.

    Matches @sanity/webhook: HMAC-SHA256 over `${timestamp}.${payload}` where the
    timestamp is in MILLISECONDS, base64url-encoded with no padding, formatted as
    `t=<timestamp>,v1=<signature>`.
    """
    timestamp = int(time.time() * 1000)  # milliseconds
    signed_payload = f"{timestamp}.{payload}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).digest()
    signature = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
    return f"t={timestamp},v1={signature}"


class TestSanityWebhook:
    """Tests for the Sanity webhook endpoint."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/sanity",
            content='{"_type":"post","_id":"abc"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400
        assert "Missing sanity-webhook-signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        payload = json.dumps({"_type": "post", "_id": "abc"})
        response = client.post(
            "/webhooks/sanity",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "sanity-webhook-signature": "t=1609459200000,v1=invalid_signature",
            },
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_tampered_payload_returns_400(self):
        original_payload = json.dumps({"_type": "post", "_id": "abc"})
        signature = generate_sanity_signature(original_payload, WEBHOOK_SECRET)
        tampered_payload = json.dumps({"_type": "post", "_id": "hacked"})
        response = client.post(
            "/webhooks/sanity",
            content=tampered_payload,
            headers={
                "Content-Type": "application/json",
                "sanity-webhook-signature": signature,
            },
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = json.dumps({"_type": "post", "_id": "abc", "_rev": "r1"})
        signature = generate_sanity_signature(payload, WEBHOOK_SECRET)
        response = client.post(
            "/webhooks/sanity",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "sanity-webhook-signature": signature,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_different_document_types(self):
        types = ["post", "author", "product", "category", "page", "unknownType"]
        for doc_type in types:
            payload = json.dumps({"_type": doc_type, "_id": f"{doc_type}_1"})
            signature = generate_sanity_signature(payload, WEBHOOK_SECRET)
            response = client.post(
                "/webhooks/sanity",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "sanity-webhook-signature": signature,
                },
            )
            assert response.status_code == 200, f"Failed for document type: {doc_type}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
