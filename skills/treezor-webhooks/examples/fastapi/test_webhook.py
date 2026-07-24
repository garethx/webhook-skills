import os
import json
import hmac
import hashlib
import base64

# Set test environment variables before importing app
os.environ["TREEZOR_WEBHOOK_SECRET"] = "test_webhook_secret"

from fastapi.testclient import TestClient
from main import app, canonicalize, verify_treezor_webhook

client = TestClient(app)
SECRET = os.environ["TREEZOR_WEBHOOK_SECRET"]


def sign(object_payload, secret: str) -> str:
    """Generate a valid Treezor object_payload_signature for testing, using the
    same canonical serialization the handler verifies against."""
    return base64.b64encode(
        hmac.new(
            secret.encode("utf-8"),
            canonicalize(object_payload).encode("utf-8"),
            hashlib.sha256,
        ).digest()
    ).decode("utf-8")


def build_event(webhook: str, object_payload: dict) -> str:
    return json.dumps({
        "webhook": webhook,
        "webhook_id": "6f3b3f9e-1c2d-4a5b-8e7f-0a1b2c3d4e5f",
        "webhook_created_at": "1690000000.0000",
        "object": webhook.split(".")[0],
        "object_id": str(object_payload.get("id", "1")),
        "object_payload": object_payload,
        "object_payload_signature": sign(object_payload, SECRET),
    })


class TestCanonicalize:
    def test_compact_separators(self):
        assert canonicalize({"a": 1, "b": 2}) == '{"a":1,"b":2}'

    def test_escapes_forward_slashes(self):
        assert canonicalize({"iban": "a/b"}) == '{"iban":"a\\/b"}'

    def test_escapes_non_ascii(self):
        assert canonicalize({"name": "Élodie"}) == '{"name":"\\u00c9lodie"}'


class TestVerifyTreezorWebhook:
    def test_valid_signature_returns_true(self):
        payload = {"payinId": 123, "amount": "42.00"}
        assert verify_treezor_webhook(payload, sign(payload, SECRET), SECRET) is True

    def test_invalid_signature_returns_false(self):
        assert verify_treezor_webhook({"id": 1}, "not-a-signature", SECRET) is False

    def test_missing_signature_returns_false(self):
        assert verify_treezor_webhook({"id": 1}, "", SECRET) is False

    def test_wrong_secret_returns_false(self):
        payload = {"id": 1}
        assert verify_treezor_webhook(payload, sign(payload, SECRET), "wrong_secret") is False

    def test_tampered_payload_returns_false(self):
        signature = sign({"amount": "10.00"}, SECRET)
        assert verify_treezor_webhook({"amount": "999.00"}, signature, SECRET) is False

    def test_non_ascii_payload_verifies(self):
        payload = {"holder": "José", "city": "Château"}
        assert verify_treezor_webhook(payload, sign(payload, SECRET), SECRET) is True


class TestTreezorWebhook:
    def test_invalid_json_returns_400(self):
        response = client.post(
            "/webhooks/treezor",
            content="not json",
            headers={"Content-Type": "text/plain"},
        )
        assert response.status_code == 400
        assert "Invalid JSON" in response.json()["detail"]

    def test_missing_signature_returns_400(self):
        event = json.loads(build_event("payin.create", {"id": 123}))
        del event["object_payload_signature"]
        response = client.post(
            "/webhooks/treezor",
            content=json.dumps(event),
            headers={"Content-Type": "text/plain"},
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_invalid_signature_returns_400(self):
        event = json.loads(build_event("payin.create", {"id": 123}))
        event["object_payload_signature"] = "invalid"
        response = client.post(
            "/webhooks/treezor",
            content=json.dumps(event),
            headers={"Content-Type": "text/plain"},
        )
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        body = build_event("payin.create", {"payinId": 123, "amount": "42.00", "currency": "EUR"})
        response = client.post(
            "/webhooks/treezor",
            content=body,
            headers={"Content-Type": "text/plain"},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_handles_documented_events(self):
        events = [
            "payin.create",
            "payin.update",
            "payout.create",
            "payout.update",
            "transfer.create",
            "transaction.create",
            "cardtransaction.create",
            "card.create",
            "card.update",
            "wallet.create",
            "user.create",
            "user.update",
            "user.kycreview",
        ]
        for name in events:
            body = build_event(name, {"id": 456})
            response = client.post(
                "/webhooks/treezor",
                content=body,
                headers={"Content-Type": "text/plain"},
            )
            assert response.status_code == 200, f"Failed for event: {name}"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
