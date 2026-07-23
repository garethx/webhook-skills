import os
import json
import time
import hmac
import base64
import hashlib
import pathlib

# Set test environment variables before importing the app
os.environ["POLAR_WEBHOOK_SECRET"] = "polar_whs_test_secret"

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
webhook_secret = os.environ["POLAR_WEBHOOK_SECRET"]

# A complete, schema-valid `order.paid` payload (matches the polar-sdk parser).
ORDER_PAID_FIXTURE = (
    pathlib.Path(__file__).parent / "fixtures" / "order-paid.json"
).read_text()


def generate_polar_headers(payload: str, secret: str, *, webhook_id="msg_test_123", timestamp=None):
    """Generate valid Standard Webhooks headers, exactly as Polar signs.

    Signed content: `{id}.{timestamp}.{payload}`.
    Signature: base64(HMAC-SHA256(key, signed_content)), where key is the raw UTF-8
    bytes of the dashboard secret (the SDK base64-encodes the secret, which the
    verifier base64-decodes back). Header value is `v1,<signature>`.
    """
    ts = timestamp or str(int(time.time()))
    signed_content = f"{webhook_id}.{ts}.{payload}".encode("utf-8")
    signature = base64.b64encode(
        hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()
    ).decode()
    return {
        "webhook-id": webhook_id,
        "webhook-timestamp": ts,
        "webhook-signature": f"v1,{signature}",
    }


class TestPolarWebhook:
    """Tests for the Polar webhook endpoint."""

    def test_missing_signature_returns_400(self):
        response = client.post(
            "/webhooks/polar",
            content="{}",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_invalid_signature_returns_400(self):
        response = client.post(
            "/webhooks/polar",
            content=ORDER_PAID_FIXTURE,
            headers={
                "Content-Type": "application/json",
                "webhook-id": "msg_test_123",
                "webhook-timestamp": str(int(time.time())),
                "webhook-signature": "v1,invalidsignature",
            },
        )
        assert response.status_code == 400

    def test_tampered_payload_returns_400(self):
        headers = generate_polar_headers(ORDER_PAID_FIXTURE, webhook_secret)
        tampered = dict(json.loads(ORDER_PAID_FIXTURE))
        tampered["data"] = {**tampered["data"], "total_amount": 999999}

        response = client.post(
            "/webhooks/polar",
            content=json.dumps(tampered),
            headers={"Content-Type": "application/json", **headers},
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        headers = generate_polar_headers(ORDER_PAID_FIXTURE, webhook_secret)
        response = client.post(
            "/webhooks/polar",
            content=ORDER_PAID_FIXTURE,
            headers={"Content-Type": "application/json", **headers},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_old_timestamp_rejected(self):
        old_ts = str(int(time.time()) - 60 * 60)
        headers = generate_polar_headers(ORDER_PAID_FIXTURE, webhook_secret, timestamp=old_ts)
        response = client.post(
            "/webhooks/polar",
            content=ORDER_PAID_FIXTURE,
            headers={"Content-Type": "application/json", **headers},
        )
        assert response.status_code == 400

    def test_unknown_event_acknowledged(self):
        # Valid signature, but an event type this SDK version does not model.
        payload = json.dumps({"type": "some.future.event", "data": {"id": "obj_123"}})
        headers = generate_polar_headers(payload, webhook_secret)
        response = client.post(
            "/webhooks/polar",
            content=payload,
            headers={"Content-Type": "application/json", **headers},
        )
        # 2xx so Polar does not retry and eventually auto-disable the endpoint.
        assert 200 <= response.status_code < 300


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
